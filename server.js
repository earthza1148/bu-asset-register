const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const PHOTOS_DIR = path.join(DATA_DIR, 'photos');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Ensure directories exist (graceful fallback on read-only serverless filesystems)
try {
  fs.mkdirSync(PHOTOS_DIR, { recursive: true });
} catch (e) {}

// In-memory state cache
let dbCache = null;
let configCache = null;
let isReadOnlyFs = !!process.env.VERCEL;
const memoryPhotos = new Map(); // Fallback for serverless read-only environments
const activeSessions = new Map();

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const hasCloudDb = !!(REDIS_URL && REDIS_TOKEN);

async function redisCommand(commandArray) {
  if (!hasCloudDb) return null;
  try {
    const res = await fetch(REDIS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(commandArray)
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.result ?? null;
  } catch (e) {
    console.error('Redis error:', e.message);
    return null;
  }
}

function loadConfig() {
  if (configCache) return configCache;
  const defaults = {
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    requireAuth: process.env.REQUIRE_AUTH !== 'false', // Require Google login by default
    allowedDomains: [], // e.g. ['bu.ac.th', 'gmail.com']
    aiProvider: process.env.GEMINI_API_KEY ? 'gemini' : (process.env.GROQ_API_KEY ? 'groq' : 'local'),
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    groqApiKey: process.env.GROQ_API_KEY || '',
    storageMode: 'json-folder', // 'json-folder' | 'cloud-hybrid'
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseKey: process.env.SUPABASE_SERVICE_KEY || ''
  };
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      configCache = { ...defaults, ...raw };
    } else {
      configCache = defaults;
    }
  } catch (e) {
    configCache = defaults;
  }
  return configCache;
}

function saveConfig(newConfig) {
  configCache = { ...loadConfig(), ...newConfig };
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(configCache, null, 2), 'utf8');
  } catch (e) {
    isReadOnlyFs = true;
  }
  return configCache;
}

function loadDb() {
  if (dbCache) return dbCache;
  try {
    if (fs.existsSync(DB_FILE)) {
      dbCache = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      if (!Array.isArray(dbCache.assets)) dbCache.assets = [];
      if (!Array.isArray(dbCache.events)) dbCache.events = [];
      if (!Array.isArray(dbCache.users)) dbCache.users = [];
      return dbCache;
    }
  } catch (e) {
    console.error('Error loading db.json:', e.message);
  }
  try {
    const brPath = path.join(DATA_DIR, 'db.br');
    if (fs.existsSync(brPath)) {
      const parsed = JSON.parse(zlib.brotliDecompressSync(fs.readFileSync(brPath)).toString('utf8'));
      if (parsed && Array.isArray(parsed.assets)) {
        dbCache = parsed;
        return dbCache;
      }
    }
  } catch (e) {}
  try {
    const bundled = require('./data/db.json');
    if (bundled && Array.isArray(bundled.assets)) {
      dbCache = JSON.parse(JSON.stringify(bundled));
      return dbCache;
    }
  } catch (e) {}
  dbCache = {
    version: 2,
    exportedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    assets: [],
    events: [],
    users: [
      { id: 'user-earth', name: 'PUNYANUCH.B', email: 'earth7137@gmail.com', role: 'admin', provider: 'google' },
      { id: 'user-sarawut', name: 'SARAWUT', email: 'sarawut.th@bu.ac.th', role: 'admin', provider: 'google' }
    ]
  };
  return dbCache;
}

function saveDb() {
  if (!dbCache) return;
  dbCache.updatedAt = new Date().toISOString();
  try {
    const tmpFile = DB_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(dbCache, null, 2), 'utf8');
    fs.renameSync(tmpFile, DB_FILE);
  } catch (e) {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(dbCache, null, 2), 'utf8');
    } catch (err) {
      isReadOnlyFs = true;
    }
  }
}

async function loadDbAsync() {
  if (hasCloudDb) {
    const raw = await redisCommand(['GET', 'bu_asset_db']);
    if (raw) {
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (parsed && Array.isArray(parsed.assets)) {
          let patched = false;
          for (const a of parsed.assets) {
            if (a.receivedDate === '1969-10-27' && String(a.id || '').startsWith('format-import-v1:')) {
              a.receivedDate = '2026-10-27';
              patched = true;
            }
          }
          dbCache = parsed;
          if (patched) {
            await redisCommand(['SET', 'bu_asset_db', JSON.stringify(dbCache)]);
          }
          return dbCache;
        }
      } catch (e) {}
    }
    const seeded = loadDb();
    await redisCommand(['SET', 'bu_asset_db', JSON.stringify(seeded)]);
    return seeded;
  }
  return loadDb();
}

async function saveDbAsync() {
  saveDb();
  if (hasCloudDb && dbCache) {
    await redisCommand(['SET', 'bu_asset_db', JSON.stringify(dbCache)]);
  }
}

function addEvent(action, asset, user, extraSnapshot = null) {
  const db = loadDb();
  const snapshotObj = extraSnapshot || (asset ? {
    receivedDate: asset.receivedDate || '',
    createdBy: asset.createdBy || '',
    taggingPeople: asset.taggingPeople || [],
    po: asset.po || '',
    assetNo: asset.assetNo || '',
    description: asset.description || '',
    location: asset.location || '',
    locationSap: asset.locationSap || '',
    quantity: asset.quantity ?? 1,
    status: asset.status || 'On Process',
    remark: asset.remark || '',
    contact: asset.contact || '',
    imageRoom: asset.imageRoom || '',
    imageAsset: asset.imageAsset || '',
    taggedAt: asset.taggedAt || null,
    checkedAt: asset.checkedAt || null,
    deletedAt: asset.deletedAt || null
  } : {});

  const ev = {
    id: crypto.randomUUID(),
    assetId: asset ? asset.id : '',
    action,
    actor: user?.name || 'PUNYANUCH.B',
    actorEmail: user?.email || 'earth7137@gmail.com',
    createdAt: new Date().toISOString(),
    snapshot: JSON.stringify(snapshotObj)
  };
  db.events.unshift(ev);
  return ev;
}

