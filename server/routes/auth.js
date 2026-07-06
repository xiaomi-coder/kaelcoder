const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

const router = express.Router();

// ==================== REGISTER ====================
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username va password kerak' });
    }

    if (username.length < 3 || password.length < 4) {
      return res.status(400).json({ error: 'Username 3+, password 4+ belgi bo\'lishi kerak' });
    }

    const uname = username.toLowerCase();

    // Check if username exists
    const existing = await db.query('SELECT id FROM users WHERE username = $1', [uname]);

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Bu username band' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Get free trial days from settings
    const settings = await db.query('SELECT value FROM settings WHERE key = $1', ['free_trial_days']);

    const trialDays = settings.rows.length > 0 ? parseInt(settings.rows[0].value) : 10;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + trialDays);

    // Insert user
    const insertResult = await db.query(
      `INSERT INTO users 
      (username, password_hash, raw_password, tier, expires_at, total_minutes, download_count, is_blocked, last_ip) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [uname, passwordHash, password, 'free', expiresAt.toISOString(), 0, 0, false, req.ip]
    );
    const user = insertResult.rows[0];

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, username: user.username, tier: user.tier },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        tier: user.tier,
        expires_at: user.expires_at
      }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ==================== LOGIN ====================
router.post('/login', async (req, res) => {
  try {
    const { username, password, hwid } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username va password kerak' });
    }

    // Find user
    const userResult = await db.query('SELECT * FROM users WHERE username = $1', [username.toLowerCase()]);

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Username yoki password noto\'g\'ri' });
    }
    const user = userResult.rows[0];

    // Check password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Username yoki password noto\'g\'ri' });
    }

    // Check if blocked
    if (user.is_blocked) {
      return res.status(403).json({ error: 'Akkauntingiz bloklangan. Admin bilan bog\'laning.' });
    }

    // Check if subscription has expired
    if (user.expires_at) {
      const expDate = new Date(user.expires_at);
      if (expDate < new Date()) {
        return res.status(403).json({ error: 'Obuna muddati tugagan! Iltimos, Telegram bot orqali vaqt xarid qiling.' });
      }
    }

    // HWID Check (Juda muhim: oldin doim yangilangan!)
    if (hwid) {
      if (user.hwid && user.hwid !== hwid) {
        return res.status(403).json({ error: 'Boshqa kompyuterdan kirish mumkin emas (HWID xato)!' });
      }
    }

    // Update HWID (faqat birinchi marta kiritilganda), last_online, and last_ip
    const lastOnline = new Date().toISOString();
    
    if (hwid && !user.hwid) {
      await db.query('UPDATE users SET last_online = $1, last_ip = $2, hwid = $3 WHERE id = $4', [lastOnline, req.ip, hwid, user.id]);
    } else {
      await db.query('UPDATE users SET last_online = $1, last_ip = $2 WHERE id = $3', [lastOnline, req.ip, user.id]);
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, username: user.username, tier: user.tier },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        tier: user.tier,
        expires_at: user.expires_at,
        is_blocked: user.is_blocked
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ==================== ME (profil) ====================
const { authMiddleware } = require('../middleware/auth');

router.get('/me', authMiddleware, async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    const userResult = await db.query('SELECT id, username, tier, expires_at, total_minutes, last_online, created_at, download_count FROM users WHERE id = $1', [req.user.id]);

    if (userResult.rows.length === 0) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });

    res.json({ user: userResult.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

module.exports = router;
