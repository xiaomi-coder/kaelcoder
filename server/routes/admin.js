const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { adminMiddleware } = require('../middleware/auth');

const router = express.Router();

// All admin routes require admin key
router.use(adminMiddleware);

// ==================== GET ALL USERS ====================
router.get('/users', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    let { page = 1, limit = 50, search = '', category = 'all' } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);
    const offset = (page - 1) * limit;

    let whereClauses = [];
    let params = [];
    let paramIndex = 1;

    // Category Filter
    if (category !== 'all') {
      if (category === 'online') {
        whereClauses.push(`last_online >= NOW() - INTERVAL '6 minutes'`);
      } else if (category === 'blocked') {
        whereClauses.push(`is_blocked = true`);
      } else {
        whereClauses.push(`tier = $${paramIndex++}`);
        params.push(category);
      }
    }

    // Search Filter
    if (search) {
      whereClauses.push(`(username ILIKE $${paramIndex} OR hwid ILIKE $${paramIndex} OR last_ip ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereString = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    const countResult = await db.query(`SELECT COUNT(*) FROM users ${whereString}`, params);
    const total = parseInt(countResult.rows[0].count);

    const query = `
      SELECT id, username, raw_password, tier, hwid, created_at, expires_at, total_minutes, last_online, is_blocked, download_count, last_ip
      FROM users
      ${whereString}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    params.push(limit, offset);

    const usersResult = await db.query(query, params);

    res.json({ users: usersResult.rows, total, page, totalPages: Math.ceil((total || 0) / limit) });
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ==================== CHANGE TIER ====================
router.put('/users/:id/tier', async (req, res) => {
  try {
    const { tier, days } = req.body;
    if (!['free', 'mid', 'pro'].includes(tier)) {
      return res.status(400).json({ error: 'Tier: free, mid, pro bo\'lishi kerak' });
    }

    let query = 'UPDATE users SET tier = $1';
    let params = [tier];

    // Set expiration
    if (days && days > 0) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + days);
      query += ', expires_at = $2';
      params.push(expiresAt.toISOString());
    }

    query += ` WHERE id = $${params.length + 1}`;
    params.push(req.params.id);

    await db.query(query, params);

    res.json({ success: true, message: `Tier ${tier} ga o'zgartirildi` });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ==================== BLOCK/UNBLOCK ====================
router.put('/users/:id/block', async (req, res) => {
  try {
    const { blocked } = req.body;

    await db.query('UPDATE users SET is_blocked = $1 WHERE id = $2', [blocked === true, req.params.id]);

    res.json({ success: true, message: blocked ? 'Bloklandi' : 'Blok ochildi' });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ==================== CHANGE PASSWORD ====================
router.put('/users/:id/password', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 4) {
      return res.status(400).json({ error: 'Parol kamida 4 ta belgi bo\'lishi kerak' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await db.query('UPDATE users SET password_hash = $1, raw_password = $2 WHERE id = $3', [passwordHash, password, req.params.id]);

    res.json({ success: true, message: 'Parol muvaffaqiyatli o\'zgartirildi' });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ==================== STATS ====================
router.get('/stats', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    const usersResult = await db.query('SELECT id, tier, last_online, download_count, total_minutes FROM users');
    const settingsResult = await db.query('SELECT key, value FROM settings');

    const users = usersResult.rows;
    const settings = settingsResult.rows;

    const now = new Date();
    const fiveMinAgo = new Date(now - 5 * 60 * 1000);

    const stats = {
      total_users: users.length,
      tier_counts: { free: 0, mid: 0, pro: 0 },
      online_now: 0,
      total_downloads: 0,
      total_hours: 0,
      settings: settings || []
    };

    users.forEach(u => {
      stats.tier_counts[u.tier] = (stats.tier_counts[u.tier] || 0) + 1;
      stats.total_downloads += u.download_count || 0;
      stats.total_hours += Math.round((u.total_minutes || 0) / 60);
      if (u.last_online && new Date(u.last_online) > fiveMinAgo) stats.online_now++;
    });

    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ==================== UPDATE SETTINGS ====================
router.put('/settings/:key', async (req, res) => {
  try {
    const { value } = req.body;
    const { key } = req.params;

    await db.query(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()', 
      [key, String(value)]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

module.exports = router;