function parseCookies(req) {
  const list = {};
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    let [name, ...rest] = cookie.split('=');
    name = name?.trim();
    if (!name) return;
    const value = rest.join('=').trim();
    if (!value) return;
    list[name] = decodeURIComponent(value);
  });
  return list;
}

function getCurrentUser(req) {
  const cookies = parseCookies(req);
  const token = cookies['bu_asset_session'] || req.headers['x-session-token'];
  if (token && activeSessions.has(token)) {
    return activeSessions.get(token);
  }
  if (cookies['bu_asset_user']) {
    try {
      return JSON.parse(Buffer.from(cookies['bu_asset_user'], 'base64').toString('utf8'));
    } catch (e) {}
  }
  const cfg = loadConfig();
  if (cfg.requireAuth) return null;
  return {
    id: 'user-earth',
    name: 'PUNYANUCH.B',
    email: 'earth7137@gmail.com',
    picture: '',
    role: 'admin',
    provider: 'google'
  };
}

function readBodyBuffer(req, maxBytes = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', chunk => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJsonBody(req) {
  const buf = await readBodyBuffer(req);
  if (!buf.length) return {};
  return JSON.parse(buf.toString('utf8'));
}

function sendJson(res, status, data, extraHeaders = {}) {
  const payload = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(payload);
}

// Parse multipart/form-data for file upload
function parseMultipart(buffer, boundary) {
  const parts = {};
  const boundaryBytes = Buffer.from(`--${boundary}`);
  let start = buffer.indexOf(boundaryBytes);
  while (start !== -1) {
    const nextStart = buffer.indexOf(boundaryBytes, start + boundaryBytes.length);
    if (nextStart === -1) break;
    const partBuf = buffer.subarray(start + boundaryBytes.length + 2, nextStart - 2);
    const headerEnd = partBuf.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd !== -1) {
      const headerStr = partBuf.subarray(0, headerEnd).toString('utf8');
      const bodyBuf = partBuf.subarray(headerEnd + 4);
      const nameMatch = headerStr.match(/name="([^"]+)"/);
      const filenameMatch = headerStr.match(/filename="([^"]+)"/);
      const typeMatch = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);
      if (nameMatch) {
        const fieldName = nameMatch[1];
        if (filenameMatch) {
          parts[fieldName] = {
            filename: filenameMatch[1],
            contentType: typeMatch ? typeMatch[1].trim() : 'application/octet-stream',
            data: bodyBuf
          };
        } else {
          parts[fieldName] = bodyBuf.toString('utf8');
        }
      }
    }
    start = nextStart;
  }
  return parts;
}

// Verify Google ID Token via Google TokenInfo endpoint or decode JWT
function verifyGoogleIdToken(idToken) {
  return new Promise((resolve, reject) => {
    const req = https.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (res.statusCode === 200 && data.email) {
            resolve({
              id: 'google-' + (data.sub || crypto.randomUUID()),
              name: data.name || data.email.split('@')[0].toUpperCase(),
              email: data.email,
              picture: data.picture || '',
              role: 'admin',
              provider: 'google',
              verified: true
            });
          } else {
            reject(new Error(data.error_description || 'Invalid Google token'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', err => {
      // Fallback: decode JWT payload if offline
      try {
        const parts = idToken.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
          if (payload.email) {
            return resolve({
              id: 'google-' + (payload.sub || crypto.randomUUID()),
              name: payload.name || payload.email.split('@')[0].toUpperCase(),
              email: payload.email,
              picture: payload.picture || '',
              role: 'admin',
              provider: 'google',
              verified: true
            });
          }
        }
      } catch (e) {}
      reject(err);
    });
  });
}

