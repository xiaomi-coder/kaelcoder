require('dotenv').config();
// Saytda ko'rsatiladigan yuklab olishlar sonining bazaviy qiymati.
// Bazadagi download_count faqat saytdan, login qilib yuklab olganlarni sanaydi.
// Ko'rsatiladigan son = DOWNLOADS_BASELINE + SUM(download_count),
// ya'ni har yangi yuklab olishda o'sib boraveradi.
// Qiymat egasi tomonidan belgilangan (2026-08-21).
const DOWNLOADS_BASELINE = parseInt(process.env.DOWNLOADS_BASELINE || '6794', 10);

const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const { initBot } = require('./bot');

const authRoutes = require('./routes/auth');
const licenseRoutes = require('./routes/license');
const adminRoutes = require('./routes/admin');
const filesRoutes = require('./routes/files');
const paymentRoutes = require('./routes/payment');

const app = express();
app.set('trust proxy', true);

// Middleware
app.use(cors());
app.use(express.json());

// Static files (frontend)
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/license', licenseRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/payment', paymentRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'online', version: '1.0.0', timestamp: new Date().toISOString() });
});

// Public stats (no auth needed - for landing page)
app.get('/api/stats/public', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        COUNT(*) AS total_users,
        COUNT(*) FILTER (WHERE last_online >= NOW() - INTERVAL '5 minutes') AS online_now,
        COUNT(*) FILTER (WHERE tier = 'pro') AS pro_users,
        COUNT(*) FILTER (WHERE tier = 'mid') AS mid_users,
        COALESCE(SUM(download_count), 0) AS total_downloads
      FROM users
    `);
    const anonRow = await db.query(`SELECT value FROM settings WHERE key = 'anon_downloads'`);
    const anonDownloads = anonRow.rows.length ? parseInt(anonRow.rows[0].value, 10) || 0 : 0;

    const row = result.rows[0];
    res.json({
      total_users: parseInt(row.total_users),
      online_now: parseInt(row.online_now),
      pro_users: parseInt(row.pro_users),
      mid_users: parseInt(row.mid_users),
      total_downloads: DOWNLOADS_BASELINE + parseInt(row.total_downloads) + anonDownloads,
      uptime: '99.9%'
    });
  } catch (err) {
    res.json({ total_users: 0, online_now: 0, pro_users: 0, mid_users: 0,
               total_downloads: DOWNLOADS_BASELINE, uptime: '99.9%' });
  }
});

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[ShiftHub] Server running on port ${PORT}`);
  // Botni ishga tushirish
  initBot();
});

