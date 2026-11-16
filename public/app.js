const { useState, useEffect, useMemo, useRef, useCallback } = React;

const STATUS_LIST = ['On Process', 'Done', 'Needs Review'];
const STATUS_LABELS = {
  'On Process': 'กำลังดำเนินการ',
  'Done': 'ติดรหัสแล้ว',
  'Needs Review': 'ต้องตรวจสอบ'
};

const DEFAULT_TEAM = ['เอ้', 'เอิร์ธ', 'พี่มะขาม', 'พี่ปอ', 'นักศึกษาช่วยงาน', 'วิน', 'หวาย'];

const AI_PRESETS = [
  { id: 'summary', label: 'สรุปทรัพย์สินทั้งหมด' },
  { id: 'pending', label: 'ห้องไหนยังติดรหัสไม่ครบ' },
  { id: 'missing', label: 'รายการไหนยังไม่มีรหัส' },
  { id: 'history', label: 'ใครแก้ไขข้อมูลล่าสุด' }
];

function formatThaiDate(isoStr, withTime = false) {
  if (!isoStr) return 'ไม่ระบุ';
  try {
    const d = new Date(isoStr.length === 10 ? isoStr + 'T00:00:00+07:00' : isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return new Intl.DateTimeFormat('th-TH', {
      dateStyle: 'medium',
      ...(withTime ? { timeStyle: 'short' } : {}),
      timeZone: 'Asia/Bangkok'
    }).format(d);
  } catch (e) {
    return isoStr;
  }
}

function getBangkokDateString(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr.length === 10 ? isoStr + 'T00:00:00+07:00' : isoStr);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(d);
  } catch (e) {
    return '';
  }
}

function getCategory(desc = '') {
  if (/chair|เก้าอี้|stool|bench/i.test(desc)) return 'ที่นั่ง';
  if (/table|desk|โต๊ะ/i.test(desc)) return 'โต๊ะ';
  if (/cabinet|ตู้|shelf|ชั้นวาง/i.test(desc)) return 'ตู้และชั้น';
  return 'อุปกรณ์';
}

function getBuildingCode(loc = '') {
  const m = String(loc || '').trim().match(/^([A-Z]\d+)/i);
  if (m) return m[1].toUpperCase();
  if (!loc || !loc.trim()) return 'ไม่ระบุอาคาร';
  return loc.trim().split(/\s+/)[0];
}

function formatNumber(n) {
  return new Intl.NumberFormat('en-US').format(Number(n) || 0);
}

// Client-side image compression before upload (max 1920px, JPEG 0.85)
async function compressImageToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, 1920 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve({
        dataUrl: canvas.toDataURL('image/jpeg', 0.86),
        filename: file.name.replace(/\.[^.]+$/, '') + '.jpg'
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('ไม่สามารถอ่านไฟล์รูปภาพได้'));
    };
    img.src = url;
  });
}

// SVG Icon Component
function Icon({ name, size = 18, className = '' }) {
  const paths = {
    box: <><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    image: <><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></>,
    history: <><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></>,
    trash: <><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></>,
    sparkles: <><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></>,
    upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></>,
    plus: <><path d="M5 12h14"/><path d="M12 5v14"/></>,
    search: <><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></>,
    check: <><path d="M20 6 9 17l-5-5"/></>,
    checkCircle: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
    alert: <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></>,
    grid: <><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></>,
    list: <><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></>,
    kanban: <><rect width="6" height="14" x="4" y="5" rx="2"/><rect width="6" height="10" x="14" y="5" rx="2"/></>,
    chart: <><line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></>,
    moon: <><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></>,
    mapPin: <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></>,
    camera: <><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></>,
    edit: <><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></>,
    x: <><path d="M18 6 6 18"/><path d="m6 6 12 12"/></>,
    refresh: <><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></>,
    qr: <><rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/></>,
    database: <><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></>,
    shield: <><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></>,
    external: <><path d="M7 7h10v10"/><path d="M7 17 17 7"/></>,
    copy: <><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></>,
    undo: <><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/></>,
    chevronLeft: <><path d="m15 18-6-6 6-6"/></>,
    chevronRight: <><path d="m9 18 6-6-6-6"/></>,
    send: <><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></>
  };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`inline-block shrink-0 ${className}`}
    >
      {paths[name] || paths.box}
    </svg>
  );
}

function StatusBadge({ status, deletedAt }) {
  if (deletedAt) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/25">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
        อยู่ในถังขยะ
      </span>
    );
  }
  if (status === 'Done') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
        ติดรหัสแล้ว
      </span>
    );
  }
  if (status === 'Needs Review') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/25">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
        ต้องตรวจสอบ
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/25">
      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
      กำลังดำเนินการ
    </span>
  );
}