// Smart Local + AI Assistant Engine
function runLocalAssistant(question, preset, db) {
  const activeAssets = db.assets.filter(a => !a.deletedAt);
  const doneAssets = activeAssets.filter(a => a.status === 'Done');
  const pendingAssets = activeAssets.filter(a => a.status !== 'Done');
  const missingCodeAssets = activeAssets.filter(a => !a.assetNo || !a.assetNo.trim());
  const noPhotoAssets = activeAssets.filter(a => !a.photos || a.photos.length === 0);
  const totalQty = activeAssets.reduce((sum, a) => sum + (Number(a.quantity) || 0), 0);
  const doneQty = doneAssets.reduce((sum, a) => sum + (Number(a.quantity) || 0), 0);
  const asOf = new Date().toISOString();

  const q = (question || '').trim().toLowerCase();

  // Preset 1: summary
  if (preset === 'summary' || /สรุปทรัพย์สินทั้งหมด|สรุปภาพรวม|ทั้งหมดกี่/.test(q)) {
    const byStatus = [
      { label: 'ติดรหัสแล้ว (Done)', records: doneAssets.length, quantity: doneQty },
      { label: 'กำลังดำเนินการ (On Process)', records: pendingAssets.filter(a => a.status === 'On Process').length, quantity: pendingAssets.filter(a => a.status === 'On Process').reduce((s, a) => s + (a.quantity || 0), 0) },
      { label: 'ต้องตรวจสอบ (Needs Review)', records: pendingAssets.filter(a => a.status === 'Needs Review').length, quantity: pendingAssets.filter(a => a.status === 'Needs Review').reduce((s, a) => s + (a.quantity || 0), 0) },
      { label: 'ยังไม่ระบุรหัสทรัพย์สิน', records: missingCodeAssets.length, quantity: missingCodeAssets.reduce((s, a) => s + (a.quantity || 0), 0) },
      { label: 'ยังไม่มีรูปถ่าย', records: noPhotoAssets.length, quantity: noPhotoAssets.reduce((s, a) => s + (a.quantity || 0), 0) }
    ];
    return {
      mode: 'smart-db',
      text: `ปัจจุบันมีทรัพย์สินทั้งหมด ${activeAssets.length.toLocaleString()} รายการ (รวม ${totalQty.toLocaleString()} ชิ้น) ติดรหัสเรียบร้อยแล้ว ${doneAssets.length.toLocaleString()} รายการ (${Math.round((doneAssets.length / (activeAssets.length || 1)) * 100)}%) และมีงานรอดำเนินการ ${pendingAssets.length.toLocaleString()} รายการ`,
      interpretation: 'สรุปยอดรวมทรัพย์สินทั้งหมดแยกตามสถานะการดำเนินงาน',
      groups: byStatus,
      sources: activeAssets.slice(0, 6),
      events: [],
      total: activeAssets.length,
      asOf
    };
  }

  // Preset 2: pending by room
  if (preset === 'pending' || /ห้องไหนยังติดรหัสไม่ครบ|รอดำเนินการ|ยังไม่ได้ติด/.test(q)) {
    const locMap = new Map();
    for (const a of pendingAssets) {
      const loc = a.location || a.locationSap || 'ไม่ระบุสถานที่';
      const cur = locMap.get(loc) || { label: loc, records: 0, quantity: 0 };
      cur.records += 1;
      cur.quantity += Number(a.quantity) || 0;
      locMap.set(loc, cur);
    }
    const groups = [...locMap.values()].sort((a, b) => b.records - a.records).slice(0, 12);
    return {
      mode: 'smart-db',
      text: `มีรายการที่ยังรอดำเนินการทั้งหมด ${pendingAssets.length.toLocaleString()} รายการ (รวม ${pendingAssets.reduce((s, a) => s + (a.quantity || 0), 0).toLocaleString()} ชิ้น) กระจายอยู่ใน ${locMap.size} สถานที่/ห้อง`,
      interpretation: 'กรองเฉพาะสถานะ On Process / Needs Review และจัดกลุ่มตามสถานที่',
      groups,
      sources: pendingAssets.slice(0, 8),
      events: [],
      total: pendingAssets.length,
      asOf
    };
  }

  // Preset 3: missing asset code
  if (preset === 'missing' || /ไม่มีรหัส|ยังไม่ระบุรหัส/.test(q)) {
    return {
      mode: 'smart-db',
      text: `พบทรัพย์สินที่ยังไม่ได้ระบุรหัสทรัพย์สินจำนวน ${missingCodeAssets.length.toLocaleString()} รายการ (รวม ${missingCodeAssets.reduce((s, a) => s + (a.quantity || 0), 0).toLocaleString()} ชิ้น)`,
      interpretation: 'กรองรายการที่ช่อง Asset No. ว่างเปล่า',
      groups: missingCodeAssets.map(a => ({
        label: `${a.description} (${a.location || 'ไม่ระบุห้อง'})`,
        records: 1,
        quantity: a.quantity || 0
      })),
      sources: missingCodeAssets.slice(0, 10),
      events: [],
      total: missingCodeAssets.length,
      asOf
    };
  }

  // Preset 4: recent history
  if (preset === 'history' || /ใครแก้ไข|ประวัติ|ล่าสุด/.test(q)) {
    const recentEvents = (db.events || []).slice(0, 10).map(e => {
      let desc = '';
      try {
        desc = JSON.parse(e.snapshot)?.description || '';
      } catch (err) {}
      return {
        id: e.id,
        assetId: e.assetId,
        action: e.action,
        description: desc || 'รายการทรัพย์สิน',
        actor: e.actor,
        actorEmail: e.actorEmail,
        createdAt: e.createdAt
      };
    });
    const actorMap = new Map();
    for (const e of (db.events || [])) {
      const key = `${e.actor} (${e.actorEmail || 'N/A'})`;
      const cur = actorMap.get(key) || { label: key, records: 0, quantity: 0 };
      cur.records += 1;
      actorMap.set(key, cur);
    }
    return {
      mode: 'smart-db',
      text: `บันทึกกิจกรรมในระบบทั้งหมด ${(db.events || []).length.toLocaleString()} รายการ โดยกิจกรรมล่าสุดดำเนินการโดย ${recentEvents[0]?.actor || 'ผู้ดูแลระบบ'}`,
      interpretation: 'ดึงประวัติการทำงานล่าสุดจาก Audit Log',
      groups: [...actorMap.values()].sort((a, b) => b.records - a.records).slice(0, 8),
      sources: [],
      events: recentEvents,
      total: (db.events || []).length,
      asOf
    };
  }

  // General keyword / natural language search across assets
  const tokens = q
    .replace(/(ห้อง|อาคาร|ตึก|มีทรัพย์สิน|กี่ชิ้น|กี่รายการ|อะไรบ้าง|อยู่ที่ไหน|ค้นหา|ขอดู|ทั้งหมด|ครับ|ค่ะ|\?)/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 1);

  let matched = activeAssets;
  if (tokens.length > 0) {
    matched = activeAssets.filter(a => {
      const hay = [
        a.description,
        a.assetNo,
        a.location,
        a.locationSap,
        a.po,
        a.remark,
        a.contact,
        a.createdBy,
        ...(a.taggingPeople || [])
      ].join(' ').toLowerCase();
      return tokens.every(tk => hay.includes(tk));
    });
  }

  const locGroups = new Map();
  for (const a of matched) {
    const loc = a.location || a.locationSap || 'ไม่ระบุสถานที่';
    const cur = locGroups.get(loc) || { label: loc, records: 0, quantity: 0 };
    cur.records += 1;
    cur.quantity += Number(a.quantity) || 0;
    locGroups.set(loc, cur);
  }

  const matchedQty = matched.reduce((s, a) => s + (Number(a.quantity) || 0), 0);
  const doneInMatched = matched.filter(a => a.status === 'Done').length;

  return {
    mode: 'smart-db',
    text: matched.length > 0
      ? `พบข้อมูลที่ตรงกับ "${question}" จำนวน ${matched.length.toLocaleString()} รายการ (รวม ${matchedQty.toLocaleString()} ชิ้น) — ติดรหัสแล้ว ${doneInMatched} รายการ, รอดำเนินการ ${matched.length - doneInMatched} รายการ`
      : `ไม่พบรายการที่ตรงกับคำค้น "${question}" ในฐานข้อมูลปัจจุบัน ลองระบุชื่ออาคาร (เช่น A5, B4, C3), ชื่ออุปกรณ์, เลข PO หรือชื่อผู้ติดรหัสอีกครั้ง`,
    interpretation: tokens.length > 0 ? `ค้นหาจากคำสำคัญ: ${tokens.join(', ')}` : 'แสดงข้อมูลทั้งหมด',
    groups: [...locGroups.values()].sort((a, b) => b.records - a.records).slice(0, 10),
    sources: matched.slice(0, 8),
    events: [],
    total: matched.length,
    asOf
  };
}

