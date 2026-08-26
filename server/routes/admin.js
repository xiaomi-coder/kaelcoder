const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { adminMiddleware } = require('../middleware/auth');
const { PLANS } = require('../plans');

const router = express.Router();

// Tasodifiy login/parol (bot.js dagi bilan bir xil uslub)
function randomStr(len) {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// Sotuvni yozib qo'yish
async function recordSale({ admin, userId, username, plan, planKey, action, note }) {
  await db.query(
    `INSERT INTO sales (admin_name, admin_role, user_id, username, plan_key, days, amount, source, action, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'panel',$8,$9)`,
    [admin.name, admin.role, userId, username, planKey || null,
     plan.days, plan.amount, action, note || null]
  );
}

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

// ==================== KIM KIRGAN ====================
router.get('/whoami', (req, res) => {
  res.json({ name: req.admin.name, role: req.admin.role });
});

// ==================== TARIFLAR ====================
router.get('/plans', (req, res) => {
  res.json({
    plans: Object.entries(PLANS).map(([key, p]) => ({
      key, days: p.days, amount: p.amount, label: p.label
    }))
  });
});

// ==================== YANGI VIP AKKAUNT YARATISH ====================
router.post('/users', async (req, res) => {
  try {
    const { plan_key, username: wanted, password: wantedPw, note } = req.body;
    const plan = PLANS[plan_key];
    if (!plan) return res.status(400).json({ error: 'Tarif tanlanmagan' });

    const username = (wanted && wanted.trim())
      ? wanted.trim().toLowerCase()
      : 'sh_' + randomStr(7);
    const password = (wantedPw && wantedPw.length >= 4) ? wantedPw : randomStr(10);

    const exists = await db.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username]);
    if (exists.rows.length) return res.status(409).json({ error: 'Bu username band' });

    const passwordHash = await bcrypt.hash(password, 10);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + plan.days);

    const ins = await db.query(
      `INSERT INTO users
       (username, password_hash, raw_password, tier, expires_at, total_minutes, download_count, is_blocked)
       VALUES ($1,$2,$3,'pro',$4,0,0,false) RETURNING id, username, expires_at`,
      [username, passwordHash, password, expiresAt.toISOString()]
    );
    const user = ins.rows[0];

    await recordSale({
      admin: req.admin, userId: user.id, username: user.username,
      plan, planKey: plan_key, action: 'create', note
    });

    res.json({
      success: true,
      user: { id: user.id, username: user.username, password, expires_at: user.expires_at },
      sale: { days: plan.days, amount: plan.amount }
    });
  } catch (err) {
    console.error('Admin create user error:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ==================== MUDDAT QO'SHISH (uzaytirish) ====================
router.post('/users/:id/extend', async (req, res) => {
  try {
    const { plan_key, note } = req.body;
    const plan = PLANS[plan_key];
    if (!plan) return res.status(400).json({ error: 'Tarif tanlanmagan' });

    const cur = await db.query('SELECT id, username, expires_at FROM users WHERE id = $1', [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
    const user = cur.rows[0];

    // Muddati o'tgan bo'lsa bugundan, aks holda mavjud muddatdan davom etadi
    const now = new Date();
    const base = (user.expires_at && new Date(user.expires_at) > now) ? new Date(user.expires_at) : now;
    base.setDate(base.getDate() + plan.days);

    await db.query(
      `UPDATE users SET tier = 'pro', expires_at = $1, is_blocked = false WHERE id = $2`,
      [base.toISOString(), user.id]
    );

    await recordSale({
      admin: req.admin, userId: user.id, username: user.username,
      plan, planKey: plan_key, action: 'extend', note
    });

    res.json({ success: true, expires_at: base.toISOString(), sale: { days: plan.days, amount: plan.amount } });
  } catch (err) {
    console.error('Admin extend error:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ==================== DAROMAD ====================
router.get('/sales', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    const { limit = 50, admin = 'all' } = req.query;

    const where = admin !== 'all' ? 'WHERE admin_name = $2' : '';
    const listParams = admin !== 'all' ? [parseInt(limit), admin] : [parseInt(limit)];

    const list = await db.query(
      `SELECT id, admin_name, admin_role, username, plan_key, days, amount, source, action, note, created_at
       FROM sales ${where} ORDER BY created_at DESC LIMIT $1`, listParams);

    // Davrlar bo'yicha yig'indi
    const totals = await db.query(`
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE created_at >= date_trunc('day',   NOW())), 0) AS today,
        COALESCE(SUM(amount) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days'),   0) AS week,
        COALESCE(SUM(amount) FILTER (WHERE created_at >= date_trunc('month', NOW())), 0) AS month,
        COALESCE(SUM(amount), 0) AS total,
        COUNT(*) AS count
      FROM sales
    `);

    // Har bir admin bo'yicha
    const byAdmin = await db.query(`
      SELECT admin_name, admin_role,
             COUNT(*) AS count,
             COALESCE(SUM(amount), 0) AS total,
             COALESCE(SUM(amount) FILTER (WHERE created_at >= date_trunc('month', NOW())), 0) AS month
      FROM sales GROUP BY admin_name, admin_role ORDER BY total DESC
    `);

    const t = totals.rows[0];
    res.json({
      sales: list.rows,
      totals: {
        today: Number(t.today), week: Number(t.week),
        month: Number(t.month), total: Number(t.total), count: Number(t.count)
      },
      by_admin: byAdmin.rows.map(r => ({
        name: r.admin_name, role: r.admin_role,
        count: Number(r.count), total: Number(r.total), month: Number(r.month)
      }))
    });
  } catch (err) {
    console.error('Admin sales error:', err);
    res.status(500).json({ error: 'Server xatosi', sales: [], totals: {}, by_admin: [] });
  }
});

module.exports = router;