// Main App Component
function App() {
  const [assets, setAssets] = useState([]);
  const [user, setUser] = useState(null);
  const [authConfig, setAuthConfig] = useState({ googleClientId: '', requireAuth: false, storageMode: 'json-folder' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('bu-modern-theme') || 'dark');

  // Navigation & View State
  const [activeNav, setActiveNav] = useState('all'); // 'all' | 'analytics' | 'pending' | 'gallery' | 'history' | 'trash'
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table' | 'kanban'
  const [pageSize, setPageSize] = useState(12);
  const [currentPage, setCurrentPage] = useState(1);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [personFilter, setPersonFilter] = useState('all');
  const [specialFilter, setSpecialFilter] = useState('all'); // 'all' | 'missing' | 'no-photo' | 'duplicate' | 'checked'
  const [dateMode, setDateMode] = useState('all'); // 'all' | 'day' | 'month' | 'year' | 'unknown'
  const [dateValue, setDateValue] = useState('');
  const [galleryKindFilter, setGalleryKindFilter] = useState('all'); // 'all' | 'asset' | 'room'

  // Modals & Drawers
  const [selectedAssetId, setSelectedAssetId] = useState(null);
  const [detailTab, setDetailTab] = useState('details'); // 'details' | 'photos' | 'history' | 'qr' | 'source'
  const [selectedPhotoId, setSelectedPhotoId] = useState(null);
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const [editingAsset, setEditingAsset] = useState(null); // null | 'new' | assetObj
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showAiDrawer, setShowAiDrawer] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showCmdPalette, setShowCmdPalette] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // { kind: 'asset' | 'photo' | 'permanent', id, title }

  // History State
  const [historyMode, setHistoryMode] = useState('month');
  const [historyPeriod, setHistoryPeriod] = useState('2026-11');
  const [historyPage, setHistoryPage] = useState(1);
  const [historyEvents, setHistoryEvents] = useState([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [assetHistoryEvents, setAssetHistoryEvents] = useState([]);

  // Theme Sync
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('bu-modern-theme', theme);
  }, [theme]);

  // Keyboard Shortcut Ctrl+K
  useEffect(() => {
    const onKeyDown = e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowCmdPalette(prev => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const showMessage = useCallback((text, isError = false) => {
    setToast({ text, isError });
    setTimeout(() => {
      setToast(prev => (prev?.text === text ? null : prev));
    }, 4500);
  }, []);

  const fetchAllData = useCallback(async () => {
    try {
      const [sessionRes, dataRes] = await Promise.all([
        fetch('/api/auth/session', { cache: 'no-store' }),
        fetch('/api/data', { cache: 'no-store' })
      ]);
      if (sessionRes.ok) {
        const sJson = await sessionRes.json();
        setAuthConfig({
          googleClientId: sJson.googleClientId || '',
          requireAuth: !!sJson.requireAuth,
          storageMode: sJson.storageMode || 'json-folder'
        });
        setUser(sJson.user || null);
      }
      if (dataRes.ok) {
        const dJson = await dataRes.json();
        setAssets(dJson.assets || []);
        if (dJson.user) setUser(dJson.user);
      }
    } catch (err) {
      showMessage('ไม่สามารถโหลดข้อมูลจากเซิร์ฟเวอร์ได้', true);
    } finally {
      setLoading(false);
    }
  }, [showMessage, user]);

  useEffect(() => {
    fetchAllData();
    const params = new URLSearchParams(window.location.search);
    if (params.get('asset')) {
      setSelectedAssetId(params.get('asset'));
    }
  }, []);

  // Load Global History when activeNav === 'history'
  useEffect(() => {
    if (activeNav !== 'history') return;
    let active = true;
    setHistoryLoading(true);
    fetch(`/api/data?view=history&mode=${historyMode}&period=${encodeURIComponent(historyPeriod)}&page=${historyPage}`, {
      cache: 'no-store'
    })
      .then(r => r.json())
      .then(d => {
        if (!active) return;
        setHistoryEvents(d.events || []);
        setHistoryTotal(d.total || 0);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setHistoryLoading(false);
      });
    return () => { active = false; };
  }, [activeNav, historyMode, historyPeriod, historyPage, assets]);

  // Load Single Asset History when Detail Modal is open
  useEffect(() => {
    if (!selectedAssetId) return;
    fetch(`/api/data?view=history&id=${encodeURIComponent(selectedAssetId)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setAssetHistoryEvents(d.events || []))
      .catch(() => {});
  }, [selectedAssetId, assets]);

  // Computed Collections
  const activeAssets = useMemo(() => assets.filter(a => !a.deletedAt), [assets]);
  const trashedAssets = useMemo(() => assets.filter(a => !!a.deletedAt), [assets]);
  const pendingAssetsCount = useMemo(() => activeAssets.filter(a => a.status !== 'Done').length, [activeAssets]);
  const totalPhotosCount = useMemo(
    () => activeAssets.reduce((sum, a) => sum + ((a.photos && a.photos.length) || 0), 0),
    [activeAssets]
  );

  const duplicateAssetNos = useMemo(() => {
    const counts = {};
    for (const a of activeAssets) {
      if (a.assetNo) counts[a.assetNo] = (counts[a.assetNo] || 0) + 1;
    }
    return new Set(Object.keys(counts).filter(k => counts[k] > 1));
  }, [activeAssets]);

  const uniqueLocations = useMemo(() => {
    return [...new Set(activeAssets.map(a => a.location).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th'));
  }, [activeAssets]);

  const uniquePeople = useMemo(() => {
    return [...new Set([...DEFAULT_TEAM, ...activeAssets.flatMap(a => a.taggingPeople || [])])].sort((a, b) =>
      a.localeCompare(b, 'th')
    );
  }, [activeAssets]);

  // Filtered Assets
  const filteredAssets = useMemo(() => {
    return assets.filter(a => {
      if (activeNav === 'trash') {
        if (!a.deletedAt) return false;
      } else {
        if (a.deletedAt) return false;
      }

      if (activeNav === 'pending' && a.status === 'Done') return false;
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (locationFilter !== 'all' && a.location !== locationFilter) return false;

      if (personFilter === 'none' && (a.taggingPeople || []).length > 0) return false;
      if (personFilter.startsWith('name:')) {
        const pName = personFilter.slice(5);
        if (!(a.taggingPeople || []).includes(pName)) return false;
      }

      if (specialFilter === 'missing' && a.assetNo) return false;
      if (specialFilter === 'no-photo' && (a.photos || []).length > 0) return false;
      if (specialFilter === 'duplicate' && !duplicateAssetNos.has(a.assetNo)) return false;
      if (specialFilter === 'checked' && !a.checkedAt) return false;

      // Date filter on taggedAt
      if (dateMode !== 'all') {
        if (a.status !== 'Done') return false;
        const bkk = getBangkokDateString(a.taggedAt);
        if (dateMode === 'unknown' && bkk) return false;
        if (dateMode === 'day' && dateValue && bkk !== dateValue) return false;
        if (dateMode === 'month' && dateValue && bkk.slice(0, 7) !== dateValue) return false;
        if (dateMode === 'year' && dateValue && bkk.slice(0, 4) !== dateValue) return false;
      }

      const q = search.trim().toLowerCase();
      if (!q) return true;
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
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [
    assets,
    activeNav,
    statusFilter,
    locationFilter,
    personFilter,
    specialFilter,
    dateMode,
    dateValue,
    search,
    duplicateAssetNos
  ]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeNav, statusFilter, locationFilter, personFilter, specialFilter, dateMode, dateValue, search, pageSize]);

  // KPI Metrics for Filtered Active Set
  const kpiStats = useMemo(() => {
    const base = activeNav === 'trash' ? activeAssets : filteredAssets;
    const done = base.filter(a => a.status === 'Done');
    const pending = base.filter(a => a.status !== 'Done');
    const missing = base.filter(a => !a.assetNo);
    const totalQty = base.reduce((s, a) => s + (Number(a.quantity) || 0), 0);
    const doneQty = done.reduce((s, a) => s + (Number(a.quantity) || 0), 0);
    const pct = base.length ? Math.round((done.length / base.length) * 100) : 0;
    return {
      totalRecords: base.length,
      totalQty,
      doneRecords: done.length,
      doneQty,
      pendingRecords: pending.length,
      missingRecords: missing.length,
      pct
    };
  }, [filteredAssets, activeAssets, activeNav]);

  const totalPages = Math.max(1, Math.ceil(filteredAssets.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pagedAssets = useMemo(
    () => filteredAssets.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredAssets, safePage, pageSize]
  );

  const galleryPhotos = useMemo(() => {
    return filteredAssets.flatMap(a =>
      (a.photos || [])
        .filter(p => galleryKindFilter === 'all' || p.kind === galleryKindFilter)
        .map(p => ({ ...p, asset: a }))
    );
  }, [filteredAssets, galleryKindFilter]);

  const selectedAsset = useMemo(
    () => assets.find(a => a.id === selectedAssetId) || null,
    [assets, selectedAssetId]
  );

  // Actions
  const handleAssetAction = async (action, asset, payload = null, pendingPhotos = []) => {
    setBusy(true);
    try {
      const res = await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          id: asset?.id,
          version: asset?.version,
          data: payload
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'เกิดข้อผิดพลาด');

      const targetId = json.id || asset?.id;
      if ((action === 'create' || action === 'update') && targetId && Array.isArray(pendingPhotos) && pendingPhotos.length > 0) {
        for (const p of pendingPhotos) {
          await fetch('/api/photos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              assetId: targetId,
              kind: p.kind || 'asset',
              filename: p.filename,
              dataUrl: p.dataUrl
            })
          });
        }
      }

      await fetchAllData();

      if (action === 'create') {
        setEditingAsset(null);
        setSelectedAssetId(json.id);
        showMessage(
          pendingPhotos.length > 0
            ? `เพิ่มทรัพย์สินและอัปโหลด ${pendingPhotos.length} รูปเรียบร้อยแล้ว`
            : 'เพิ่มทรัพย์สินเรียบร้อยแล้ว สามารถอัปโหลดรูปภาพได้ทันที'
        );
      } else if (action === 'update') {
        setEditingAsset(null);
        showMessage('บันทึกการแก้ไขเรียบร้อยแล้ว');
      } else if (action === 'check') {
        showMessage('บันทึกการตรวจเช็คหน้างานเรียบร้อยแล้ว');
      } else if (action === 'delete') {
        setConfirmDelete(null);
        showMessage('ย้ายรายการเข้าถังขยะแล้ว (กู้คืนได้ภายใน 7 วัน)');
      } else if (action === 'restore') {
        showMessage('กู้คืนทรัพย์สินเรียบร้อยแล้ว');
      } else if (action === 'permanent_delete') {
        setConfirmDelete(null);
        setSelectedAssetId(null);
        showMessage('ลบทรัพย์สินออกจากระบบถาวรแล้ว');
      }
    } catch (err) {
      showMessage(err.message, true);
    } finally {
      setBusy(false);
    }
  };

  const handleQuickStatusChange = async (asset, newStatus) => {
    await handleAssetAction('update', asset, { ...asset, status: newStatus });
  };

  const handleDeletePhoto = async photoId => {
    setBusy(true);
    try {
      const res = await fetch('/api/photos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: photoId })
      });
      if (!res.ok) throw new Error('ลบรูปภาพไม่สำเร็จ');
      await fetchAllData();
      setConfirmDelete(null);
      showMessage('ลบรูปภาพเรียบร้อยแล้ว');
    } catch (err) {
      showMessage(err.message, true);
    } finally {
      setBusy(false);
    }
  };

  const clearAllFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setLocationFilter('all');
    setPersonFilter('all');
    setSpecialFilter('all');
    setDateMode('all');
    setDateValue('');
  };

  const hasActiveFilters =
    search !== '' ||
    statusFilter !== 'all' ||
    locationFilter !== 'all' ||
    personFilter !== 'all' ||
    specialFilter !== 'all' ||
    dateMode !== 'all';

  // Export CSV
  const exportCsv = () => {
    const headers = [
      'วันที่ได้รับ',
      'Created By',
      'PO',
      'Asset No.',
      'Description',
      'Location',
      'Location SAP',
      'Quantity',
      'Status',
      'Remark',
      'Contact',
      'Image Room',
      'Image Asset',
      'Record ID',
      'ตรวจเช็คล่าสุด',
      'ลิงก์รายการ'
    ];
    const escapeCsv = val => {
      let s = val == null ? '' : String(val);
      if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const rows = filteredAssets.map(a => [
      a.receivedDate,
      a.createdBy,
      a.po,
      a.assetNo,
      a.description,
      a.location,
      a.locationSap,
      a.quantity,
      a.status,
      a.remark,
      a.contact,
      [a.imageRoom, ...(a.photos || []).filter(p => p.kind === 'room').map(p => `${window.location.origin}/api/photos?id=${p.id}`)]
        .filter(Boolean)
        .join(' | '),
      [a.imageAsset, ...(a.photos || []).filter(p => p.kind === 'asset').map(p => `${window.location.origin}/api/photos?id=${p.id}`)]
        .filter(Boolean)
        .join(' | '),
      a.id,
      a.checkedAt || '',
      `${window.location.origin}/?asset=${encodeURIComponent(a.id)}`
    ]);

    const csvContent = '\uFEFF' + [headers, ...rows].map(r => r.map(escapeCsv).join(',')).join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `BU-Asset-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    setShowExportModal(false);
    showMessage(`ส่งออกไฟล์ CSV จำนวน ${filteredAssets.length} รายการเรียบร้อยแล้ว`);
  };

  // Export Full Backup JSON
  const exportBackupJson = () => {
    const payload = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        assets
      },
      null,
      2
    );
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `BU-Asset-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    setShowExportModal(false);
    showMessage('ดาวน์โหลดไฟล์สำรองข้อมูล JSON เรียบร้อยแล้ว');
  };

  // If requireAuth is active and user is logged out, show Futuristic Google Sign-In Gate
  if (!loading && authConfig.requireAuth && !user) {
    return (
      <GoogleLoginGate
        googleClientId={authConfig.googleClientId}
        theme={theme}
        onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        onLoggedIn={u => {
          setUser(u);
          fetchAllData();
          showMessage(`ยินดีต้อนรับ ${u.name} (${u.email})`);
        }}
      />
    );
  }

  const navItems = [
    { id: 'all', label: 'ทะเบียนทรัพย์สิน', icon: 'box', count: activeAssets.length },
    { id: 'analytics', label: 'แดชบอร์ดวิเคราะห์', icon: 'chart', badge: 'NEW' },
    { id: 'pending', label: 'งานรอดำเนินการ', icon: 'clock', count: pendingAssetsCount, alert: pendingAssetsCount > 0 },
    { id: 'gallery', label: 'คลังรูปภาพ', icon: 'image', count: totalPhotosCount },
    { id: 'history', label: 'ประวัติการทำงาน', icon: 'history' },
    { id: 'trash', label: 'ถังขยะ', icon: 'trash', count: trashedAssets.length || undefined }
  ];

  const currentNavMeta = navItems.find(n => n.id === activeNav) || navItems[0];

  return (
    <div className="min-h-screen flex flex-col md:flex-row relative">
      <div className="ambient-mesh" />

      {/* Desktop Glass Sidebar */}
      <aside className="w-full md:w-72 md:fixed md:inset-y-0 md:left-0 z-30 glass-panel border-b md:border-b-0 md:border-r border-slate-200/70 dark:border-white/10 flex flex-col justify-between">
        <div>
          {/* Brand Header */}
          <div className="p-5 flex items-center justify-between border-b border-slate-200/60 dark:border-white/10">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/25">
                <Icon name="box" size={22} />
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <span className="font-extrabold tracking-tight text-lg text-slate-900 dark:text-white">BU ASSET</span>
                  <span className="text-brand-gold font-black text-xl leading-none">.</span>
                  <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                    v2.0
                  </span>
                </div>
                <p className="text-[11px] font-semibold tracking-widest uppercase text-slate-400 dark:text-slate-500">
                  SMART ASSET OS
                </p>
              </div>
            </div>

            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:text-emerald-500 transition"
              title="สลับธีมมืด/สว่าง"
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
            </button>
          </div>

          {/* Quick Command Search Bar */}
          <div className="px-4 pt-4">
            <button
              onClick={() => setShowCmdPalette(true)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-100/90 dark:bg-slate-800/60 border border-slate-200/80 dark:border-white/10 text-xs text-slate-500 dark:text-slate-400 hover:border-emerald-500/40 transition"
            >
              <span className="flex items-center gap-2">
                <Icon name="search" size={15} />
                <span>ค้นหาด่วน...</span>
              </span>
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                Ctrl+K
              </kbd>
            </button>
          </div>

          {/* Navigation Menu */}
          <div className="px-3 py-4">
            <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              WORKSPACE
            </p>
            <nav className="space-y-1">
              {navItems.map(item => {
                const isActive = activeNav === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveNav(item.id)}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-gradient-to-r from-emerald-500/20 via-teal-500/10 to-transparent text-emerald-600 dark:text-emerald-300 border border-emerald-500/30 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <Icon name={item.icon} size={18} className={isActive ? 'text-emerald-500' : ''} />
                      <span>{item.label}</span>
                    </span>
                    {item.badge && (
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-500/20 text-indigo-500 dark:text-indigo-300 border border-indigo-500/30">
                        {item.badge}
                      </span>
                    )}
                    {item.count !== undefined && (
                      <span
                        className={`px-2 py-0.5 text-xs font-mono font-semibold rounded-full ${
                          isActive
                            ? 'bg-emerald-500 text-white'
                            : item.alert
                            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                            : 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            <p className="px-3 mt-6 mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              AI & DATA TOOLS
            </p>
            <div className="space-y-1">
              <button
                onClick={() => setShowAiDrawer(true)}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-indigo-500/10 hover:text-indigo-500 dark:hover:text-indigo-300 transition"
              >
                <span className="flex items-center gap-3">
                  <Icon name="sparkles" size={18} className="text-indigo-500" />
                  <span>ถาม AI อัจฉริยะ</span>
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-400">AI</span>
              </button>

              <button
                onClick={() => setShowImportModal(true)}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition"
              >
                <Icon name="upload" size={18} />
                <span>นำเข้าไฟล์ Excel (.xlsx)</span>
              </button>

              <button
                onClick={() => setShowExportModal(true)}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition"
              >
                <Icon name="download" size={18} />
                <span>ส่งออก / สำรองข้อมูล JSON</span>
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Google User Card */}
        <div className="p-4 border-t border-slate-200/60 dark:border-white/10">
          <button
            onClick={() => setShowAuthModal(true)}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/70 hover:bg-slate-200/70 dark:hover:bg-slate-800 border border-slate-200/70 dark:border-white/10 transition text-left"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-indigo-500 text-white font-bold flex items-center justify-center text-sm shrink-0">
              {user?.name ? user.name.slice(0, 2).toUpperCase() : 'BU'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {user?.name || 'PUNYANUCH.B'}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                {user?.email || 'earth7137@gmail.com'}
              </p>
            </div>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 md:pl-72 flex flex-col min-h-screen relative z-10">
        {/* Top Glass Header */}
        <header className="sticky top-0 z-20 glass-panel border-b border-slate-200/70 dark:border-white/10 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-400 dark:text-slate-500 font-medium">BU Asset</span>
            <Icon name="chevronRight" size={14} className="text-slate-400" />
            <span className="font-bold text-slate-900 dark:text-white">{currentNavMeta.label}</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setShowAiDrawer(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/25 transition"
            >
              <Icon name="sparkles" size={15} />
              <span>ถาม AI</span>
            </button>

            <button
              onClick={() => setShowImportModal(true)}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 hover:border-emerald-500/40 transition"
            >
              <Icon name="upload" size={15} />
              <span>นำเข้า Excel</span>
            </button>

            <button
              onClick={() => setShowExportModal(true)}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 hover:border-emerald-500/40 transition"
            >
              <Icon name="download" size={15} />
              <span>ส่งออก</span>
            </button>

            <button
              onClick={() => setEditingAsset('new')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white shadow-lg shadow-emerald-500/25 transition"
            >
              <Icon name="plus" size={16} />
              <span>เพิ่มทรัพย์สิน</span>
            </button>

            <button
              onClick={() => setShowAuthModal(true)}
              className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-xs font-semibold flex items-center gap-2 hover:border-emerald-500/40 transition"
              title="บัญชี Google และการตั้งค่าระบบ"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                <path
                  fill="#EA4335"
                  d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.8C6.2 7.2 8.9 5 12 5z"
                />
                <path
                  fill="#4285F4"
                  d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.6l3.7 2.9c2.2-2 3.7-5 3.7-8.7z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.3 14.8c-.2-.8-.4-1.6-.4-2.5s.2-1.7.4-2.5L1.6 7C.6 9 0 11.2 0 13.5s.6 4.5 1.6 6.5l3.7-2.9z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.1-6.7-5l-3.7 2.8C3.5 21.4 7.4 24 12 24z"
                />
              </svg>
              <span className="hidden lg:inline">{user?.name || 'Google'}</span>
            </button>

            <button
              onClick={async () => {
                await fetch('/api/auth/logout', { method: 'POST' });
                setUser(null);
                setAssets([]);
                setSelectedAssetId(null);
                showMessage('ออกจากระบบเรียบร้อยแล้ว');
              }}
              className="px-3 py-1.5 rounded-xl bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white border border-rose-500/20 text-xs font-semibold transition"
              title="ออกจากระบบ"
            >
              ออกจากระบบ
            </button>
          </div>
        </header>

        {/* Toast Notification */}
        {toast && (
          <div className="fixed bottom-6 right-6 z-50 animate-fade-in">
            <div
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl border backdrop-blur-xl text-sm font-medium ${
                toast.isError
                  ? 'bg-rose-950/90 border-rose-500/40 text-rose-200'
                  : 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
              }`}
            >
              <Icon name={toast.isError ? 'alert' : 'checkCircle'} size={18} />
              <span>{toast.text}</span>
              <button onClick={() => setToast(null)} className="opacity-70 hover:opacity-100">
                <Icon name="x" size={15} />
              </button>
            </div>
          </div>
        )}

        {/* Main Workspace Body */}
        <main className="flex-1 p-6 max-w-[1600px] w-full mx-auto space-y-6">
          {/* Page Hero Banner */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
                BANGKOK UNIVERSITY · SMART INVENTORY
              </p>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white mt-1">
                {currentNavMeta.label}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {activeNav === 'pending'
                  ? 'ติดตามงานติดรหัสและตรวจสอบทรัพย์สินหน้างานแบบเรียลไทม์'
                  : activeNav === 'analytics'
                  ? 'วิเคราะห์ภาพรวมทรัพย์สิน ความคืบหน้าการติดรหัส และสถิติแยกตามอาคาร/ทีมงาน'
                  : activeNav === 'gallery'
                  ? 'คลังรูปภาพทรัพย์สินและสถานที่จริงจากการสำรวจทั้งหมด 200 รูป'
                  : activeNav === 'history'
                  ? 'บันทึกประวัติการแก้ไข การเพิ่มรูป และการตรวจเช็คหน้างานครบทุกขั้นตอน'
                  : activeNav === 'trash'
                  ? 'รายการที่ย้ายเข้าถังขยะ สามารถกู้คืนได้ทันทีหรือลบถาวร'
                  : 'บริหารจัดการ ตรวจเช็ค และค้นหาทรัพย์สินทั้งหมดในระบบเดียว'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={fetchAllData}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold glass-panel hover:border-emerald-500/40 transition"
              >
                <Icon name="refresh" size={14} className={loading ? 'animate-spin' : ''} />
                <span>รีเฟรชข้อมูล</span>
              </button>

              {['all', 'pending', 'trash'].includes(activeNav) && (
                <div className="inline-flex p-1 rounded-xl glass-panel">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                      viewMode === 'grid'
                        ? 'bg-emerald-500 text-white shadow'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon name="grid" size={14} />
                    <span>การ์ด</span>
                  </button>
                  <button
                    onClick={() => setViewMode('table')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                      viewMode === 'table'
                        ? 'bg-emerald-500 text-white shadow'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon name="list" size={14} />
                    <span>ตาราง</span>
                  </button>
                  <button
                    onClick={() => setViewMode('kanban')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                      viewMode === 'kanban'
                        ? 'bg-emerald-500 text-white shadow'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon name="kanban" size={14} />
                    <span>บอร์ด</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* KPI Summary Bento Strip (shown on Register, Pending, Gallery) */}
          {!['history', 'trash', 'analytics'].includes(activeNav) && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="glass-panel rounded-2xl p-5 relative overflow-hidden border-l-4 border-l-emerald-500">
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
                    <span>ทรัพย์สินทั้งหมด</span>
                    <span className="p-2 rounded-xl bg-emerald-500/15 text-emerald-500">
                      <Icon name="box" size={18} />
                    </span>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
                      {formatNumber(kpiStats.totalRecords)}
                    </span>
                    <span className="text-xs font-semibold text-slate-400">รายการ</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    รวม {formatNumber(kpiStats.totalQty)} ชิ้น ตามตัวกรองปัจจุบัน
                  </p>
                </div>

                <div className="glass-panel rounded-2xl p-5 relative overflow-hidden">
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
                    <span>ติดรหัสเรียบร้อย</span>
                    <span className="p-2 rounded-xl bg-teal-500/15 text-teal-500">
                      <Icon name="checkCircle" size={18} />
                    </span>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
                      {formatNumber(kpiStats.doneRecords)}
                    </span>
                    <span className="text-xs font-semibold text-slate-400">รายการ ({kpiStats.pct}%)</span>
                  </div>
                  <div className="mt-2.5 w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                      style={{ width: `${kpiStats.pct}%` }}
                    />
                  </div>
                </div>

                <div
                  onClick={() => setActiveNav('pending')}
                  className="glass-panel rounded-2xl p-5 cursor-pointer hover:border-amber-500/40 transition"
                >
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
                    <span>รอดำเนินการ</span>
                    <span className="p-2 rounded-xl bg-amber-500/15 text-amber-500">
                      <Icon name="clock" size={18} />
                    </span>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-amber-600 dark:text-amber-400">
                      {formatNumber(kpiStats.pendingRecords)}
                    </span>
                    <span className="text-xs font-semibold text-slate-400">รายการ</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    คลิกเพื่อเปิดรายการที่ต้องติดตามหน้างาน
                  </p>
                </div>

                <div
                  onClick={() => {
                    setActiveNav('all');
                    setSpecialFilter(specialFilter === 'missing' ? 'all' : 'missing');
                  }}
                  className="glass-panel rounded-2xl p-5 cursor-pointer hover:border-indigo-500/40 transition"
                >
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
                    <span>ยังไม่ระบุรหัส / รูปภาพ</span>
                    <span className="p-2 rounded-xl bg-indigo-500/15 text-indigo-500">
                      <Icon name="image" size={18} />
                    </span>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400">
                      {formatNumber(kpiStats.missingRecords)}
                    </span>
                    <span className="text-xs font-semibold text-slate-400">รายการไม่มีรหัส</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    รูปถ่ายในระบบรวม {formatNumber(totalPhotosCount)} รูป
                  </p>
                </div>
              </div>

              {kpiStats.missingRecords > 0 && specialFilter !== 'missing' && (
                <div className="glass-panel rounded-2xl px-4 py-3 border-l-4 border-l-amber-500 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <Icon name="alert" size={17} className="text-amber-500" />
                    <span>
                      พบ <strong>{kpiStats.missingRecords} รายการ</strong> ที่ยังไม่ได้ระบุรหัสทรัพย์สิน (Asset No.)
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setActiveNav('all');
                      setSpecialFilter('missing');
                    }}
                    className="font-bold text-amber-600 dark:text-amber-400 hover:underline"
                  >
                    ดูรายการที่ต้องเติมรหัส →
                  </button>
                </div>
              )}
            </>
          )}

          {/* Analytics Dashboard View */}
          {activeNav === 'analytics' && (
            <AnalyticsDashboard
              assets={activeAssets}
              events={historyEvents}
              totalPhotosCount={totalPhotosCount}
              onFilterLocation={loc => {
                setLocationFilter(loc);
                setActiveNav('all');
              }}
              onFilterPerson={person => {
                setPersonFilter('name:' + person);
                setActiveNav('all');
              }}
            />
          )}

          {/* Filter Bar for Asset Register, Pending, Trash, Gallery */}
          {['all', 'pending', 'trash', 'gallery'].includes(activeNav) && (
            <div className="glass-panel rounded-2xl p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
                {/* Search Input */}
                <div className="lg:col-span-2 relative">
                  <Icon
                    name="search"
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="ค้นหาชื่อทรัพย์สิน, รหัส, ห้อง/อาคาร, PO, ผู้ติดรหัส..."
                    className="w-full pl-10 pr-8 py-2 rounded-xl text-xs bg-slate-100/90 dark:bg-slate-900/70 border border-slate-200 dark:border-white/10 focus:outline-none focus:border-emerald-500"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                    >
                      <Icon name="x" size={14} />
                    </button>
                  )}
                </div>

                {/* Status Select */}
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl text-xs bg-slate-100/90 dark:bg-slate-900/70 border border-slate-200 dark:border-white/10 focus:outline-none focus:border-emerald-500"
                >
                  <option value="all">ทุกสถานะ ({activeAssets.length})</option>
                  {STATUS_LIST.map(st => (
                    <option key={st} value={st}>
                      {STATUS_LABELS[st]}
                    </option>
                  ))}
                </select>

                {/* Location Select */}
                <select
                  value={locationFilter}
                  onChange={e => setLocationFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl text-xs bg-slate-100/90 dark:bg-slate-900/70 border border-slate-200 dark:border-white/10 focus:outline-none focus:border-emerald-500"
                >
                  <option value="all">ทุกสถานที่ ({uniqueLocations.length} ห้อง)</option>
                  {uniqueLocations.map(loc => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>

                {/* Tagging Person Select */}
                <select
                  value={personFilter}
                  onChange={e => setPersonFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl text-xs bg-slate-100/90 dark:bg-slate-900/70 border border-slate-200 dark:border-white/10 focus:outline-none focus:border-emerald-500"
                >
                  <option value="all">ผู้เกี่ยวข้องทั้งหมด</option>
                  <option value="none">ยังไม่ระบุผู้เกี่ยวข้อง</option>
                  {uniquePeople.map(p => (
                    <option key={p} value={`name:${p}`}>
                      {p}
                    </option>
                  ))}
                </select>

                {/* Special Filter */}
                <select
                  value={specialFilter}
                  onChange={e => setSpecialFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl text-xs bg-slate-100/90 dark:bg-slate-900/70 border border-slate-200 dark:border-white/10 focus:outline-none focus:border-emerald-500"
                >
                  <option value="all">ตัวกรองพิเศษ: ทั้งหมด</option>
                  <option value="missing">เฉพาะยังไม่ระบุรหัสทรัพย์สิน</option>
                  <option value="no-photo">เฉพาะยังไม่มีรูปถ่าย</option>
                  <option value="duplicate">เฉพาะรหัสทรัพย์สินซ้ำ</option>
                  <option value="checked">เฉพาะตรวจเช็คหน้างานแล้ว</option>
                </select>
              </div>

              {/* Second Filter Row: Tagged Date & Summary */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200/50 dark:border-white/5 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-slate-400 font-semibold">วันที่ติดรหัสสำเร็จ:</span>
                  <select
                    value={dateMode}
                    onChange={e => {
                      setDateMode(e.target.value);
                      setDateValue('');
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-xs"
                  >
                    <option value="all">ทุกวันที่</option>
                    <option value="day">รายวัน</option>
                    <option value="month">รายเดือน</option>
                    <option value="year">รายปี</option>
                    <option value="unknown">ติดสำเร็จแต่ไม่ระบุวันที่</option>
                  </select>

                  {(dateMode === 'day' || dateMode === 'month') && (
                    <input
                      type={dateMode === 'day' ? 'date' : 'month'}
                      value={dateValue}
                      onChange={e => setDateValue(e.target.value)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-xs"
                    />
                  )}

                  {dateMode === 'year' && (
                    <select
                      value={dateValue || 'all'}
                      onChange={e => setDateValue(e.target.value === 'all' ? '' : e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-xs"
                    >
                      <option value="all">เลือกปี</option>
                      <option value="2026">2569 (2026)</option>
                      <option value="2025">2568 (2025)</option>
                    </select>
                  )}

                  {activeNav === 'gallery' && (
                    <div className="flex items-center gap-1 ml-2 pl-2 border-l border-slate-200 dark:border-white/10">
                      <button
                        onClick={() => setGalleryKindFilter('all')}
                        className={`px-2.5 py-1 rounded-lg font-semibold ${
                          galleryKindFilter === 'all' ? 'bg-emerald-500 text-white' : 'text-slate-400'
                        }`}
                      >
                        ทุกรูป ({galleryPhotos.length})
                      </button>
                      <button
                        onClick={() => setGalleryKindFilter('asset')}
                        className={`px-2.5 py-1 rounded-lg font-semibold ${
                          galleryKindFilter === 'asset' ? 'bg-emerald-500 text-white' : 'text-slate-400'
                        }`}
                      >
                        รูปทรัพย์สิน
                      </button>
                      <button
                        onClick={() => setGalleryKindFilter('room')}
                        className={`px-2.5 py-1 rounded-lg font-semibold ${
                          galleryKindFilter === 'room' ? 'bg-emerald-500 text-white' : 'text-slate-400'
                        }`}
                      >
                        รูปสถานที่
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-slate-500 dark:text-slate-400">
                    พบ <strong className="text-slate-900 dark:text-white">{formatNumber(filteredAssets.length)}</strong> รายการ · รวม{' '}
                    <strong className="text-slate-900 dark:text-white">
                      {formatNumber(filteredAssets.reduce((s, a) => s + (Number(a.quantity) || 0), 0))}
                    </strong>{' '}
                    ชิ้น
                  </span>

                  {hasActiveFilters && (
                    <button
                      onClick={clearAllFilters}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/15 text-rose-500 hover:bg-rose-500/25 font-semibold transition"
                    >
                      <Icon name="x" size={13} />
                      <span>ล้างตัวกรอง</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* GALLERY VIEW */}
          {activeNav === 'gallery' && (
            <div className="space-y-4">
              {galleryPhotos.length === 0 ? (
                <div className="glass-panel rounded-2xl p-12 text-center space-y-2">
                  <Icon name="image" size={40} className="text-slate-400 mx-auto" />
                  <h3 className="text-base font-bold">ไม่พบรูปภาพตามตัวกรอง</h3>
                  <p className="text-xs text-slate-400">ลองเปลี่ยนคำค้นหาหรือเลือกดูทรัพย์สินทั้งหมด</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {galleryPhotos.map(item => (
                    <div
                      key={item.id}
                      onClick={() => {
                        setSelectedPhotoId(item.id);
                        setDetailTab('details');
                        setSelectedAssetId(item.asset.id);
                      }}
                      className="glass-card rounded-2xl overflow-hidden cursor-pointer group flex flex-col"
                    >
                      <div className="aspect-[4/3] bg-slate-900/40 relative overflow-hidden">
                        <img
                          src={`/api/photos?id=${item.id}`}
                          alt={item.asset.description}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-black/60 text-white backdrop-blur-md">
                          {item.kind === 'room' ? 'รูปสถานที่' : 'รูปทรัพย์สิน'}
                        </span>
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            setLightboxPhoto({ ...item, description: item.asset.description });
                          }}
                          className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-black/60 text-white opacity-0 group-hover:opacity-100 transition"
                          title="ขยายรูปภาพ"
                        >
                          <Icon name="external" size={14} />
                        </button>
                      </div>
                      <div className="p-3 flex-1 flex flex-col justify-between">
                        <div>
                          <p className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 truncate">
                            {item.asset.assetNo || 'ยังไม่ระบุรหัส'}
                          </p>
                          <h4 className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1 mt-0.5">
                            {item.asset.description}
                          </h4>
                        </div>
                        <p className="text-[11px] text-slate-400 truncate mt-1.5 flex items-center gap-1">
                          <Icon name="mapPin" size={11} />
                          <span>{item.asset.location || 'ไม่ระบุสถานที่'}</span>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* HISTORY VIEW */}
          {activeNav === 'history' && (
            <div className="space-y-4">
              <div className="glass-panel rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-400">ช่วงเวลา:</span>
                  <select
                    value={historyMode}
                    onChange={e => {
                      const m = e.target.value;
                      setHistoryMode(m);
                      if (m === 'day') setHistoryPeriod('2026-11-12');
                      else if (m === 'month') setHistoryPeriod('2026-11');
                      else if (m === 'year') setHistoryPeriod('2026');
                      else setHistoryPeriod('');
                      setHistoryPage(1);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/10"
                  >
                    <option value="all">ทั้งหมด ({historyTotal})</option>
                    <option value="day">รายวัน</option>
                    <option value="month">รายเดือน</option>
                    <option value="year">รายปี</option>
                  </select>

                  {historyMode !== 'all' && (
                    <input
                      type={historyMode === 'day' ? 'date' : historyMode === 'month' ? 'month' : 'number'}
                      value={historyPeriod}
                      onChange={e => {
                        setHistoryPeriod(e.target.value);
                        setHistoryPage(1);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/10"
                    />
                  )}

                  <button
                    onClick={() => {
                      setHistoryMode('all');
                      setHistoryPeriod('');
                      setHistoryPage(1);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-500 font-semibold hover:bg-emerald-500/25 transition"
                  >
                    ดูประวัติทั้งหมด
                  </button>
                </div>

                <span className="text-xs text-slate-400">
                  พบประวัติทั้งหมด <strong className="text-white">{formatNumber(historyTotal)}</strong> รายการ
                </span>
              </div>

              {historyLoading ? (
                <div className="glass-panel rounded-2xl p-12 text-center text-sm text-slate-400">
                  กำลังโหลดประวัติการทำงาน...
                </div>
              ) : historyEvents.length === 0 ? (
                <div className="glass-panel rounded-2xl p-12 text-center space-y-2">
                  <Icon name="history" size={38} className="text-slate-400 mx-auto" />
                  <h3 className="text-base font-bold">ไม่พบประวัติในเดือน/วันที่เลือก</h3>
                  <p className="text-xs text-slate-400">คลิกปุ่ม "ดูประวัติทั้งหมด" หรือเลือกเดือน พ.ย. 2026 (2026-11)</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {historyEvents.map(ev => {
                    let snap = {};
                    try {
                      snap = JSON.parse(ev.snapshot || '{}');
                    } catch (e) {}
                    return (
                      <div key={ev.id} className="glass-card rounded-2xl p-4 flex flex-col gap-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                              {ev.action}
                            </span>
                            <span className="text-sm font-bold text-slate-900 dark:text-white">
                              {snap.description || snap.filename || 'บันทึกกิจกรรมระบบ'}
                            </span>
                            {snap.assetNo && (
                              <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                                {snap.assetNo}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-400">
                            <span>{ev.actor}</span>
                            <span>·</span>
                            <span>{ev.actorEmail || 'N/A'}</span>
                            <span>·</span>
                            <span>{formatThaiDate(ev.createdAt, true)}</span>
                            {ev.assetId && assets.some(a => a.id === ev.assetId) && (
                              <button
                                onClick={() => {
                                  setDetailTab('details');
                                  setSelectedAssetId(ev.assetId);
                                }}
                                className="ml-2 px-2 py-1 rounded-lg bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25 font-semibold"
                              >
                                เปิดรายการ
                              </button>
                            )}
                          </div>
                        </div>

                        <details className="text-xs text-slate-400">
                          <summary className="cursor-pointer hover:text-emerald-400 select-none">
                            ดูข้อมูลขณะบันทึก (JSON Snapshot)
                          </summary>
                          <pre className="mt-2 p-3 rounded-xl bg-slate-950 text-emerald-300 font-mono text-[11px] overflow-x-auto">
                            {JSON.stringify(snap, null, 2)}
                          </pre>
                        </details>
                      </div>
                    );
                  })}

                  {historyTotal > 40 && (
                    <div className="flex items-center justify-center gap-3 pt-4">
                      <button
                        disabled={historyPage <= 1}
                        onClick={() => setHistoryPage(p => p - 1)}
                        className="px-3.5 py-2 rounded-xl text-xs font-semibold glass-panel disabled:opacity-40"
                      >
                        ← ก่อนหน้า
                      </button>
                      <span className="text-xs font-mono">
                        หน้า {historyPage} / {Math.ceil(historyTotal / 40)}
                      </span>
                      <button
                        disabled={historyPage * 40 >= historyTotal}
                        onClick={() => setHistoryPage(p => p + 1)}
                        className="px-3.5 py-2 rounded-xl text-xs font-semibold glass-panel disabled:opacity-40"
                      >
                        ถัดไป →
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ASSET REGISTER / PENDING / TRASH VIEWS */}
          {['all', 'pending', 'trash'].includes(activeNav) && (
            <>
              {filteredAssets.length === 0 ? (
                <div className="glass-panel rounded-2xl p-12 text-center space-y-3">
                  <Icon name={activeNav === 'trash' ? 'trash' : 'box'} size={42} className="text-slate-400 mx-auto" />
                  <h3 className="text-lg font-bold">
                    {activeNav === 'trash' ? 'ถังขยะว่างเปล่า' : 'ไม่พบรายการทรัพย์สินตามเงื่อนไข'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {activeNav === 'trash'
                      ? 'รายการที่ถูกลบจะถูกเก็บไว้ในถังขยะเพื่อให้สามารถกู้คืนได้'
                      : 'ลองเปลี่ยนคำค้นหาหรือกดปุ่มล้างตัวกรองเพื่อดูรายการทั้งหมด'}
                  </p>
                  {hasActiveFilters && (
                    <button
                      onClick={clearAllFilters}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 text-white"
                    >
                      ล้างตัวกรองทั้งหมด
                    </button>
                  )}
                </div>
              ) : viewMode === 'kanban' ? (
                <KanbanView
                  assets={filteredAssets}
                  onSelectAsset={a => {
                    setSelectedPhotoId(null);
                    setDetailTab('details');
                    setSelectedAssetId(a.id);
                  }}
                  onQuickStatus={handleQuickStatusChange}
                />
              ) : viewMode === 'table' ? (
                <TableView
                  assets={pagedAssets}
                  onSelectAsset={a => {
                    setSelectedPhotoId(null);
                    setDetailTab('details');
                    setSelectedAssetId(a.id);
                  }}
                  onEditAsset={a => setEditingAsset(a)}
                  onQuickCheck={a => handleAssetAction('check', a)}
                  onQuickStatus={handleQuickStatusChange}
                />
              ) : (
                /* GRID CARDS VIEW */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {pagedAssets.map(asset => {
                    const coverPhoto =
                      (asset.photos || []).find(p => p.kind === 'asset') || (asset.photos || [])[0] || null;
                    return (
                      <div
                        key={asset.id}
                        onClick={() => {
                          setSelectedPhotoId(null);
                          setDetailTab('details');
                          setSelectedAssetId(asset.id);
                        }}
                        className="glass-card rounded-2xl overflow-hidden cursor-pointer group flex flex-col justify-between"
                      >
                        <div>
                          {/* Visual Header */}
                          <div className="h-44 bg-slate-900/50 relative overflow-hidden flex items-center justify-center">
                            {coverPhoto ? (
                              <img
                                src={`/api/photos?id=${coverPhoto.id}`}
                                alt={asset.description}
                                loading="lazy"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                            ) : (
                              <div className="flex flex-col items-center gap-2 text-slate-400 dark:text-slate-600">
                                <Icon name="box" size={38} />
                                <span className="text-[11px] font-medium">ไม่มีรูปภาพ</span>
                              </div>
                            )}

                            {/* Top Left Category Pill */}
                            <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[11px] font-bold bg-black/65 text-white backdrop-blur-md border border-white/10">
                              {getCategory(asset.description)}
                            </span>

                            {/* Top Right QR & Open Icon */}
                            <div className="absolute top-3 right-3 flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  setSelectedPhotoId(null);
                                  setDetailTab('qr');
                                  setSelectedAssetId(asset.id);
                                }}
                                className="p-1.5 rounded-lg bg-black/65 text-white/90 hover:text-emerald-400 backdrop-blur-md transition"
                                title="ดู QR Code ประจำทรัพย์สิน"
                              >
                                <Icon name="qr" size={14} />
                              </button>
                            </div>

                            {/* Bottom Right Photo Count Badge */}
                            <span className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-lg text-[11px] font-mono font-semibold bg-black/70 text-white backdrop-blur-md flex items-center gap-1">
                              <Icon name="camera" size={12} />
                              <span>{(asset.photos || []).length}</span>
                            </span>
                          </div>

                          {/* Card Body */}
                          <div className="p-4 space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <p
                                className={`font-mono text-xs font-bold truncate ${
                                  asset.assetNo
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-amber-500 italic'
                                }`}
                              >
                                {asset.assetNo || 'ยังไม่ระบุรหัสทรัพย์สิน'}
                              </p>
                              {asset.po && (
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 shrink-0">
                                  PO: {asset.po}
                                </span>
                              )}
                            </div>

                            <h3 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-2 leading-snug min-h-[2.5rem]">
                              {asset.description}
                            </h3>

                            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
                              <span className="flex items-center gap-1 truncate max-w-[72%]">
                                <Icon name="mapPin" size={13} className="text-emerald-500 shrink-0" />
                                <span className="truncate">{asset.location || 'ไม่ระบุสถานที่'}</span>
                              </span>
                              <span className="font-bold text-slate-800 dark:text-slate-200 shrink-0">
                                {formatNumber(asset.quantity)} ชิ้น
                              </span>
                            </div>

                            {/* Tagging People Chips */}
                            <div className="flex flex-wrap gap-1 pt-1">
                              {(asset.taggingPeople || []).length > 0 ? (
                                asset.taggingPeople.map(p => (
                                  <span
                                    key={p}
                                    className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-white/5"
                                  >
                                    {p}
                                  </span>
                                ))
                              ) : (
                                <span className="text-[11px] text-slate-400 italic">ยังไม่ระบุผู้ติดรหัส</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Card Footer */}
                        <div className="px-4 py-3 border-t border-slate-200/60 dark:border-white/5 flex items-center justify-between gap-2 bg-slate-50/50 dark:bg-slate-900/30">
                          <StatusBadge status={asset.status} deletedAt={asset.deletedAt} />
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                            <span>{asset.receivedDate ? formatThaiDate(asset.receivedDate) : 'ไม่ระบุวันที่'}</span>
                            {asset.checkedAt && (
                              <span
                                className="p-1 rounded-full bg-emerald-500/20 text-emerald-500"
                                title={`ตรวจหน้างานแล้วเมื่อ ${formatThaiDate(asset.checkedAt, true)}`}
                              >
                                <Icon name="check" size={12} />
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Pagination Bar */}
              {filteredAssets.length > 0 && viewMode !== 'kanban' && (
                <div className="glass-panel rounded-2xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 text-xs">
                  <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
                    <span>
                      แสดง <strong>{(safePage - 1) * pageSize + 1}</strong> –{' '}
                      <strong>{Math.min(safePage * pageSize, filteredAssets.length)}</strong> จากทั้งหมด{' '}
                      <strong>{formatNumber(filteredAssets.length)}</strong> รายการ
                    </span>
                    <select
                      value={pageSize}
                      onChange={e => setPageSize(Number(e.target.value))}
                      className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/10"
                    >
                      <option value={12}>12 / หน้า</option>
                      <option value={24}>24 / หน้า</option>
                      <option value={48}>48 / หน้า</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      disabled={safePage <= 1}
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      className="px-3 py-1.5 rounded-xl font-semibold bg-slate-100 dark:bg-slate-800 disabled:opacity-40 hover:border-emerald-500/40 border border-transparent transition"
                    >
                      ← หน้าก่อนหน้า
                    </button>
                    <span className="px-3 py-1.5 font-mono font-bold">
                      {safePage} / {totalPages}
                    </span>
                    <button
                      disabled={safePage >= totalPages}
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      className="px-3.5 py-1.5 rounded-xl font-semibold bg-slate-100 dark:bg-slate-800 disabled:opacity-40 hover:border-emerald-500/40 border border-transparent transition"
                    >
                      หน้าถัดไป →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Footer */}
          <footer className="pt-6 pb-10 border-t border-slate-200/60 dark:border-white/10 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-600 dark:text-slate-300">BU ASSET · ทะเบียนทรัพย์สิน</span>
              <span>·</span>
              <span>Modern Edition v2.0 (JSON + Photo Folder + Google Auth)</span>
            </div>
            <div>
              ข้อมูลทรัพย์สิน 381 รายการ · รูปภาพ 200 รูป · ประวัติการทำงาน 755 รายการ
            </div>
          </footer>
        </main>
      </div>

      {/* ASSET DETAILS MODAL / DRAWER */}
      {selectedAsset && (
        <AssetDetailModal
          asset={selectedAsset}
          detailTab={detailTab}
          setDetailTab={setDetailTab}
          selectedPhotoId={selectedPhotoId}
          setSelectedPhotoId={setSelectedPhotoId}
          historyEvents={assetHistoryEvents}
          isDuplicateCode={duplicateAssetNos.has(selectedAsset.assetNo)}
          busy={busy}
          onClose={() => setSelectedAssetId(null)}
          onEdit={() => setEditingAsset(selectedAsset)}
          onCheck={() => handleAssetAction('check', selectedAsset)}
          onDelete={() =>
            setConfirmDelete({
              kind: 'asset',
              id: selectedAsset.id,
              title: selectedAsset.description
            })
          }
          onRestore={() => handleAssetAction('restore', selectedAsset)}
          onPermanentDelete={() =>
            setConfirmDelete({
              kind: 'permanent',
              id: selectedAsset.id,
              title: selectedAsset.description
            })
          }
          onDeletePhoto={photoId =>
            setConfirmDelete({
              kind: 'photo',
              id: photoId,
              title: 'รูปภาพนี้'
            })
          }
          onOpenLightbox={p => setLightboxPhoto({ ...p, description: selectedAsset.description })}
          onUploaded={async () => {
            await fetchAllData();
            showMessage('อัปโหลดรูปภาพและบันทึกลงโฟลเดอร์ data/photos เรียบร้อยแล้ว');
          }}
          onCopyLink={() => {
            const url = `${window.location.origin}/?asset=${encodeURIComponent(selectedAsset.id)}`;
            navigator.clipboard.writeText(url);
            showMessage('คัดลอกลิงก์รายการทรัพย์สินแล้ว');
          }}
        />
      )}

      {/* ADD / EDIT ASSET MODAL */}
      {editingAsset && (
        <AssetEditorModal
          asset={editingAsset}
          busy={busy}
          user={user}
          uniquePeople={uniquePeople}
          onClose={() => setEditingAsset(null)}
          onSave={(formData, pendingPhotos) => {
            if (editingAsset === 'new') {
              return handleAssetAction('create', null, formData, pendingPhotos);
            } else {
              return handleAssetAction('update', editingAsset, formData, pendingPhotos);
            }
          }}
        />
      )}

      {/* EXCEL IMPORT MODAL */}
      {showImportModal && (
        <ExcelImportModal
          onClose={() => setShowImportModal(false)}
          onImported={async count => {
            await fetchAllData();
            showMessage(`นำเข้าทรัพย์สินจาก Excel สำเร็จ ${count} รายการ`);
          }}
        />
      )}

      {/* EXPORT & BACKUP MODAL */}
      {showExportModal && (
        <ExportBackupModal
          filteredCount={filteredAssets.length}
          totalCount={assets.length}
          onClose={() => setShowExportModal(false)}
          onExportCsv={exportCsv}
          onExportJson={exportBackupJson}
          onRestored={async count => {
            setShowExportModal(false);
            await fetchAllData();
            showMessage(`กู้คืนข้อมูลจากไฟล์ JSON สำเร็จ (${count} รายการ)`);
          }}
        />
      )}

      {/* AI ASSISTANT DRAWER */}
      {showAiDrawer && (
        <AiAssistantDrawer
          onClose={() => setShowAiDrawer(false)}
          onOpenAsset={(id, openHistory) => {
            setShowAiDrawer(false);
            setDetailTab(openHistory ? 'history' : 'details');
            setSelectedAssetId(id);
          }}
        />
      )}

      {/* GOOGLE AUTH & SYSTEM SETTINGS MODAL */}
      {showAuthModal && (
        <AuthAndSettingsModal
          user={user}
          authConfig={authConfig}
          assetsCount={assets.length}
          photosCount={totalPhotosCount}
          onClose={() => setShowAuthModal(false)}
          onUserChanged={u => {
            setUser(u);
            if (!u) {
              setAssets([]);
              setSelectedAssetId(null);
              showMessage('ออกจากระบบเรียบร้อยแล้ว');
            } else {
              fetchAllData();
              showMessage(`เข้าสู่ระบบในชื่อ ${u.name} (${u.email})`);
            }
          }}
          onConfigSaved={cfg => {
            setAuthConfig(prev => ({ ...prev, ...cfg }));
            showMessage('บันทึกการตั้งค่าระบบเรียบร้อยแล้ว');
          }}
        />
      )}

      {/* COMMAND PALETTE (Ctrl+K) */}
      {showCmdPalette && (
        <CommandPaletteModal
          assets={activeAssets}
          onClose={() => setShowCmdPalette(false)}
          onSelectAsset={a => {
            setShowCmdPalette(false);
            setDetailTab('details');
            setSelectedAssetId(a.id);
          }}
          onNavigate={nav => {
            setShowCmdPalette(false);
            setActiveNav(nav);
          }}
          onAction={act => {
            setShowCmdPalette(false);
            if (act === 'new') setEditingAsset('new');
            if (act === 'ai') setShowAiDrawer(true);
            if (act === 'import') setShowImportModal(true);
            if (act === 'export') setShowExportModal(true);
          }}
        />
      )}

      {/* CONFIRM DELETE DIALOG */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel rounded-2xl max-w-md w-full p-6 space-y-4 animate-fade-in">
            <div className="flex items-center gap-3 text-rose-500">
              <div className="p-2.5 rounded-xl bg-rose-500/15">
                <Icon name="trash" size={22} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {confirmDelete.kind === 'photo'
                  ? 'ยืนยันการลบรูปภาพ?'
                  : confirmDelete.kind === 'permanent'
                  ? 'ลบทรัพย์สินถาวร?'
                  : 'ย้ายทรัพย์สินเข้าถังขยะ?'}
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {confirmDelete.kind === 'photo'
                ? 'รูปภาพนี้จะถูกนำออกจากรายการทรัพย์สินและลบออกจากโฟลเดอร์ data/photos'
                : confirmDelete.kind === 'permanent'
                ? `รายการ "${confirmDelete.title}" และรูปภาพที่เกี่ยวข้องจะถูกลบออกจากไฟล์ JSON ถาวร ไม่สามารถกู้คืนได้`
                : `รายการ "${confirmDelete.title}" จะถูกย้ายไปที่ถังขยะ สามารถกู้คืนได้ภายใน 7 วัน`}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                disabled={busy}
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-200 dark:bg-slate-800"
              >
                ยกเลิก
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  if (confirmDelete.kind === 'photo') {
                    handleDeletePhoto(confirmDelete.id);
                  } else if (confirmDelete.kind === 'permanent') {
                    handleAssetAction('permanent_delete', { id: confirmDelete.id });
                  } else {
                    handleAssetAction('delete', { id: confirmDelete.id });
                  }
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white"
              >
                {busy ? 'กำลังดำเนินการ...' : 'ยืนยันการลบ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULLSCREEN PHOTO LIGHTBOX */}
      {lightboxPhoto && (() => {
        const list = lightboxPhoto.photosList || (selectedAsset?.photos?.length ? selectedAsset.photos : [lightboxPhoto]);
        const currentIdx = Math.max(0, list.findIndex(p => p.id === lightboxPhoto.id));
        const hasMultiple = list.length > 1;
        const goPhoto = delta => {
          const next = list[(currentIdx + delta + list.length) % list.length];
          setLightboxPhoto({ ...next, description: lightboxPhoto.description, photosList: list });
        };
        return (
          <div
            onClick={() => setLightboxPhoto(null)}
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4"
          >
            <div
              onClick={e => e.stopPropagation()}
              className="max-w-4xl w-full flex flex-col items-center gap-3 animate-fade-in relative"
            >
              <div className="w-full flex items-center justify-between text-white px-2">
                <div>
                  <h4 className="text-sm font-bold">{lightboxPhoto.description || lightboxPhoto.filename}</h4>
                  <p className="text-xs text-slate-400">
                    {lightboxPhoto.kind === 'room' ? 'รูปสถานที่' : 'รูปทรัพย์สิน'} · {lightboxPhoto.filename}
                    {hasMultiple && ` (${currentIdx + 1} / ${list.length})`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={`/api/photos?id=${lightboxPhoto.id}`}
                    download={lightboxPhoto.filename || `${lightboxPhoto.id}.png`}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Icon name="download" size={14} />
                    <span>ดาวน์โหลดรูป</span>
                  </a>
                  <button
                    onClick={() => setLightboxPhoto(null)}
                    className="p-2 rounded-xl bg-white/10 hover:bg-white/20"
                  >
                    <Icon name="x" size={18} />
                  </button>
                </div>
              </div>
              <div className="relative w-full flex items-center justify-center">
                {hasMultiple && (
                  <button
                    type="button"
                    onClick={() => goPhoto(-1)}
                    className="absolute left-2 z-10 p-3 rounded-full bg-black/60 hover:bg-emerald-500 text-white border border-white/15 backdrop-blur-md transition shadow-lg"
                    title="รูปก่อนหน้า"
                  >
                    <Icon name="chevronLeft" size={22} />
                  </button>
                )}
                <img
                  src={`/api/photos?id=${lightboxPhoto.id}`}
                  alt={lightboxPhoto.filename}
                  className="max-h-[80vh] w-auto object-contain rounded-2xl border border-white/10 shadow-2xl"
                />
                {hasMultiple && (
                  <button
                    type="button"
                    onClick={() => goPhoto(1)}
                    className="absolute right-2 z-10 p-3 rounded-full bg-black/60 hover:bg-emerald-500 text-white border border-white/15 backdrop-blur-md transition shadow-lg"
                    title="รูปถัดไป"
                  >
                    <Icon name="chevronRight" size={22} />
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ============================================================================
// ANALYTICS BENTO DASHBOARD
// ============================================================================
function AnalyticsDashboard({ assets, totalPhotosCount, onFilterLocation, onFilterPerson }) {
  const stats = useMemo(() => {
    const done = assets.filter(a => a.status === 'Done');
    const onProcess = assets.filter(a => a.status === 'On Process');
    const review = assets.filter(a => a.status === 'Needs Review');
    const pct = assets.length ? Math.round((done.length / assets.length) * 100) : 0;

    // Building / Location breakdown
    const locMap = new Map();
    for (const a of assets) {
      const loc = a.location || 'ไม่ระบุสถานที่';
      const cur = locMap.get(loc) || { loc, total: 0, done: 0, qty: 0 };
      cur.total += 1;
      if (a.status === 'Done') cur.done += 1;
      cur.qty += Number(a.quantity) || 0;
      locMap.set(loc, cur);
    }
    const topLocations = [...locMap.values()].sort((a, b) => b.total - a.total).slice(0, 10);

    // Building Group Breakdown (A5, B4, C3, etc.)
    const bldgMap = new Map();
    for (const a of assets) {
      const b = getBuildingCode(a.location);
      const cur = bldgMap.get(b) || { code: b, count: 0, qty: 0 };
      cur.count += 1;
      cur.qty += Number(a.quantity) || 0;
      bldgMap.set(b, cur);
    }
    const topBuildings = [...bldgMap.values()].sort((a, b) => b.count - a.count).slice(0, 8);

    // Team Contribution
    const teamMap = new Map();
    for (const a of assets) {
      for (const p of a.taggingPeople || []) {
        const cur = teamMap.get(p) || { name: p, records: 0, qty: 0 };
        cur.records += 1;
        cur.qty += Number(a.quantity) || 0;
        teamMap.set(p, cur);
      }
    }
    const teamList = [...teamMap.values()].sort((a, b) => b.records - a.records);

    // Category Breakdown
    const catMap = new Map();
    for (const a of assets) {
      const c = getCategory(a.description);
      const cur = catMap.get(c) || { category: c, count: 0, qty: 0 };
      cur.count += 1;
      cur.qty += Number(a.quantity) || 0;
      catMap.set(c, cur);
    }
    const categories = [...catMap.values()].sort((a, b) => b.count - a.count);

    return { done, onProcess, review, pct, topLocations, topBuildings, teamList, categories };
  }, [assets]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Row 1: Progress Ring + Building Breakdown + Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Radial Progress Card */}
        <div className="glass-panel rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-500">
              TAGGING COMPLETION
            </span>
            <h3 className="text-lg font-extrabold mt-1">ความคืบหน้าการติดรหัสทรัพย์สิน</h3>
          </div>

          <div className="my-6 flex items-center justify-center gap-8">
            <div className="relative w-36 h-36 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="12"
                  className="text-slate-200 dark:text-slate-800"
                />
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  fill="none"
                  stroke="url(#gradEmerald)"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={`${(stats.pct / 100) * 314} 314`}
                />
                <defs>
                  <linearGradient id="gradEmerald" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#6366f1" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-extrabold">{stats.pct}%</span>
                <span className="text-[11px] text-slate-400">สำเร็จแล้ว</span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <p className="text-slate-400">ติดรหัสแล้ว (Done)</p>
                <p className="text-lg font-extrabold text-emerald-500">{stats.done.length} รายการ</p>
              </div>
              <div>
                <p className="text-slate-400">รอดำเนินการ (On Process)</p>
                <p className="text-lg font-extrabold text-amber-500">{stats.onProcess.length} รายการ</p>
              </div>
              <div>
                <p className="text-slate-400">รูปถ่ายประกอบทั้งหมด</p>
                <p className="text-lg font-extrabold text-indigo-400">{totalPhotosCount} รูป</p>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-100/80 dark:bg-slate-900/60 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>ฐานข้อมูล: data/db.json</span>
            <span className="font-mono text-emerald-500 font-bold">SYNCED</span>
          </div>
        </div>

        {/* Building Distribution */}
        <div className="glass-panel rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-widest text-indigo-400">
              CAMPUS BUILDINGS
            </span>
            <h3 className="text-lg font-extrabold mt-1">สัดส่วนทรัพย์สินแยกตามอาคาร</h3>
          </div>

          <div className="space-y-3 my-4">
            {stats.topBuildings.map(b => {
              const widthPct = Math.max(6, Math.round((b.count / (stats.topBuildings[0]?.count || 1)) * 100));
              return (
                <div key={b.code} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-bold">{b.code}</span>
                    <span className="text-slate-400 font-mono">
                      {b.count} รายการ ({formatNumber(b.qty)} ชิ้น)
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-slate-400">คำนวณจากสถานที่จริง (Location) ทั้งหมด 123 ห้อง</p>
        </div>

        {/* Team Contribution & Category Breakdown */}
        <div className="glass-panel rounded-2xl p-6 flex flex-col justify-between space-y-5">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-widest text-brand-gold">
              TEAM LEADERBOARD
            </span>
            <h3 className="text-lg font-extrabold mt-1">ผู้มีส่วนร่วมติดรหัสทรัพย์สิน</h3>
            <div className="mt-3 space-y-2 max-h-48 overflow-y-auto pr-1">
              {stats.teamList.map((member, i) => (
                <button
                  key={member.name}
                  onClick={() => onFilterPerson(member.name)}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl bg-slate-100/80 dark:bg-slate-900/60 hover:border-emerald-500/40 border border-transparent transition text-xs"
                >
                  <span className="flex items-center gap-2.5 font-bold">
                    <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono text-[10px] flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span>{member.name}</span>
                  </span>
                  <span className="font-mono text-slate-400">
                    {member.records} รายการ ({formatNumber(member.qty)} ชิ้น)
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200/60 dark:border-white/10">
            <p className="text-xs font-bold mb-2">หมวดหมู่อุปกรณ์</p>
            <div className="grid grid-cols-2 gap-2">
              {stats.categories.map(c => (
                <div
                  key={c.category}
                  className="p-2.5 rounded-xl bg-slate-100/70 dark:bg-slate-900/60 flex items-center justify-between text-xs"
                >
                  <span className="font-semibold">{c.category}</span>
                  <span className="font-mono font-bold text-emerald-500">{c.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Top 10 Rooms / Locations */}
      <div className="glass-panel rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-extrabold">10 อันดับห้อง/สถานที่ที่มีรายการทรัพย์สินมากที่สุด</h3>
            <p className="text-xs text-slate-400">คลิกที่ห้องเพื่อกรองดูรายการทรัพย์สินในห้องนั้นทันที</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {stats.topLocations.map(item => {
            const donePct = item.total ? Math.round((item.done / item.total) * 100) : 0;
            return (
              <button
                key={item.loc}
                onClick={() => onFilterLocation(item.loc)}
                className="p-3.5 rounded-xl bg-slate-100/70 dark:bg-slate-900/60 hover:border-emerald-500/40 border border-slate-200/60 dark:border-white/5 transition text-left space-y-2"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold truncate pr-2">{item.loc}</span>
                  <span className="font-mono text-emerald-500 shrink-0">
                    {item.done}/{item.total} รายการ ({donePct}%)
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${donePct}%` }} />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// TABLE VIEW & KANBAN VIEW
// ============================================================================
function TableView({ assets, onSelectAsset, onEditAsset, onQuickCheck, onQuickStatus }) {
  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-white/10 bg-slate-100/70 dark:bg-slate-900/60 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <th className="py-3.5 px-4">รูป</th>
              <th className="py-3.5 px-4">รหัสทรัพย์สิน</th>
              <th className="py-3.5 px-4">ชื่อ / รายละเอียด</th>
              <th className="py-3.5 px-4">สถานที่จริง</th>
              <th className="py-3.5 px-4 text-right">จำนวน</th>
              <th className="py-3.5 px-4">ผู้ติดรหัส</th>
              <th className="py-3.5 px-4">สถานะ</th>
              <th className="py-3.5 px-4 text-right">จัดการด่วน</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/60 dark:divide-white/5">
            {assets.map(a => {
              const thumb = (a.photos || [])[0];
              return (
                <tr
                  key={a.id}
                  onClick={() => onSelectAsset(a)}
                  className="hover:bg-emerald-500/5 cursor-pointer transition"
                >
                  <td className="py-3 px-4">
                    <div className="w-11 h-11 rounded-xl bg-slate-800 overflow-hidden flex items-center justify-center">
                      {thumb ? (
                        <img src={`/api/photos?id=${thumb.id}`} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Icon name="box" size={16} className="text-slate-500" />
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                    {a.assetNo || <span className="text-amber-500 italic">ยังไม่ระบุ</span>}
                    {a.po && <div className="text-[10px] text-slate-400 font-normal">PO: {a.po}</div>}
                  </td>
                  <td className="py-3 px-4 max-w-xs">
                    <div className="font-bold text-slate-900 dark:text-white line-clamp-2">{a.description}</div>
                    {a.remark && <div className="text-[11px] text-amber-500 truncate mt-0.5">{a.remark}</div>}
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-300 max-w-[200px] truncate">
                    {a.location || a.locationSap || '—'}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold whitespace-nowrap">
                    {formatNumber(a.quantity)} ชิ้น
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1">
                      {(a.taggingPeople || []).map(p => (
                        <span
                          key={p}
                          className="px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 text-[10px]"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <StatusBadge status={a.status} deletedAt={a.deletedAt} />
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                    <div className="inline-flex items-center gap-1">
                      {a.status !== 'Done' && !a.deletedAt && (
                        <button
                          onClick={() => onQuickStatus(a, 'Done')}
                          className="px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500 hover:text-white font-semibold transition"
                          title="เปลี่ยนสถานะเป็นติดรหัสแล้ว"
                        >
                          ติดรหัสแล้ว
                        </button>
                      )}
                      <button
                        onClick={() => onQuickCheck(a)}
                        className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:text-emerald-400"
                        title="บันทึกตรวจหน้างานแล้ว"
                      >
                        <Icon name="check" size={14} />
                      </button>
                      <button
                        onClick={() => onEditAsset(a)}
                        className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:text-indigo-400"
                        title="แก้ไขข้อมูล"
                      >
                        <Icon name="edit" size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KanbanView({ assets, onSelectAsset, onQuickStatus }) {
  const columns = [
    { id: 'On Process', title: 'กำลังดำเนินการ (On Process)', color: 'border-indigo-500/40' },
    { id: 'Needs Review', title: 'ต้องตรวจสอบ (Needs Review)', color: 'border-amber-500/40' },
    { id: 'Done', title: 'ติดรหัสแล้ว (Done)', color: 'border-emerald-500/40' }
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {columns.map(col => {
        const items = assets.filter(a => a.status === col.id);
        return (
          <div key={col.id} className={`glass-panel rounded-2xl p-4 border-t-4 ${col.color} flex flex-col max-h-[75vh]`}>
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200/60 dark:border-white/10">
              <h3 className="text-sm font-extrabold">{col.title}</h3>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-slate-200 dark:bg-slate-800">
                {items.length}
              </span>
            </div>
            <div className="space-y-2.5 overflow-y-auto pr-1 flex-1">
              {items.slice(0, 60).map(a => (
                <div
                  key={a.id}
                  onClick={() => onSelectAsset(a)}
                  className="p-3.5 rounded-xl bg-white/80 dark:bg-slate-900/70 border border-slate-200/60 dark:border-white/5 hover:border-emerald-500/40 cursor-pointer transition space-y-2"
                >
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-emerald-500 font-bold">{a.assetNo || 'ยังไม่ระบุรหัส'}</span>
                    <span className="text-slate-400">{a.quantity} ชิ้น</span>
                  </div>
                  <p className="text-xs font-bold line-clamp-2">{a.description}</p>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                    <span className="truncate max-w-[65%]">{a.location || 'ไม่ระบุห้อง'}</span>
                    {col.id !== 'Done' && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          onQuickStatus(a, 'Done');
                        }}
                        className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white font-semibold"
                      >
                        ✓ ติดรหัสแล้ว
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {items.length > 60 && (
                <p className="text-center text-[11px] text-slate-400 py-2">
                  แสดง 60 รายการแรก (ใช้ช่องค้นหาเพื่อกรองเพิ่มเติม)
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// ASSET DETAILS DRAWER / MODAL (With QR Tag, Photos Upload, Audit History)
// ============================================================================
function AssetDetailModal({
  asset,
  detailTab,
  setDetailTab,
  selectedPhotoId,
  setSelectedPhotoId,
  historyEvents,
  isDuplicateCode,
  busy,
  onClose,
  onEdit,
  onCheck,
  onDelete,
  onRestore,
  onPermanentDelete,
  onDeletePhoto,
  onOpenLightbox,
  onUploaded,
  onCopyLink
}) {
  const [uploadKind, setUploadKind] = useState('asset');
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const photos = asset.photos || [];
  const activePhoto = photos.find(p => p.id === selectedPhotoId) || photos.find(p => p.kind === 'asset') || photos[0] || null;

  const handleFilesSelected = async fileList => {
    if (!fileList || !fileList.length) return;
    const files = Array.from(fileList);
    if (photos.length + files.length > 30) {
      alert('เพิ่มรูปได้สูงสุด 30 รูปต่อรายการ');
      return;
    }
    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        setUploadStatus(`กำลังย่อและบันทึกรูปที่ ${i + 1} / ${files.length}...`);
        const compressed = await compressImageToDataUrl(files[i]);
        const res = await fetch('/api/photos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assetId: asset.id,
            kind: uploadKind,
            filename: compressed.filename,
            dataUrl: compressed.dataUrl
          })
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'อัปโหลดไม่สำเร็จ');
        }
      }
      await onUploaded();
    } catch (err) {
      alert(err.message);
    } finally {
      setUploading(false);
      setUploadStatus('');
    }
  };

  const assetUrl = `${window.location.origin}/?asset=${encodeURIComponent(asset.id)}`;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(assetUrl)}`;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex justify-end"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-2xl bg-white dark:bg-[#0b101d] h-full flex flex-col justify-between shadow-2xl border-l border-slate-200 dark:border-white/10 animate-fade-in overflow-hidden"
      >
        {/* Top Modal Header */}
        <div className="p-6 border-b border-slate-200 dark:border-white/10 flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-emerald-500">
              ASSET DETAILS
            </span>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white leading-snug">
              {asset.description}
            </h2>
            <p className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">
              {asset.assetNo || 'ยังไม่ระบุรหัสทรัพย์สิน'}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <StatusBadge status={asset.status} deletedAt={asset.deletedAt} />
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800">
                {formatNumber(asset.quantity)} ชิ้น
              </span>
              {asset.sourceRow && (
                <span className="text-xs text-slate-400 font-mono">Excel แถว {asset.sourceRow}</span>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-white transition"
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* Tabs Bar */}
        <div className="px-6 pt-3 border-b border-slate-200 dark:border-white/10 flex items-center gap-1 overflow-x-auto">
          {[
            { id: 'details', label: 'ข้อมูลหลัก' },
            { id: 'photos', label: `รูปภาพ (${photos.length})` },
            { id: 'qr', label: 'ป้าย QR Code' },
            { id: 'history', label: `ประวัติ (${historyEvents.length})` },
            { id: 'source', label: 'ต้นฉบับ Excel' }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setDetailTab(t.id)}
              className={`px-3.5 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition ${
                detailTab === t.id
                  ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: DETAILS */}
          {detailTab === 'details' && (
            <div className="space-y-5">
              {activePhoto ? (() => {
                const activeIdx = Math.max(0, photos.findIndex(p => p.id === activePhoto.id));
                const stepPhoto = (e, delta) => {
                  e.stopPropagation();
                  const next = photos[(activeIdx + delta + photos.length) % photos.length];
                  setSelectedPhotoId(next.id);
                };
                return (
                <div className="space-y-2.5">
                  <div
                    onClick={() => onOpenLightbox(activePhoto)}
                    className="relative h-64 rounded-2xl overflow-hidden bg-slate-900 cursor-pointer group border border-slate-200/60 dark:border-white/10"
                  >
                    <img
                      src={`/api/photos?id=${activePhoto.id}`}
                      alt={asset.description}
                      className="w-full h-full object-contain"
                    />
                    {photos.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={e => stepPhoto(e, -1)}
                          className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 hover:bg-emerald-500 text-white border border-white/15 backdrop-blur-md transition shadow-lg"
                          title="รูปก่อนหน้า"
                        >
                          <Icon name="chevronLeft" size={18} />
                        </button>
                        <button
                          type="button"
                          onClick={e => stepPhoto(e, 1)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 hover:bg-emerald-500 text-white border border-white/15 backdrop-blur-md transition shadow-lg"
                          title="รูปถัดไป"
                        >
                          <Icon name="chevronRight" size={18} />
                        </button>
                        <span className="absolute top-3 right-3 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-black/65 text-white backdrop-blur-md">
                          {activeIdx + 1} / {photos.length}
                        </span>
                      </>
                    )}
                    <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-between text-white text-xs">
                      <span>{activePhoto.kind === 'room' ? 'รูปสถานที่' : 'รูปทรัพย์สิน'} · {activePhoto.filename}</span>
                      <span className="flex items-center gap-1 font-semibold text-emerald-300">
                        <Icon name="external" size={14} /> ขยายเต็มจอ
                      </span>
                    </div>
                  </div>

                  {photos.length > 1 && (
                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                      {photos.map(p => (
                        <button
                          key={p.id}
                          onClick={() => setSelectedPhotoId(p.id)}
                          className={`w-16 h-16 rounded-xl overflow-hidden border-2 shrink-0 transition ${
                            activePhoto.id === p.id ? 'border-emerald-500 scale-105' : 'border-transparent opacity-60'
                          }`}
                        >
                          <img src={`/api/photos?id=${p.id}`} alt="" className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                );
              })() : (
                <div className="p-6 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-between">
                  <div className="flex items-center gap-3 text-slate-400 text-xs">
                    <Icon name="camera" size={22} />
                    <span>ยังไม่มีรูปภาพสำหรับรายการนี้</span>
                  </div>
                  <button
                    onClick={() => setDetailTab('photos')}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-500 text-xs font-bold hover:bg-emerald-500/25"
                  >
                    + เพิ่มรูปภาพ
                  </button>
                </div>
              )}

              {/* Metadata Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <DetailField label="สถานที่จริง (Location)" value={asset.location} />
                <DetailField label="จำนวน" value={`${formatNumber(asset.quantity)} ชิ้น`} />
                <DetailField label="สถานที่ใน SAP" value={asset.locationSap} full />
                <DetailField label="วันที่ได้รับ" value={formatThaiDate(asset.receivedDate)} />
                <DetailField label="เลขที่ PO" value={asset.po} mono />
                <DetailField label="ผู้สร้างรหัส" value={asset.createdBy} />
                <DetailField label="ผู้ติดต่อ" value={asset.contact} />
                <DetailField label="วันที่สร้างในระบบ" value={formatThaiDate(asset.createdAt, true)} />
                <DetailField label="วันที่แก้ไขล่าสุด" value={formatThaiDate(asset.updatedAt, true)} />
                <DetailField
                  label="วันเวลาติดรหัสแล้ว"
                  value={asset.taggedAt ? formatThaiDate(asset.taggedAt, true) : 'ยังไม่ได้ติดรหัส'}
                />
                <DetailField
                  label="ตรวจเช็คหน้างานล่าสุด"
                  value={asset.checkedAt ? formatThaiDate(asset.checkedAt, true) : 'ยังไม่มีบันทึกการตรวจในแอป'}
                />
              </div>

              {/* Tagging People */}
              <div className="p-4 rounded-2xl bg-slate-100/70 dark:bg-slate-900/60 space-y-2">
                <h4 className="text-xs font-bold text-slate-500">ผู้เกี่ยวข้องกับการติดรหัส</h4>
                <div className="flex flex-wrap gap-1.5">
                  {(asset.taggingPeople || []).length > 0 ? (
                    asset.taggingPeople.map(p => (
                      <span
                        key={p}
                        className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/25"
                      >
                        {p}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-400 italic">ยังไม่ระบุผู้เกี่ยวข้อง</span>
                  )}
                </div>
              </div>

              {asset.remark && (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 space-y-1">
                  <h4 className="text-xs font-bold text-amber-500">หมายเหตุหน้างาน</h4>
                  <p className="text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{asset.remark}</p>
                </div>
              )}

              {isDuplicateCode && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-400">
                  ⚠️ รหัสทรัพย์สินนี้ปรากฏมากกว่า 1 รายการในระบบ กรุณาตรวจสอบรายละเอียดก่อนแก้ไข
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={onCopyLink}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:border-emerald-500/40 border border-transparent transition"
                >
                  <Icon name="copy" size={14} />
                  <span>คัดลอกลิงก์รายการ</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: PHOTOS MANAGER */}
          {detailTab === 'photos' && (
            <div className="space-y-6">
              {!asset.deletedAt && (
                <div className="p-4 rounded-2xl bg-slate-100/80 dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold">อัปโหลดรูปภาพใหม่ (บันทึกลง data/photos/)</span>
                    <select
                      value={uploadKind}
                      onChange={e => setUploadKind(e.target.value)}
                      className="px-3 py-1.5 rounded-xl text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10"
                    >
                      <option value="asset">ประเภท: รูปทรัพย์สิน</option>
                      <option value="room">ประเภท: รูปสถานที่ / ห้อง</option>
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      disabled={uploading}
                      onClick={() => cameraInputRef.current?.click()}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-white flex items-center gap-2"
                    >
                      <Icon name="camera" size={15} />
                      <span>ถ่ายรูปจากกล้อง</span>
                    </button>
                    <button
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 flex items-center gap-2"
                    >
                      <Icon name="upload" size={15} />
                      <span>เลือกไฟล์รูปภาพ</span>
                    </button>
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={e => handleFilesSelected(e.target.files)}
                    />
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={e => handleFilesSelected(e.target.files)}
                    />
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {uploading ? uploadStatus : 'รองรับ JPEG, PNG, WebP · ย่อขนาดอัตโนมัติ · สูงสุด 30 รูปต่อรายการ'}
                  </p>
                </div>
              )}

              {['asset', 'room'].map(kind => {
                const list = photos.filter(p => p.kind === kind);
                return (
                  <div key={kind} className="space-y-2.5">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      {kind === 'asset' ? 'รูปทรัพย์สิน' : 'รูปสถานที่ / ห้อง'} ({list.length})
                    </h4>
                    {list.length === 0 ? (
                      <p className="text-xs text-slate-500 italic">ยังไม่มีรูปในหมวดนี้</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {list.map(p => (
                          <div
                            key={p.id}
                            className="group relative rounded-xl overflow-hidden bg-slate-900 aspect-square border border-slate-200/60 dark:border-white/10"
                          >
                            <img
                              src={`/api/photos?id=${p.id}`}
                              alt={p.filename}
                              onClick={() => onOpenLightbox(p)}
                              className="w-full h-full object-cover cursor-pointer group-hover:scale-105 transition"
                            />
                            {!asset.deletedAt && (
                              <button
                                onClick={() => onDeletePhoto(p.id)}
                                className="absolute top-2 right-2 p-1.5 rounded-lg bg-rose-600/90 text-white opacity-0 group-hover:opacity-100 transition"
                                title="ลบรูปภาพนี้"
                              >
                                <Icon name="trash" size={13} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 3: QR CODE STICKER */}
          {detailTab === 'qr' && (
            <div className="space-y-4 flex flex-col items-center py-4">
              <div
                id="printable-qr-card"
                className="p-6 rounded-2xl bg-white text-slate-900 border-2 border-slate-900 shadow-xl max-w-sm w-full space-y-4"
              >
                <div className="flex items-center justify-between border-b-2 border-slate-900 pb-2">
                  <div>
                    <div className="font-black text-base tracking-tight">BU ASSET REGISTER</div>
                    <div className="text-[10px] font-mono uppercase">BANGKOK UNIVERSITY</div>
                  </div>
                  <span className="px-2 py-0.5 text-[10px] font-mono font-bold border border-slate-900 rounded">
                    QTY: {asset.quantity}
                  </span>
                </div>

                <div className="flex justify-center py-2">
                  <img src={qrImageUrl} alt="Asset QR Code" className="w-44 h-44 object-contain" />
                </div>

                <div className="space-y-1 text-center border-t border-slate-300 pt-3">
                  <div className="font-mono font-black text-sm tracking-wide">
                    {asset.assetNo || 'NO-ASSET-CODE'}
                  </div>
                  <div className="text-xs font-bold line-clamp-2">{asset.description}</div>
                  <div className="text-[11px] text-slate-600">{asset.location || asset.locationSap || 'BU Campus'}</div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 text-white shadow-lg shadow-emerald-500/25"
                >
                  🖨️ พิมพ์ป้ายสติกเกอร์ QR Code
                </button>
                <button
                  onClick={onCopyLink}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800"
                >
                  คัดลอกลิงก์ QR
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: ASSET AUDIT HISTORY */}
          {detailTab === 'history' && (
            <div className="space-y-3">
              {historyEvents.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">ยังไม่มีประวัติการแก้ไขสำหรับรายการนี้</p>
              ) : (
                historyEvents.map(ev => (
                  <div key={ev.id} className="p-3.5 rounded-xl bg-slate-100/70 dark:bg-slate-900/60 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-500">{ev.action}</span>
                      <span className="text-slate-400">{formatThaiDate(ev.createdAt, true)}</span>
                    </div>
                    <p className="text-slate-500">
                      โดย {ev.actor} ({ev.actorEmail || 'N/A'})
                    </p>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 5: EXCEL SOURCE */}
          {detailTab === 'source' && (
            <div className="space-y-3 text-xs">
              {asset.sourceValues ? (
                <>
                  <p className="text-slate-400">
                    ข้อมูลต้นฉบับจากชีต <strong>{asset.sourceSheet || 'Format'}</strong> แถวที่{' '}
                    <strong>{asset.sourceRow}</strong>
                  </p>
                  <div className="space-y-2">
                    {Object.entries(asset.sourceValues).map(([k, v]) => (
                      <div key={k} className="p-3 rounded-xl bg-slate-100/70 dark:bg-slate-900/60">
                        <div className="font-bold text-slate-400 mb-1">{k}</div>
                        <pre className="font-mono text-[11px] whitespace-pre-wrap overflow-x-auto">
                          {typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v)}
                        </pre>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-slate-400 text-center py-8">รายการนี้ถูกเพิ่มผ่านแอปโดยตรง (ไม่มีข้อมูลแถวต้นฉบับจาก Excel)</p>
              )}
            </div>
          )}
        </div>

        {/* Bottom Action Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/60 flex flex-wrap items-center justify-between gap-2">
          {asset.deletedAt ? (
            <>
              <button
                disabled={busy}
                onClick={onRestore}
                className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold bg-emerald-500 text-white flex items-center justify-center gap-2"
              >
                <Icon name="undo" size={15} />
                <span>กู้คืนทรัพย์สิน</span>
              </button>
              <button
                disabled={busy}
                onClick={onPermanentDelete}
                className="py-2.5 px-4 rounded-xl text-xs font-bold bg-rose-600 text-white"
              >
                ลบถาวร
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <button
                  disabled={busy}
                  onClick={onEdit}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-500 to-teal-600 text-white flex items-center gap-1.5"
                >
                  <Icon name="edit" size={15} />
                  <span>แก้ไขข้อมูล</span>
                </button>
                <button
                  disabled={busy}
                  onClick={onCheck}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 flex items-center gap-1.5"
                >
                  <Icon name="check" size={15} />
                  <span>ตรวจหน้างานแล้ว</span>
                </button>
              </div>
              <button
                disabled={busy}
                onClick={onDelete}
                className="p-2.5 rounded-xl bg-rose-500/15 text-rose-500 hover:bg-rose-500 hover:text-white transition"
                title="ย้ายเข้าถังขยะ"
              >
                <Icon name="trash" size={16} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailField({ label, value, full = false, mono = false }) {
  return (
    <div className={`p-3.5 rounded-xl bg-slate-100/70 dark:bg-slate-900/50 ${full ? 'sm:col-span-2' : ''}`}>
      <div className="text-[11px] font-semibold text-slate-400">{label}</div>
      <div className={`mt-1 font-bold text-slate-900 dark:text-white break-words ${mono ? 'font-mono' : ''}`}>
        {value || <span className="text-slate-400 font-normal">ไม่ระบุ</span>}
      </div>
    </div>
  );
}

// ============================================================================
// ADD / EDIT ASSET MODAL
// ============================================================================
function AssetEditorModal({ asset, busy, user, uniquePeople, onClose, onSave }) {
  const isNew = asset === 'new';
  const [form, setForm] = useState(() =>
    isNew
      ? {
          description: '',
          assetNo: '',
          quantity: 1,
          location: '',
          locationSap: '',
          receivedDate: new Date().toISOString().slice(0, 10),
          po: '',
          createdBy: user?.name || 'PUNYANUCH.B',
          taggingPeople: [],
          contact: '',
          status: 'On Process',
          remark: ''
        }
      : { ...asset, taggingPeople: [...(asset.taggingPeople || [])] }
  );
  const [customPerson, setCustomPerson] = useState('');
  const [pendingPhotos, setPendingPhotos] = useState([]);
  const [photoKind, setPhotoKind] = useState('asset');
  const [preparingPhotos, setPreparingPhotos] = useState(false);
  const editorFileRef = useRef(null);
  const editorCameraRef = useRef(null);

  const handleSelectPhotos = async fileList => {
    if (!fileList || !fileList.length) return;
    const files = Array.from(fileList);
    setPreparingPhotos(true);
    try {
      const items = [];
      for (const f of files) {
        const compressed = await compressImageToDataUrl(f);
        items.push({
          tempId: Math.random().toString(36).slice(2),
          kind: photoKind,
          filename: compressed.filename,
          dataUrl: compressed.dataUrl
        });
      }
      setPendingPhotos(prev => [...prev, ...items].slice(0, 30));
    } catch (err) {
      alert(err.message);
    } finally {
      setPreparingPhotos(false);
      if (editorFileRef.current) editorFileRef.current.value = '';
      if (editorCameraRef.current) editorCameraRef.current.value = '';
    }
  };

  const updateField = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const togglePerson = name => {
    setForm(prev => {
      const exists = prev.taggingPeople.includes(name);
      return {
        ...prev,
        taggingPeople: exists ? prev.taggingPeople.filter(p => p !== name) : [...prev.taggingPeople, name]
      };
    });
  };

  const addCustomPerson = () => {
    const names = customPerson
      .split(/[,;\n]/)
      .map(s => s.trim())
      .filter(Boolean);
    if (!names.length) return;
    setForm(prev => ({
      ...prev,
      taggingPeople: [...new Set([...prev.taggingPeople, ...names])]
    }));
    setCustomPerson('');
  };

  const handleSubmit = e => {
    e.preventDefault();
    if (!form.description.trim()) return;
    onSave(form, pendingPhotos);
  };

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        onClick={e => e.stopPropagation()}
        className="glass-panel rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-fade-in bg-white dark:bg-[#0d1322]"
      >
        <div className="p-5 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-extrabold">{isNew ? 'เพิ่มทรัพย์สินใหม่' : 'แก้ไขข้อมูลทรัพย์สิน'}</h3>
            <p className="text-xs text-slate-400">ข้อมูลจะถูกบันทึกลงไฟล์ data/db.json ทันที</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800">
            <Icon name="x" size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="sm:col-span-2 space-y-1">
              <span className="font-bold">ชื่อ / รายละเอียดทรัพย์สิน *</span>
              <textarea
                required
                rows={2}
                value={form.description}
                onChange={e => updateField('description', e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/10"
              />
            </label>

            <label className="space-y-1">
              <span className="font-bold">รหัสทรัพย์สิน (Asset No.)</span>
              <input
                type="text"
                value={form.assetNo}
                onChange={e => updateField('assetNo', e.target.value)}
                placeholder="เช่น 110701100219-220"
                className="w-full p-2.5 rounded-xl font-mono bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/10"
              />
            </label>

            <label className="space-y-1">
              <span className="font-bold">จำนวน (ชิ้น) *</span>
              <input
                required
                type="number"
                min={0}
                value={form.quantity}
                onChange={e => updateField('quantity', Number(e.target.value))}
                className="w-full p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/10"
              />
            </label>

            <label className="space-y-1">
              <span className="font-bold">สถานที่จริง / ห้อง</span>
              <input
                type="text"
                value={form.location}
                onChange={e => updateField('location', e.target.value)}
                placeholder="เช่น C3 ชั้น 1 โรงละครนิเทศศาสตร์"
                className="w-full p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/10"
              />
            </label>

            <label className="space-y-1">
              <span className="font-bold">สถานที่ใน SAP</span>
              <input
                type="text"
                value={form.locationSap}
                onChange={e => updateField('locationSap', e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/10"
              />
            </label>

            <label className="space-y-1">
              <span className="font-bold">วันที่ได้รับ</span>
              <input
                type="date"
                value={form.receivedDate}
                onChange={e => updateField('receivedDate', e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/10"
              />
            </label>

            <label className="space-y-1">
              <span className="font-bold">เลขที่ PO</span>
              <input
                type="text"
                value={form.po}
                onChange={e => updateField('po', e.target.value)}
                className="w-full p-2.5 rounded-xl font-mono bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/10"
              />
            </label>

            <label className="space-y-1">
              <span className="font-bold">ผู้สร้างรหัส</span>
              <input
                type="text"
                value={form.createdBy}
                onChange={e => updateField('createdBy', e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/10"
              />
            </label>

            <label className="space-y-1">
              <span className="font-bold">ผู้ติดต่อ / เบอร์โทร</span>
              <input
                type="text"
                value={form.contact}
                onChange={e => updateField('contact', e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/10"
              />
            </label>

            <label className="sm:col-span-2 space-y-1">
              <span className="font-bold">สถานะ</span>
              <select
                value={form.status}
                onChange={e => updateField('status', e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/10 font-bold"
              >
                {STATUS_LIST.map(st => (
                  <option key={st} value={st}>
                    {STATUS_LABELS[st]} ({st})
                  </option>
                ))}
              </select>
            </label>

            {/* Tagging People Multi-Select */}
            <div className="sm:col-span-2 space-y-2">
              <span className="font-bold">ผู้เกี่ยวข้องกับการติดรหัส (เลือกได้หลายคน)</span>
              <div className="flex flex-wrap gap-1.5">
                {uniquePeople.map(p => {
                  const active = form.taggingPeople.includes(p);
                  return (
                    <button
                      type="button"
                      key={p}
                      onClick={() => togglePerson(p)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                        active
                          ? 'bg-emerald-500 text-white border-emerald-500'
                          : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-white/10 text-slate-500'
                      }`}
                    >
                      {active ? '✓ ' : '+ '}
                      {p}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={customPerson}
                  onChange={e => setCustomPerson(e.target.value)}
                  placeholder="เพิ่มชื่ออื่นๆ (คั่นด้วย ,)"
                  className="flex-1 p-2 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/10"
                />
                <button
                  type="button"
                  onClick={addCustomPerson}
                  className="px-3 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 font-semibold"
                >
                  เพิ่มชื่อ
                </button>
              </div>
            </div>

            <label className="sm:col-span-2 space-y-1">
              <span className="font-bold">หมายเหตุหน้างาน</span>
              <textarea
                rows={2}
                value={form.remark}
                onChange={e => updateField('remark', e.target.value)}
                className="w-full p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/10"
              />
            </label>

            {/* Upload Photos Directly in Add / Edit Asset */}
            <div className="sm:col-span-2 p-4 rounded-2xl bg-slate-100/80 dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold flex items-center gap-1.5">
                  <Icon name="camera" size={15} className="text-emerald-500" />
                  <span>เพิ่มรูปภาพประกอบ ({pendingPhotos.length} รูป)</span>
                </span>
                <select
                  value={photoKind}
                  onChange={e => setPhotoKind(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10"
                >
                  <option value="asset">ประเภท: รูปทรัพย์สิน</option>
                  <option value="room">ประเภท: รูปสถานที่ / ห้อง</option>
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={preparingPhotos || busy}
                  onClick={() => editorCameraRef.current?.click()}
                  className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold flex items-center gap-1.5"
                >
                  <Icon name="camera" size={14} />
                  <span>ถ่ายรูป</span>
                </button>
                <button
                  type="button"
                  disabled={preparingPhotos || busy}
                  onClick={() => editorFileRef.current?.click()}
                  className="px-3.5 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 font-semibold flex items-center gap-1.5"
                >
                  <Icon name="upload" size={14} />
                  <span>เลือกไฟล์รูปภาพ</span>
                </button>
                <input
                  ref={editorCameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={e => handleSelectPhotos(e.target.files)}
                />
                <input
                  ref={editorFileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={e => handleSelectPhotos(e.target.files)}
                />
                {preparingPhotos && <span className="text-emerald-500 font-semibold">กำลังเตรียมรูปภาพ...</span>}
              </div>

              {pendingPhotos.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 pt-1">
                  {pendingPhotos.map(p => (
                    <div key={p.tempId} className="relative aspect-square rounded-xl overflow-hidden bg-slate-800 border border-white/10 group">
                      <img src={p.dataUrl} alt={p.filename} className="w-full h-full object-cover" />
                      <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-[9px] text-white">
                        {p.kind === 'room' ? 'สถานที่' : 'ทรัพย์สิน'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPendingPhotos(prev => prev.filter(item => item.tempId !== p.tempId))}
                        className="absolute top-1 right-1 p-1 rounded-lg bg-rose-600 text-white opacity-90 hover:opacity-100"
                        title="ลบรูปนี้"
                      >
                        <Icon name="x" size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200 dark:border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl font-semibold bg-slate-200 dark:bg-slate-800"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-5 py-2.5 rounded-xl font-bold bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/25"
            >
              {busy ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// EXCEL (.XLSX) IMPORT MODAL
// ============================================================================
function ExcelImportModal({ onClose, onImported }) {
  const [filename, setFilename] = useState('');
  const [parsedRows, setParsedRows] = useState([]);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleFile = async file => {
    if (!file) return;
    setError('');
    setPreview(null);
    setFilename(file.name);
    if (!/\.xlsx$/i.test(file.name)) {
      setError('รองรับเฉพาะไฟล์ Excel นามสกุล .xlsx เท่านั้น');
      return;
    }
    setBusy(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames.find(n => /^format$/i.test(n.trim())) || workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      const rows = [];
      rawRows.slice(1).forEach((r, idx) => {
        const assetNo = String(r[0] ?? '').trim();
        const description = String(r[3] ?? '').trim();
        if (!assetNo && !description) return;
        rows.push({
          row: idx + 2,
          assetNo,
          receivedDate: String(r[2] ?? '').trim(),
          description,
          locationSap: String(r[6] ?? '').trim(),
          createdBy: String(r[7] ?? '').trim(),
          po: String(r[8] ?? '').trim()
        });
      });

      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview', filename: file.name, rows })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'อ่านไฟล์ไม่สำเร็จ');
      setParsedRows(rows);
      setPreview(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCommit = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'commit', filename, rows: parsedRows })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'นำเข้าไม่สำเร็จ');
      await onImported(json.count);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const importableCount = preview ? preview.groups.length - (preview.skippedIndexes?.length || 0) : 0;

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        onClick={e => e.stopPropagation()}
        className="glass-panel rounded-2xl max-w-3xl w-full max-h-[88vh] flex flex-col overflow-hidden bg-white dark:bg-[#0d1322] animate-fade-in"
      >
        <div className="p-5 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-extrabold">นำเข้าทรัพย์สินจากไฟล์ Excel (.xlsx)</h3>
            <p className="text-xs text-slate-400">
              อ่านชีต Format · รวมแถวที่มี PO และรายละเอียดเดียวกันอัตโนมัติ · ข้ามรายการซ้ำ
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800">
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4 text-xs flex-1">
          <div className="flex flex-wrap gap-2">
            {[
              'A · รหัสทรัพย์สิน',
              'C · วันที่ได้รับ',
              'D · ชื่อ/รายละเอียด',
              'G · สถานที่ใน SAP',
              'H · ผู้สร้างรหัส',
              'I · เลขที่ PO'
            ].map(col => (
              <span key={col} className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-mono">
                {col}
              </span>
            ))}
          </div>

          <label className="block p-6 rounded-2xl border-2 border-dashed border-emerald-500/40 hover:border-emerald-500 text-center cursor-pointer bg-emerald-500/5 transition">
            <Icon name="upload" size={28} className="text-emerald-500 mx-auto mb-2" />
            <div className="font-bold text-sm">คลิกเพื่อเลือกไฟล์ Excel (.xlsx)</div>
            <div className="text-slate-400 mt-1">{filename || 'ขนาดไม่เกิน 10 MB'}</div>
            <input
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={e => handleFile(e.target.files?.[0])}
            />
          </label>

          {error && <div className="p-3 rounded-xl bg-rose-500/15 text-rose-400 font-semibold">{error}</div>}

          {preview && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between">
                <span>
                  อ่านพบ <strong>{preview.totalRows}</strong> แถว → รวมกลุ่มได้ <strong>{preview.groups.length}</strong> รายการ
                </span>
                <span className="font-bold text-emerald-400">
                  พร้อมนำเข้าใหม่ {importableCount} รายการ (ข้ามซ้ำ {preview.skippedIndexes.length} รายการ)
                </span>
              </div>

              <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 dark:border-white/10">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-900">
                    <tr>
                      <th className="p-2.5">รายละเอียด</th>
                      <th className="p-2.5">รหัสทรัพย์สิน</th>
                      <th className="p-2.5">จำนวน</th>
                      <th className="p-2.5">PO</th>
                      <th className="p-2.5">สถานที่ SAP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                    {preview.groups.slice(0, 50).map((g, i) => (
                      <tr key={i}>
                        <td className="p-2.5 font-semibold">{g.data.description}</td>
                        <td className="p-2.5 font-mono text-emerald-400">{g.data.assetNo}</td>
                        <td className="p-2.5">{g.data.quantity}</td>
                        <td className="p-2.5 font-mono">{g.data.po}</td>
                        <td className="p-2.5">{g.data.locationSap}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-white/10 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-200 dark:bg-slate-800">
            ยกเลิก
          </button>
          {preview && importableCount > 0 && (
            <button
              disabled={busy}
              onClick={handleCommit}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-500 text-white"
            >
              {busy ? 'กำลังนำเข้า...' : `ยืนยันนำเข้า ${importableCount} รายการ`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// EXPORT & FULL BACKUP RESTORE MODAL
// ============================================================================
function ExportBackupModal({ filteredCount, totalCount, onClose, onExportCsv, onExportJson, onRestored }) {
  const [restoring, setRestoring] = useState(false);

  const handleRestoreFile = async file => {
    if (!file) return;
    setRestoring(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json)
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || 'กู้คืนข้อมูลไม่สำเร็จ');
      onRestored(out.count);
    } catch (err) {
      alert('ไฟล์ JSON ไม่ถูกต้อง: ' + err.message);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        onClick={e => e.stopPropagation()}
        className="glass-panel rounded-2xl max-w-md w-full p-6 space-y-4 bg-white dark:bg-[#0d1322] animate-fade-in"
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-extrabold">ส่งออกและสำรองข้อมูล</h3>
            <p className="text-xs text-slate-400">บันทึกไฟล์เก็บไว้ในเครื่อง หรือเปิดใน Microsoft Excel</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800">
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="space-y-2.5 text-xs">
          <button
            onClick={onExportCsv}
            className="w-full p-4 rounded-xl bg-slate-100 dark:bg-slate-900 hover:border-emerald-500/40 border border-transparent flex items-center justify-between transition"
          >
            <span className="flex items-center gap-3 font-bold">
              <Icon name="download" size={18} className="text-emerald-500" />
              <span>ส่งออกไฟล์ CSV (ตามตัวกรอง {filteredCount} รายการ)</span>
            </span>
            <Icon name="external" size={15} />
          </button>

          <button
            onClick={onExportJson}
            className="w-full p-4 rounded-xl bg-slate-100 dark:bg-slate-900 hover:border-indigo-500/40 border border-transparent flex items-center justify-between transition"
          >
            <span className="flex items-center gap-3 font-bold">
              <Icon name="database" size={18} className="text-indigo-400" />
              <span>สำรองข้อมูลทั้งหมด · Full Backup JSON ({totalCount} รายการ)</span>
            </span>
            <Icon name="external" size={15} />
          </button>

          <label className="w-full p-4 rounded-xl bg-slate-100 dark:bg-slate-900 hover:border-amber-500/40 border border-transparent flex items-center justify-between cursor-pointer transition">
            <span className="flex items-center gap-3 font-bold">
              <Icon name="upload" size={18} className="text-amber-400" />
              <span>{restoring ? 'กำลังกู้คืนข้อมูล...' : 'นำเข้า / กู้คืนจากไฟล์ Backup JSON'}</span>
            </span>
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={e => handleRestoreFile(e.target.files?.[0])}
            />
          </label>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// AI ASSISTANT DRAWER
// ============================================================================
function AiAssistantDrawer({ onClose, onOpenAsset }) {
  const [question, setQuestion] = useState('');
  const [exchanges, setExchanges] = useState([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  const askQuestion = async (presetObj = null) => {
    const qText = presetObj ? presetObj.label : question.trim();
    if (!qText || loading) return;
    if (!presetObj) setQuestion('');
    setLoading(true);
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(presetObj ? { preset: presetObj.id, question: qText } : { question: qText })
      });
      const ans = await res.json();
      setExchanges(prev => [...prev, { question: qText, answer: ans }]);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (e) {
    } finally {
      setLoading(false);
    }
  };

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end">
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg bg-white dark:bg-[#0b101d] h-full flex flex-col justify-between shadow-2xl border-l border-slate-200 dark:border-white/10 animate-fade-in"
      >
        <div className="p-5 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400">
              <Icon name="sparkles" size={20} />
            </div>
            <div>
              <h3 className="text-base font-extrabold">ถาม AI อัจฉริยะ (Smart Asset Assistant)</h3>
              <p className="text-xs text-slate-400">วิเคราะห์และค้นหาจากฐานข้อมูลปัจจุบันแบบทันที</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800">
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {/* Quick Presets */}
          <div className="grid grid-cols-2 gap-2">
            {AI_PRESETS.map(p => (
              <button
                key={p.id}
                onClick={() => askQuestion(p)}
                className="p-3 rounded-xl bg-slate-100 dark:bg-slate-900 hover:border-indigo-500/40 border border-slate-200/60 dark:border-white/5 text-left font-semibold flex items-center justify-between transition"
              >
                <span>{p.label}</span>
                <Icon name="external" size={13} className="text-indigo-400 shrink-0" />
              </button>
            ))}
          </div>

          {exchanges.length === 0 && (
            <div className="p-8 text-center text-slate-400 space-y-2">
              <Icon name="sparkles" size={32} className="text-indigo-400 mx-auto" />
              <h4 className="font-bold text-slate-700 dark:text-slate-200 text-sm">เริ่มถามสิ่งที่คุณอยากรู้</h4>
              <p>เช่น "B4 ชั้น 6 มีทรัพย์สินอะไรบ้าง", "C3 มีกี่ชิ้น", "เอ้ ติดรหัสไปกี่รายการ", "PO 4500038594"</p>
            </div>
          )}

          {exchanges.map((ex, idx) => (
            <div key={idx} className="space-y-2.5">
              <div className="flex justify-end">
                <div className="px-4 py-2.5 rounded-2xl rounded-tr-none bg-indigo-600 text-white font-semibold max-w-[85%]">
                  {ex.question}
                </div>
              </div>

              <div className="p-4 rounded-2xl rounded-tl-none bg-slate-100 dark:bg-slate-900 border border-slate-200/70 dark:border-white/10 space-y-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                  SMART DATABASE ANALYTICS
                </div>
                <p className="text-slate-800 dark:text-slate-100 font-medium leading-relaxed">{ex.answer.text}</p>

                {ex.answer.groups && ex.answer.groups.length > 0 && (
                  <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-white/10">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead className="bg-slate-200/60 dark:bg-slate-800">
                        <tr>
                          <th className="p-2">กลุ่ม / สถานที่</th>
                          <th className="p-2 text-right">รายการ</th>
                          <th className="p-2 text-right">ชิ้น</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/60 dark:divide-white/5">
                        {ex.answer.groups.map(g => (
                          <tr key={g.label}>
                            <td className="p-2 font-medium">{g.label}</td>
                            <td className="p-2 text-right font-mono">{formatNumber(g.records)}</td>
                            <td className="p-2 text-right font-mono">{formatNumber(g.quantity)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {ex.answer.sources && ex.answer.sources.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-bold text-slate-400">
                      รายการอ้างอิง ({ex.answer.sources.length} จาก {ex.answer.total} รายการ)
                    </div>
                    {ex.answer.sources.map(src => (
                      <button
                        key={src.id}
                        onClick={() => onOpenAsset(src.id, false)}
                        className="w-full p-2.5 rounded-xl bg-white dark:bg-slate-800/80 hover:border-emerald-500/40 border border-transparent text-left flex items-center justify-between transition"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-bold truncate">{src.description}</div>
                          <div className="text-[10px] text-slate-400 font-mono truncate">
                            {src.assetNo || 'ไม่มีรหัส'} · {src.location || 'ไม่ระบุห้อง'} · {src.quantity} ชิ้น
                          </div>
                        </div>
                        <Icon name="external" size={14} className="text-emerald-400 shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={e => {
            e.preventDefault();
            askQuestion();
          }}
          className="p-4 border-t border-slate-200 dark:border-white/10 flex gap-2"
        >
          <input
            type="text"
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder="พิมพ์คำถามเกี่ยวกับทรัพย์สิน ห้อง หรือรหัส PO..."
            className="flex-1 px-3.5 py-2.5 rounded-xl text-xs bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/10 focus:outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40"
          >
            <Icon name="send" size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// GOOGLE LOGIN & SYSTEM SETTINGS MODAL
// ============================================================================
function AuthAndSettingsModal({
  user,
  authConfig,
  assetsCount,
  photosCount,
  onClose,
  onUserChanged,
  onConfigSaved
}) {
  const [clientId, setClientId] = useState(authConfig.googleClientId || '');
  const [requireAuth, setRequireAuth] = useState(!!authConfig.requireAuth);
  const [customEmail, setCustomEmail] = useState('');
  const [customName, setCustomName] = useState('');
  const googleBtnRef = useRef(null);

  useEffect(() => {
    if (clientId && window.google && window.google.accounts && googleBtnRef.current) {
      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async response => {
            const res = await fetch('/api/auth/google', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ credential: response.credential })
            });
            const data = await res.json();
            if (res.ok && data.user) {
              onUserChanged(data.user);
              onClose();
            }
          }
        });
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: 'filled_blue',
          size: 'large',
          width: 320
        });
      } catch (e) {}
    }
  }, [clientId]);

  const quickGoogleLogin = async (name, email) => {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email })
    });
    const data = await res.json();
    if (res.ok && data.user) {
      onUserChanged(data.user);
      onClose();
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    onUserChanged(null);
    onClose();
  };

  const handleSaveSettings = async e => {
    e.preventDefault();
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        googleClientId: clientId.trim(),
        requireAuth
      })
    });
    if (res.ok) {
      onConfigSaved({ googleClientId: clientId.trim(), requireAuth });
    }
  };

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        onClick={e => e.stopPropagation()}
        className="glass-panel rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-6 bg-white dark:bg-[#0d1322] animate-fade-in text-xs"
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400">
              <Icon name="shield" size={20} />
            </div>
            <div>
              <h3 className="text-base font-extrabold">บัญชีผู้ใช้ Google & ตั้งค่าระบบจัดเก็บข้อมูล</h3>
              <p className="text-slate-400">Google OAuth 2.0 + JSON & Photo Folder Storage</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800">
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Active Google Session */}
        <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-500 to-indigo-500 text-white font-bold flex items-center justify-center text-base">
              {user?.name ? user.name.slice(0, 2).toUpperCase() : 'BU'}
            </div>
            <div>
              <div className="font-extrabold text-sm">{user?.name || 'ไม่ได้เข้าสู่ระบบ'}</div>
              <div className="text-slate-400">{user?.email || 'กรุณาเลือกบัญชี Google ด้านล่าง'}</div>
            </div>
          </div>
          {user && (
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-xl bg-rose-500/15 text-rose-400 hover:bg-rose-500 hover:text-white font-semibold transition"
            >
              ออกจากระบบ
            </button>
          )}
        </div>

        {/* Official Google Sign-In Switcher (when Google Client ID is configured) */}
        {clientId && (
          <div className="space-y-2">
            <div className="font-bold text-slate-400 uppercase tracking-wider text-[11px]">
              สลับบัญชี Google (Google OAuth 2.0)
            </div>
            <div ref={googleBtnRef} className="pt-1 flex justify-start" />
          </div>
        )}

      </div>
    </div>
  );
}

// ============================================================================
// GOOGLE LOGIN GATE (Split Layout: LOGO Left, Login Right + Deletable Accounts)
// ============================================================================
function GoogleLoginGate({ googleClientId, theme, onToggleTheme, onLoggedIn }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [activeClientId, setActiveClientId] = useState(googleClientId || '');
  const [clientIdInput, setClientIdInput] = useState('');
  const [showSetup, setShowSetup] = useState(false);
  const [error, setError] = useState('');
  const [savedAccounts, setSavedAccounts] = useState(() => {
    try {
      const raw = localStorage.getItem('bu_saved_google_accounts');
      if (raw !== null) return JSON.parse(raw);
    } catch (e) {}
    return [];
  });
  const googleBtnRef = useRef(null);

  useEffect(() => {
    if (googleClientId) setActiveClientId(googleClientId);
  }, [googleClientId]);

  const persistAccounts = list => {
    setSavedAccounts(list);
    try {
      localStorage.setItem('bu_saved_google_accounts', JSON.stringify(list));
    } catch (e) {}
  };

  const rememberAccount = (accName, accEmail) => {
    const cleanEmail = String(accEmail || '').trim().toLowerCase();
    if (!cleanEmail) return;
    const filtered = savedAccounts.filter(a => a.email.toLowerCase() !== cleanEmail);
    persistAccounts([{ name: accName, email: accEmail.trim() }, ...filtered]);
  };

  const removeSavedAccount = targetEmail => {
    const filtered = savedAccounts.filter(a => a.email.toLowerCase() !== targetEmail.toLowerCase());
    persistAccounts(filtered);
  };

  useEffect(() => {
    if (activeClientId && window.google && window.google.accounts && googleBtnRef.current) {
      try {
        googleBtnRef.current.innerHTML = '';
        window.google.accounts.id.initialize({
          client_id: activeClientId,
          callback: async response => {
            const res = await fetch('/api/auth/google', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ credential: response.credential })
            });
            const data = await res.json();
            if (res.ok && data.user) {
              rememberAccount(data.user.name, data.user.email);
              onLoggedIn(data.user);
            } else {
              setError(data.error || 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ');
            }
          }
        });
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: theme === 'dark' ? 'filled_black' : 'outline',
          size: 'large',
          width: 360,
          text: 'continue_with',
          shape: 'pill'
        });
      } catch (e) {}
    }
  }, [activeClientId, theme]);

  const handleSaveClientId = async e => {
    e.preventDefault();
    const val = clientIdInput.trim();
    if (!val) return;
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ googleClientId: val })
    });
    if (res.ok) {
      setActiveClientId(val);
      setShowSetup(false);
      setError('');
    }
  };

  const handleLogin = async (loginName, loginEmail) => {
    setError('');
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: loginName, email: loginEmail })
    });
    const data = await res.json();
    if (res.ok && data.user) {
      rememberAccount(data.user.name, data.user.email);
      onLoggedIn(data.user);
    } else {
      setError(data.error || 'เข้าสู่ระบบไม่สำเร็จ');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 relative">
      <div className="ambient-mesh" />

      {/* Theme Toggle */}
      {onToggleTheme && (
        <button
          onClick={onToggleTheme}
          className="fixed top-5 right-5 z-20 p-2.5 rounded-xl glass-panel text-slate-600 dark:text-slate-300 hover:text-emerald-500 transition"
          title="สลับธีมมืด/สว่าง"
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
        </button>
      )}

      {/* Split Card: LOGO Left | LOGIN Right */}
      <div className="glass-panel rounded-3xl max-w-5xl w-full overflow-hidden relative z-10 grid grid-cols-1 lg:grid-cols-12 shadow-2xl animate-fade-in">
        {/* LEFT PANEL: LOGO & BRANDING */}
        <div className="lg:col-span-5 p-8 sm:p-10 bg-gradient-to-br from-emerald-600/20 via-teal-600/15 to-indigo-600/25 border-b lg:border-b-0 lg:border-r border-slate-200/70 dark:border-white/10 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute -top-20 -left-20 w-56 h-56 rounded-full bg-emerald-500/20 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-20 w-64 h-64 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />

          <div className="relative z-10 space-y-6">
            <div className="inline-flex items-center gap-3.5">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-500 to-indigo-600 flex items-center justify-center text-white shadow-xl shadow-emerald-500/30">
                <Icon name="box" size={32} />
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <span className="font-black tracking-tight text-2xl text-slate-900 dark:text-white">BU ASSET</span>
                  <span className="text-brand-gold font-black text-3xl leading-none">.</span>
                </div>
                <span className="text-[11px] font-bold tracking-[0.22em] uppercase text-emerald-600 dark:text-emerald-400">
                  SMART ASSET OS v2.0
                </span>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-snug">
                ระบบทะเบียนทรัพย์สิน
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-indigo-400">
                  มหาวิทยาลัยกรุงเทพ
                </span>
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                บริหารจัดการ ตรวจเช็คหน้างาน และติดตามสถานะการติดรหัสทรัพย์สินทั้งหมดในที่เดียว
              </p>
            </div>

            <div className="space-y-2.5 pt-2 text-xs">
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/60 dark:bg-slate-900/50 border border-slate-200/70 dark:border-white/10">
                <span className="p-2 rounded-xl bg-emerald-500/15 text-emerald-500">
                  <Icon name="database" size={16} />
                </span>
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">ข้อมูลทรัพย์สินครบ 381 รายการ</div>
                  <div className="text-slate-500 dark:text-slate-400">พร้อมประวัติการทำงาน 755 รายการ</div>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/60 dark:bg-slate-900/50 border border-slate-200/70 dark:border-white/10">
                <span className="p-2 rounded-xl bg-indigo-500/15 text-indigo-400">
                  <Icon name="image" size={16} />
                </span>
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">คลังรูปภาพหน้างาน 200 รูป</div>
                  <div className="text-slate-500 dark:text-slate-400">จัดเก็บเป็นสัดส่วน พร้อม QR Code สติกเกอร์</div>
                </div>
              </div>
            </div>
          </div>

          <div className="relative z-10 pt-8 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>BANGKOK UNIVERSITY</span>
            <span className="font-mono">JSON + PHOTO FOLDER</span>
          </div>
        </div>

        {/* RIGHT PANEL: GOOGLE LOGIN & SAVED ACCOUNTS */}
        <div className="lg:col-span-7 p-8 sm:p-10 flex flex-col justify-center space-y-5 text-xs">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">เข้าสู่ระบบด้วย Google</h2>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              เลือกบัญชีที่เคยเข้าใช้งาน หรือลงชื่อเข้าใช้ด้วยบัญชี Google ใหม่
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 font-semibold">
              {error}
            </div>
          )}

          {activeClientId ? (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 space-y-3">
              <div className="text-[11px] font-bold text-emerald-500 uppercase tracking-wider">
                Google OAuth 2.0 พร้อมใช้งาน
              </div>
              <div ref={googleBtnRef} className="flex justify-start" />
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-amber-500">ยังไม่ได้เชื่อมต่อ Google Client ID (OAuth 2.0)</span>
                <button
                  type="button"
                  onClick={() => setShowSetup(!showSetup)}
                  className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-400 font-bold hover:bg-amber-500 hover:text-white transition"
                >
                  {showSetup ? 'ซ่อน' : 'ตั้งค่าเลย'}
                </button>
              </div>
              <p className="text-slate-400 leading-relaxed">
                หากต้องการกดปุ่ม <strong>Sign in with Google</strong> จริงๆ ให้สร้าง OAuth Client ID จาก Google Cloud Console แล้วนำมาวางที่นี่ (หรือตั้งค่า <code className="font-mono">GOOGLE_CLIENT_ID</code> ใน Vercel)
              </p>
              {showSetup && (
                <form onSubmit={handleSaveClientId} className="flex gap-2 pt-1">
                  <input
                    type="text"
                    required
                    value={clientIdInput}
                    onChange={e => setClientIdInput(e.target.value)}
                    placeholder="วาง Google Client ID (xxx.apps.googleusercontent.com)"
                    className="flex-1 p-2 rounded-xl font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10"
                  />
                  <button type="submit" className="px-3.5 py-2 rounded-xl bg-emerald-500 text-white font-bold">
                    บันทึก
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Saved / Previously Logged-in Accounts with Delete Button */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <span>บัญชีที่เคยเข้าสู่ระบบ ({savedAccounts.length})</span>
              {savedAccounts.length > 0 && (
                <button
                  type="button"
                  onClick={() => persistAccounts([])}
                  className="text-rose-400 hover:text-rose-300 font-semibold normal-case"
                >
                  ล้างรายชื่อทั้งหมด
                </button>
              )}
            </div>

            {savedAccounts.length === 0 ? (
              <div className="p-4 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-center text-slate-400">
                ยังไม่มีบัญชีที่บันทึกไว้ กรุณากรอกอีเมล Google ด้านล่างเพื่อเข้าสู่ระบบ
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {savedAccounts.map(acc => (
                  <div
                    key={acc.email}
                    onClick={() => handleLogin(acc.name, acc.email)}
                    className="group w-full p-3 rounded-2xl bg-white dark:bg-slate-900/90 hover:border-emerald-500 border border-slate-200 dark:border-white/10 flex items-center justify-between gap-2 cursor-pointer transition shadow-sm"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                        <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.8C6.2 7.2 8.9 5 12 5z" />
                        <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.6l3.7 2.9c2.2-2 3.7-5 3.7-8.7z" />
                        <path fill="#FBBC05" d="M5.3 14.8c-.2-.8-.4-1.6-.4-2.5s.2-1.7.4-2.5L1.6 7C.6 9 0 11.2 0 13.5s.6 4.5 1.6 6.5l3.7-2.9z" />
                        <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.1-6.7-5l-3.7 2.8C3.5 21.4 7.4 24 12 24z" />
                      </svg>
                      <div className="min-w-0">
                        <strong className="block text-slate-900 dark:text-white truncate">
                          Continue with Google ({acc.name})
                        </strong>
                        <span className="text-slate-400 truncate block">{acc.email}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          removeSavedAccount(acc.email);
                        }}
                        className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-500/15 transition"
                        title={`ลบบัญชี ${acc.email} ออกจากรายการ`}
                      >
                        <Icon name="trash" size={15} />
                      </button>
                      <Icon name="chevronRight" size={16} className="text-slate-400 group-hover:text-emerald-500" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Login with Another Google Account */}
          <form
            onSubmit={e => {
              e.preventDefault();
              if (email.trim()) {
                handleLogin(name.trim() || email.split('@')[0].toUpperCase(), email.trim());
              }
            }}
            className="pt-4 border-t border-slate-200 dark:border-white/10 space-y-2.5"
          >
            <div className="text-[11px] font-bold text-slate-400">
              เข้าสู่ระบบด้วยบัญชี Google อื่น:
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="ชื่อผู้ใช้งาน (เช่น SOMCHAI)"
                className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/10 focus:outline-none focus:border-emerald-500"
              />
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="อีเมล Google (@gmail.com / @bu.ac.th)"
                className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/10 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold shadow-lg shadow-emerald-500/20 transition"
            >
              เข้าสู่ระบบด้วยบัญชีนี้
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// COMMAND PALETTE MODAL (Ctrl+K)
// ============================================================================
function CommandPaletteModal({ assets, onClose, onSelectAsset, onNavigate, onAction }) {
  const [q, setQ] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const matchedAssets = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return assets.slice(0, 6);
    return assets
      .filter(a =>
        [a.description, a.assetNo, a.location, a.po, ...(a.taggingPeople || [])]
          .join(' ')
          .toLowerCase()
          .includes(term)
      )
      .slice(0, 8);
  }, [assets, q]);

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center pt-20 p-4">
      <div
        onClick={e => e.stopPropagation()}
        className="glass-panel rounded-2xl max-w-xl w-full overflow-hidden bg-white dark:bg-[#0d1322] shadow-2xl animate-fade-in"
      >
        <div className="p-4 border-b border-slate-200 dark:border-white/10 flex items-center gap-3">
          <Icon name="search" size={18} className="text-emerald-500" />
          <input
            ref={inputRef}
            type="text"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="ค้นหาทรัพย์สินด่วน, รหัส, ห้อง, หรือเลือกคำสั่งลัด..."
            className="flex-1 bg-transparent text-sm focus:outline-none"
          />
          <kbd className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-100 dark:bg-slate-800 text-slate-400">
            ESC
          </kbd>
        </div>

        <div className="p-3 max-h-96 overflow-y-auto space-y-4 text-xs">
          <div>
            <div className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              รายการทรัพย์สิน ({matchedAssets.length})
            </div>
            <div className="space-y-1">
              {matchedAssets.map(a => (
                <button
                  key={a.id}
                  onClick={() => onSelectAsset(a)}
                  className="w-full p-2.5 rounded-xl hover:bg-emerald-500/10 flex items-center justify-between text-left transition"
                >
                  <div className="min-w-0 pr-2">
                    <div className="font-bold truncate">{a.description}</div>
                    <div className="text-[11px] text-slate-400 font-mono truncate">
                      {a.assetNo || 'ยังไม่ระบุรหัส'} · {a.location || 'ไม่ระบุห้อง'}
                    </div>
                  </div>
                  <StatusBadge status={a.status} />
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              คำสั่งด่วน (Quick Actions)
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => onAction('new')}
                className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 hover:border-emerald-500/40 border border-transparent text-left font-semibold flex items-center gap-2"
              >
                <Icon name="plus" size={15} className="text-emerald-500" />
                <span>เพิ่มทรัพย์สินใหม่</span>
              </button>
              <button
                onClick={() => onAction('ai')}
                className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 hover:border-indigo-500/40 border border-transparent text-left font-semibold flex items-center gap-2"
              >
                <Icon name="sparkles" size={15} className="text-indigo-400" />
                <span>ถาม AI อัจฉริยะ</span>
              </button>
              <button
                onClick={() => onNavigate('analytics')}
                className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 hover:border-emerald-500/40 border border-transparent text-left font-semibold flex items-center gap-2"
              >
                <Icon name="chart" size={15} className="text-teal-400" />
                <span>เปิดแดชบอร์ดวิเคราะห์</span>
              </button>
              <button
                onClick={() => onNavigate('gallery')}
                className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 hover:border-emerald-500/40 border border-transparent text-left font-semibold flex items-center gap-2"
              >
                <Icon name="image" size={15} className="text-amber-400" />
                <span>เปิดคลังรูปภาพ (200 รูป)</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