// Excel Import Grouping Helper (matches original BU Asset Format sheet spec)
function processExcelRows(rows, existingAssets) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('ไม่พบแถวข้อมูลในชีต Format');
  }
  const groupMap = new Map();
  for (const r of rows) {
    const assetNo = String(r.assetNo ?? '').trim();
    const description = String(r.description ?? '').trim();
    if (!assetNo && !description) continue;
    const po = String(r.po ?? '').trim();
    const key = JSON.stringify([po, description]);
    const list = groupMap.get(key) || [];
    list.push({
      row: r.row || 0,
      assetNo,
      description,
      receivedDate: String(r.receivedDate ?? '').trim(),
      po,
      locationSap: String(r.locationSap ?? '').trim(),
      createdBy: String(r.createdBy ?? '').trim()
    });
    groupMap.set(key, list);
  }

  const existingKeys = new Set(
    existingAssets
      .filter(a => !a.deletedAt)
      .map(a => `${String(a.po || '').trim()}:::${String(a.description || '').trim()}`)
  );

  const groups = [];
  const skippedIndexes = [];

  let idx = 0;
  for (const list of groupMap.values()) {
    const uniq = field => [...new Set(list.map(x => String(x[field] || '')).filter(Boolean))];
    const codes = list.map(x => x.assetNo).filter(Boolean);
    const dates = uniq('receivedDate');
    const warnings = [];
    if (dates.length > 1) {
      warnings.push('วันที่ได้รับหลายวัน: ใช้วันแรกที่พบ และเก็บวันทั้งหมดในหมายเหตุ');
    }
    if (['locationSap', 'createdBy'].some(f => uniq(f).length > 1)) {
      warnings.push('มีสถานที่ SAP / ผู้สร้างหลายค่า: เก็บทุกค่าโดยคั่นด้วย /');
    }

    const mergedAssetNo = codes.length <= 1 ? (codes[0] || '') : `${codes[0]}-${codes[codes.length - 1]}`;
    const data = {
      assetNo: mergedAssetNo,
      description: list[0].description,
      quantity: list.length,
      receivedDate: dates[0] || new Date().toISOString().slice(0, 10),
      po: list[0].po,
      locationSap: uniq('locationSap').join(' / '),
      createdBy: uniq('createdBy').join(' / ') || 'PUNYANUCH.B',
      status: 'On Process',
      location: uniq('locationSap').join(' / '),
      taggingPeople: [],
      contact: '',
      imageRoom: '',
      imageAsset: '',
      remark: dates.length > 1 ? `วันที่ได้รับจาก Excel: ${dates.join(', ')}` : '',
      sourceSheet: 'Format',
      sourceRow: list[0].row,
      sourceValues: {
        'แถวต้นฉบับ': list.map(x => x.row).join(', '),
        'รหัสทรัพย์สินทั้งหมด': codes.join(', '),
        'ข้อมูลแต่ละแถว': list
      }
    };

    const dupKey = `${data.po}:::${data.description}`;
    if (existingKeys.has(dupKey)) {
      skippedIndexes.push(idx);
    }
    groups.push({
      data,
      rows: list.map(x => x.row),
      warnings
    });
    idx++;
  }

  return {
    totalRows: rows.length,
    groups,
    skippedIndexes,
    imported: skippedIndexes.length === groups.length && groups.length > 0
  };
}

