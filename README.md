# BU Asset Register — Modern Edition (v2.0)

ระบบทะเบียนทรัพย์สินอัจฉริยะ (BU Asset Management OS) โคลนพร้อมอัปเกรด UI/UX สไตล์ Modern Cyber-Glass พร้อมข้อมูลครบชุด 100%:
- **ข้อมูลทรัพย์สินครบ 381 รายการ** (เก็บใน `data/db.json`)
- **รูปภาพประกอบครบ 200 รูป** (เก็บในโฟลเดอร์ `data/photos/`)
- **ประวัติการทำงาน (Audit Log) ครบ 755 รายการ** (เก็บใน `data/db.json`)
- **ระบบล็อกอินผ่าน Google (Google OAuth 2.0 & Quick Workspace Sign-In)**

---

## โครงสร้างการจัดเก็บข้อมูล (JSON File + Photo Folder)

```text
bu-asset-register/
├── data/
│   ├── db.json                           # ฐานข้อมูลหลัก (Assets 381 รายการ + Events 755 รายการ + Users)
│   ├── config.json                       # การตั้งค่า Google Client ID และการบังคับล็อกอิน
│   ├── BU-Asset-backup-2026-11-16.json   # ไฟล์สำรองข้อมูลต้นฉบับ
│   ├── BU-Asset-2026-11-16.csv           # ไฟล์ CSV ต้นฉบับ
│   └── photos/                           # โฟลเดอร์เก็บรูปภาพทั้งหมด 200 รูป (<uuid>.png / .jpg)
├── public/
│   ├── index.html                        # หน้าเว็บหลัก
│   ├── styles.css                        # สไตล์ Modern Cyber-Glass & Print QR Sticker
│   └── app.js                            # React Frontend Application
├── api/
│   └── index.js                          # Serverless Entrypoint (สำหรับ Vercel)
├── server.js                             # Full-Stack Node.js Server (Zero external runtime deps)
├── vercel.json                           # Конฟิกสำหรับ Deploy บน Vercel
├── render.yaml                           # คอนฟิกสำหรับ Deploy บน Render.com
└── package.json
```

---

## วิธีรันใช้งานในเครื่อง (Local)

```bash
cd C:\Users\earth\.gemini\antigravity\scratch\bu-asset-register
node server.js
```
จากนั้นเปิดเบราว์เซอร์ที่ `http://localhost:3000`

---

## คำแนะนำเรื่องฐานข้อมูลเมื่อนำขึ้นเว็บออนไลน์ (Cloud Deployment)

1. **หากใช้ JSON File + โฟลเดอร์เก็บรูป (`data/db.json` + `data/photos/`) โดยตรง (แนะนำ Render / Railway / VPS)**:
   - แพลตฟอร์มแบบ Persistent Server เช่น **Railway.app**, **Render.com (พร้อม Disk)**, หรือ **VPS / Docker** สามารถเขียนไฟล์ลง `data/db.json` และ `data/photos/` ได้โดยตรงตามที่คุณต้องการ
2. **หาก Deploy บน Serverless (เช่น Vercel / Netlify)**:
   - ระบบของเรามีโหมด **Hybrid Fallback** ทำให้เปิดดูข้อมูลทั้ง 381 รายการ, รูปทั้ง 200 รูป, และประวัติทั้ง 755 รายการบน Vercel ได้ทันที
   - หากต้องการบันทึกข้อมูลถาวรบน Serverless แนะนำให้เชื่อมต่อ **Supabase (PostgreSQL + Supabase Storage)** หรือ **Turso SQLite + Cloudflare R2**