// Main HTTP Request Handler
async function requestHandler(req, res) {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // CORS headers for API flexibility
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-Token');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    // 1. Auth & Config Endpoints
    if (pathname === '/api/auth/session' && req.method === 'GET') {
      const cfg = loadConfig();
      const user = getCurrentUser(req);
      return sendJson(res, 200, {
        authenticated: !!user,
        user,
        googleClientId: cfg.googleClientId,
        requireAuth: cfg.requireAuth,
        storageMode: hasCloudDb ? 'cloud-redis' : cfg.storageMode,
        hasCloudDb,
        isReadOnlyFs: isReadOnlyFs && !hasCloudDb
      });
    }

    if (pathname === '/api/auth/google' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const cfg = loadConfig();
      let user = null;

      if (body.credential) {
        // Real Google Identity Services ID Token
        user = await verifyGoogleIdToken(body.credential);
      } else if (body.email && !cfg.googleClientId) {
        // Fallback when Google Client ID is not yet configured
        user = {
          id: 'google-' + crypto.createHash('md5').update(body.email).digest('hex').slice(0, 12),
          name: body.name || body.email.split('@')[0].toUpperCase(),
          email: body.email,
          picture: body.picture || '',
          role: 'admin',
          provider: 'google',
          verified: false
        };
      } else {
        return sendJson(res, 400, { error: 'กรุณาเข้าสู่ระบบด้วยปุ่ม Sign in with Google ทางการ' });
      }

      const token = crypto.randomBytes(24).toString('hex');
      activeSessions.set(token, user);
      const userB64 = Buffer.from(JSON.stringify(user)).toString('base64');

      // Record user in db.users if new
      const db = loadDb();
      if (!db.users.some(u => u.email === user.email)) {
        db.users.push(user);
        saveDb();
      }

      return sendJson(res, 200, { ok: true, token, user }, {
        'Set-Cookie': [
          `bu_asset_session=${token}; Path=/; Max-Age=604800; SameSite=Lax`,
          `bu_asset_user=${userB64}; Path=/; Max-Age=604800; SameSite=Lax`
        ]
      });
    }

    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      const cookies = parseCookies(req);
      if (cookies['bu_asset_session']) {
        activeSessions.delete(cookies['bu_asset_session']);
      }
      return sendJson(res, 200, { ok: true }, {
        'Set-Cookie': [
          `bu_asset_session=; Path=/; Max-Age=0`,
          `bu_asset_user=; Path=/; Max-Age=0`
        ]
      });
    }

    if (pathname === '/api/config') {
      if (req.method === 'GET') {
        const cfg = loadConfig();
        const photosCount = fs.existsSync(PHOTOS_DIR)
          ? fs.readdirSync(PHOTOS_DIR).filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f)).length
          : 0;
        const db = loadDb();
        return sendJson(res, 200, {
          googleClientId: cfg.googleClientId,
          requireAuth: cfg.requireAuth,
          aiProvider: cfg.aiProvider,
          hasGeminiKey: !!cfg.geminiApiKey,
          hasGroqKey: !!cfg.groqApiKey,
          storageMode: cfg.storageMode,
          supabaseUrl: cfg.supabaseUrl,
          stats: {
            assetsCount: db.assets.length,
            eventsCount: db.events.length,
            photosCount,
            dbFilePath: 'data/db.json',
            photosFolderPath: 'data/photos/'
          }
        });
      }
      if (req.method === 'POST') {
        const body = await readJsonBody(req);
        const updated = saveConfig(body);
        return sendJson(res, 200, { ok: true, config: updated });
      }
    }

    // Enforce Google Login on protected API routes when requireAuth is enabled
    const protectedApiPaths = ['/api/data', '/api/photos', '/api/import', '/api/restore', '/api/assistant'];
    if (protectedApiPaths.includes(pathname)) {
      const cfg = loadConfig();
      const currentUser = getCurrentUser(req);
      if (cfg.requireAuth && !currentUser) {
        return sendJson(res, 401, { error: 'กรุณาเข้าสู่ระบบด้วย Google ก่อนใช้งาน' });
      }
    }

    // 2. Main Data & History Endpoint (/api/data)
    if (pathname === '/api/data') {
      const db = await loadDbAsync();
      const user = getCurrentUser(req) || { name: 'PUNYANUCH.B', email: 'earth7137@gmail.com' };

      if (req.method === 'GET') {
        const view = parsedUrl.searchParams.get('view');
        if (view === 'history') {
          const assetId = parsedUrl.searchParams.get('id');
          if (assetId) {
            const events = db.events.filter(e => e.assetId === assetId);
            return sendJson(res, 200, { events, total: events.length });
          }
          const mode = parsedUrl.searchParams.get('mode') || 'month';
          const period = parsedUrl.searchParams.get('period') || '';
          const page = Math.max(1, parseInt(parsedUrl.searchParams.get('page') || '1', 10));
          const pageSize = 40;

          let filtered = db.events;
          if (period && mode !== 'all') {
            filtered = db.events.filter(e => {
              if (!e.createdAt) return false;
              // Convert to Bangkok date YYYY-MM-DD
              const bkkDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date(e.createdAt));
              if (mode === 'day') return bkkDate === period;
              if (mode === 'month') return bkkDate.slice(0, 7) === period;
              if (mode === 'year') return bkkDate.slice(0, 4) === String(period);
              return true;
            });
          }
          const total = filtered.length;
          const slice = filtered.slice((page - 1) * pageSize, page * pageSize);
          return sendJson(res, 200, {
            events: slice,
            total,
            page,
            pageSize,
            totalPages: Math.max(1, Math.ceil(total / pageSize))
          });
        }

        return sendJson(res, 200, {
          assets: db.assets,
          user
        });
      }

      if (req.method === 'POST') {
        const body = await readJsonBody(req);
        const { action, id, data, ids, status } = body;
        const now = new Date().toISOString();

        if (action === 'create') {
          const newAsset = {
            id: crypto.randomUUID(),
            assetNo: String(data?.assetNo ?? '').trim(),
            description: String(data?.description ?? '').trim(),
            quantity: Math.max(0, Number(data?.quantity ?? 1)),
            status: data?.status || 'On Process',
            location: String(data?.location ?? '').trim(),
            locationSap: String(data?.locationSap ?? '').trim(),
            po: String(data?.po ?? '').trim(),
            receivedDate: data?.receivedDate || now.slice(0, 10),
            createdBy: String(data?.createdBy || user.name || 'PUNYANUCH.B').trim(),
            taggingPeople: Array.isArray(data?.taggingPeople) ? data.taggingPeople : [],
            contact: String(data?.contact ?? '').trim(),
            remark: String(data?.remark ?? '').trim(),
            imageRoom: String(data?.imageRoom ?? ''),
            imageAsset: String(data?.imageAsset ?? ''),
            photos: Array.isArray(data?.photos) ? data.photos : [],
            version: 1,
            createdAt: now,
            updatedAt: now,
            taggedAt: data?.status === 'Done' ? now : null,
            checkedAt: null,
            deletedAt: null
          };
          db.assets.unshift(newAsset);
          addEvent('เพิ่มทรัพย์สิน', newAsset, user);
          await saveDbAsync();
          return sendJson(res, 200, { ok: true, id: newAsset.id, asset: newAsset });
        }

        if (action === 'update') {
          const asset = db.assets.find(a => a.id === id);
          if (!asset) return sendJson(res, 404, { error: 'ไม่พบรายการทรัพย์สิน' });

          const prevStatus = asset.status;
          asset.assetNo = String(data?.assetNo ?? asset.assetNo).trim();
          asset.description = String(data?.description ?? asset.description).trim();
          asset.quantity = Math.max(0, Number(data?.quantity ?? asset.quantity));
          asset.status = data?.status || asset.status;
          asset.location = String(data?.location ?? asset.location).trim();
          asset.locationSap = String(data?.locationSap ?? asset.locationSap).trim();
          asset.po = String(data?.po ?? asset.po).trim();
          asset.receivedDate = data?.receivedDate ?? asset.receivedDate;
          asset.createdBy = String(data?.createdBy ?? asset.createdBy).trim();
          asset.taggingPeople = Array.isArray(data?.taggingPeople) ? data.taggingPeople : asset.taggingPeople;
          asset.contact = String(data?.contact ?? asset.contact).trim();
          asset.remark = String(data?.remark ?? asset.remark).trim();
          asset.updatedAt = now;
          asset.version = (asset.version || 1) + 1;

          if (asset.status === 'Done' && prevStatus !== 'Done' && !asset.taggedAt) {
            asset.taggedAt = now;
          } else if (asset.status !== 'Done') {
            asset.taggedAt = null;
          }

          addEvent('แก้ไขข้อมูล', asset, user);
          await saveDbAsync();
          return sendJson(res, 200, { ok: true, id: asset.id, asset });
        }

        if (action === 'check') {
          const asset = db.assets.find(a => a.id === id);
          if (!asset) return sendJson(res, 404, { error: 'ไม่พบรายการทรัพย์สิน' });
          asset.checkedAt = now;
          asset.updatedAt = now;
          asset.version = (asset.version || 1) + 1;
          addEvent('ตรวจเช็คหน้างาน', asset, user);
          await saveDbAsync();
          return sendJson(res, 200, { ok: true, id: asset.id, asset });
        }

        if (action === 'delete') {
          const asset = db.assets.find(a => a.id === id);
          if (!asset) return sendJson(res, 404, { error: 'ไม่พบรายการทรัพย์สิน' });
          asset.deletedAt = now;
          asset.updatedAt = now;
          asset.version = (asset.version || 1) + 1;
          addEvent('ย้ายเข้าถังขยะ', asset, user);
          await saveDbAsync();
          return sendJson(res, 200, { ok: true, id: asset.id });
        }

        if (action === 'restore') {
          const asset = db.assets.find(a => a.id === id);
          if (!asset) return sendJson(res, 404, { error: 'ไม่พบรายการทรัพย์สิน' });
          asset.deletedAt = null;
          asset.updatedAt = now;
          asset.version = (asset.version || 1) + 1;
          addEvent('กู้คืนทรัพย์สิน', asset, user);
          await saveDbAsync();
          return sendJson(res, 200, { ok: true, id: asset.id, asset });
        }

        if (action === 'permanent_delete') {
          const idx = db.assets.findIndex(a => a.id === id);
          if (idx === -1) return sendJson(res, 404, { error: 'ไม่พบรายการทรัพย์สิน' });
          const [removed] = db.assets.splice(idx, 1);
          for (const p of (removed.photos || [])) {
            for (const ext of ['.png', '.jpg', '.jpeg', '.webp']) {
              const pFile = path.join(PHOTOS_DIR, p.id + ext);
              if (fs.existsSync(pFile)) {
                try { fs.unlinkSync(pFile); } catch (e) {}
              }
            }
          }
          addEvent('ลบทรัพย์สินถาวร', removed, user);
          await saveDbAsync();
          return sendJson(res, 200, { ok: true, id });
        }

        if (action === 'bulk_status' && Array.isArray(ids)) {
          let updatedCount = 0;
          for (const itemId of ids) {
            const asset = db.assets.find(a => a.id === itemId);
            if (asset) {
              asset.status = status || 'Done';
              if (asset.status === 'Done' && !asset.taggedAt) asset.taggedAt = now;
              if (status === 'check') asset.checkedAt = now;
              asset.updatedAt = now;
              asset.version = (asset.version || 1) + 1;
              updatedCount++;
            }
          }
          await saveDbAsync();
          return sendJson(res, 200, { ok: true, count: updatedCount });
        }

        return sendJson(res, 400, { error: 'Action ไม่ถูกต้อง' });
      }
    }

    // 3. Photos Endpoint (/api/photos)
    if (pathname === '/api/photos') {
      const db = await loadDbAsync();
      const user = getCurrentUser(req) || { name: 'PUNYANUCH.B', email: 'earth7137@gmail.com' };

      if (req.method === 'GET') {
        const photoId = parsedUrl.searchParams.get('id');
        if (!photoId || !/^[a-zA-Z0-9_-]+$/.test(photoId)) {
          res.writeHead(400);
          return res.end('Invalid photo ID');
        }

        if (memoryPhotos.has(photoId)) {
          const mem = memoryPhotos.get(photoId);
          res.writeHead(200, {
            'Content-Type': mem.contentType,
            'Cache-Control': 'public, max-age=31536000, immutable'
          });
          return res.end(mem.buffer);
        }

        const candidates = [
          { ext: '.png', mime: 'image/png' },
          { ext: '.jpg', mime: 'image/jpeg' },
          { ext: '.jpeg', mime: 'image/jpeg' },
          { ext: '.webp', mime: 'image/webp' }
        ];
        for (const c of candidates) {
          const filePath = path.join(PHOTOS_DIR, photoId + c.ext);
          if (fs.existsSync(filePath)) {
            const stat = fs.statSync(filePath);
            res.writeHead(200, {
              'Content-Type': c.mime,
              'Content-Length': stat.size,
              'Cache-Control': 'public, max-age=31536000, immutable'
            });
            return fs.createReadStream(filePath).pipe(res);
          }
        }
        try {
          const bundle = require('./data/photos_bundle.json');
          if (bundle && bundle[photoId]) {
            const buf = Buffer.from(bundle[photoId], 'base64');
            res.writeHead(200, {
              'Content-Type': 'image/jpeg',
              'Content-Length': buf.length,
              'Cache-Control': 'public, max-age=31536000, immutable'
            });
            return res.end(buf);
          }
        } catch (e) {}
        if (hasCloudDb) {
          const cloudPhotoRaw = await redisCommand(['GET', `bu_asset_photo:${photoId}`]);
          if (cloudPhotoRaw) {
            try {
              const pObj = typeof cloudPhotoRaw === 'string' ? JSON.parse(cloudPhotoRaw) : cloudPhotoRaw;
              if (pObj && pObj.data) {
                const buf = Buffer.from(pObj.data, 'base64');
                res.writeHead(200, {
                  'Content-Type': pObj.contentType || 'image/jpeg',
                  'Content-Length': buf.length,
                  'Cache-Control': 'public, max-age=31536000, immutable'
                });
                return res.end(buf);
              }
            } catch (e) {}
          }
        }
        res.writeHead(404);
        return res.end('Photo not found');
      }

      if (req.method === 'POST') {
        const contentType = req.headers['content-type'] || '';
        let assetId = '';
        let kind = 'asset';
        let filename = 'photo.jpg';
        let fileBuffer = null;
        let mimeType = 'image/jpeg';

        if (contentType.includes('multipart/form-data')) {
          const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
          const boundary = boundaryMatch ? (boundaryMatch[1] || boundaryMatch[2]) : '';
          const rawBuf = await readBodyBuffer(req);
          const parts = parseMultipart(rawBuf, boundary);
          assetId = parts.assetId || '';
          kind = parts.kind || 'asset';
          if (parts.file && parts.file.data) {
            filename = parts.file.filename || 'photo.jpg';
            fileBuffer = parts.file.data;
            mimeType = parts.file.contentType || 'image/jpeg';
          }
        } else {
          const body = await readJsonBody(req);
          assetId = body.assetId || '';
          kind = body.kind || 'asset';
          filename = body.filename || 'photo.jpg';
          if (body.dataUrl) {
            const m = body.dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
            if (m) {
              mimeType = m[1];
              fileBuffer = Buffer.from(m[2], 'base64');
            }
          }
        }

        if (!assetId || !fileBuffer) {
          return sendJson(res, 400, { error: 'ข้อมูลรูปภาพไม่ครบถ้วน' });
        }

        const asset = db.assets.find(a => a.id === assetId);
        if (!asset) {
          return sendJson(res, 404, { error: 'ไม่พบรายการทรัพย์สิน' });
        }

        const photoId = crypto.randomUUID();
        const ext = mimeType.includes('png') ? '.png' : (mimeType.includes('webp') ? '.webp' : '.jpg');
        try {
          fs.writeFileSync(path.join(PHOTOS_DIR, photoId + ext), fileBuffer);
        } catch (e) {
          isReadOnlyFs = true;
          memoryPhotos.set(photoId, { contentType: mimeType, buffer: fileBuffer });
        }
        if (hasCloudDb) {
          await redisCommand([
            'SET',
            `bu_asset_photo:${photoId}`,
            JSON.stringify({ contentType: mimeType, data: fileBuffer.toString('base64') })
          ]);
        }

        const photoRecord = {
          id: photoId,
          assetId: asset.id,
          kind: kind === 'room' ? 'room' : 'asset',
          filename,
          createdAt: new Date().toISOString()
        };
        if (!Array.isArray(asset.photos)) asset.photos = [];
        asset.photos.push(photoRecord);
        asset.updatedAt = new Date().toISOString();

        addEvent(kind === 'room' ? 'เพิ่มรูปสถานที่' : 'เพิ่มรูปทรัพย์สิน', asset, user, {
          photoId,
          filename,
          kind
        });
        await saveDbAsync();

        return sendJson(res, 200, { ok: true, photo: photoRecord });
      }

      if (req.method === 'DELETE') {
        const body = await readJsonBody(req);
        const photoId = body.id;
        if (!photoId) return sendJson(res, 400, { error: 'ไม่พบรหัสรูปภาพ' });

        let targetAsset = null;
        let removedPhoto = null;
        for (const a of db.assets) {
          const idx = (a.photos || []).findIndex(p => p.id === photoId);
          if (idx !== -1) {
            targetAsset = a;
            [removedPhoto] = a.photos.splice(idx, 1);
            a.updatedAt = new Date().toISOString();
            break;
          }
        }

        for (const ext of ['.png', '.jpg', '.jpeg', '.webp']) {
          const pFile = path.join(PHOTOS_DIR, photoId + ext);
          if (fs.existsSync(pFile)) {
            try { fs.unlinkSync(pFile); } catch (e) {}
          }
        }
        memoryPhotos.delete(photoId);
        if (hasCloudDb) {
          await redisCommand(['DEL', `bu_asset_photo:${photoId}`]);
        }

        if (targetAsset) {
          addEvent('ลบรูปภาพ', targetAsset, user, { photoId, filename: removedPhoto?.filename });
          await saveDbAsync();
        }
        return sendJson(res, 200, { ok: true, id: photoId });
      }
    }

    // 4. Excel Import Endpoint (/api/import)
    if (pathname === '/api/import' && req.method === 'POST') {
      const db = await loadDbAsync();
      const user = getCurrentUser(req) || { name: 'PUNYANUCH.B', email: 'earth7137@gmail.com' };
      const body = await readJsonBody(req);
      const { action, filename, rows } = body;

      const preview = processExcelRows(rows || [], db.assets);
      if (action === 'preview') {
        return sendJson(res, 200, preview);
      }

      if (action === 'commit') {
        const skippedSet = new Set(preview.skippedIndexes);
        const now = new Date().toISOString();
        let count = 0;
        let quantity = 0;

        for (let i = 0; i < preview.groups.length; i++) {
          if (skippedSet.has(i)) continue;
          const g = preview.groups[i];
          const newAsset = {
            ...g.data,
            id: crypto.randomUUID(),
            photos: [],
            version: 1,
            createdAt: now,
            updatedAt: now,
            taggedAt: null,
            checkedAt: null,
            deletedAt: null
          };
          db.assets.unshift(newAsset);
          count++;
          quantity += Number(newAsset.quantity) || 0;
        }

        if (count > 0) {
          addEvent('นำเข้าทรัพย์สินจาก Excel', null, user, {
            filename,
            importedRecords: count,
            importedQuantity: quantity,
            skippedRecords: skippedSet.size
          });
          await saveDbAsync();
        }

        return sendJson(res, 200, {
          ok: true,
          count,
          quantity,
          skipped: skippedSet.size
        });
      }

      return sendJson(res, 400, { error: 'Action ไม่ถูกต้อง' });
    }

    // 5. Restore Full Backup JSON (/api/restore)
    if (pathname === '/api/restore' && req.method === 'POST') {
      const db = await loadDbAsync();
      const user = getCurrentUser(req) || { name: 'PUNYANUCH.B', email: 'earth7137@gmail.com' };
      const body = await readJsonBody(req);
      if (!Array.isArray(body.assets)) {
        return sendJson(res, 400, { error: 'ไฟล์ JSON ไม่ถูกต้อง (ต้องมีฟิลด์ assets)' });
      }
      db.assets = body.assets;
      if (Array.isArray(body.events)) {
        db.events = body.events;
      }
      addEvent('กู้คืนฐานข้อมูลจากไฟล์ Backup JSON', null, user, {
        assetsRestored: db.assets.length
      });
      await saveDbAsync();
      return sendJson(res, 200, { ok: true, count: db.assets.length });
    }

    // 6. AI Assistant Endpoint (/api/assistant)
    if (pathname === '/api/assistant') {
      if (req.method === 'GET') {
        return sendJson(res, 200, { configured: true });
      }
      if (req.method === 'POST') {
        const db = await loadDbAsync();
        const body = await readJsonBody(req);
        const answer = runLocalAssistant(body.question, body.preset, db);
        return sendJson(res, 200, answer);
      }
    }

    // 7. Static File Serving from public/
    let relPath = pathname === '/' ? '/index.html' : pathname;
    const safePath = path.normalize(relPath).replace(/^(\.\.[\/\\])+/, '');
    let filePath = path.join(PUBLIC_DIR, safePath);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }

    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon'
      };
      res.writeHead(200, {
        'Content-Type': mimeTypes[ext] || 'application/octet-stream',
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
      });
      return fs.createReadStream(filePath).pipe(res);
    }

    res.writeHead(404);
    res.end('Not found');
  } catch (err) {
    console.error('Server error:', err);
    sendJson(res, 500, { error: err.message || 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์' });
  }
}

if (require.main === module) {
  const server = http.createServer(requestHandler);
  server.listen(PORT, () => {
    const db = loadDb();
    console.log(`====================================================`);
    console.log(`🚀 BU Asset Register (Modern Edition) is running!`);
    console.log(`🌐 URL: http://localhost:${PORT}`);
    console.log(`📦 Assets loaded: ${db.assets.length} records`);
    console.log(`📜 History logs:  ${db.events.length} events`);
    console.log(`🖼️  Photos folder: data/photos/`);
    console.log(`====================================================`);
  });
}

module.exports = requestHandler;
