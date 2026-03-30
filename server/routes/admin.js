const express = require('express');
const bcrypt = require('bcryptjs');
const supabase = require('../supabase');
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
    const start = (page - 1) * limit;
    const end = start + limit - 1;

    let query = supabase
      .from('users')
      .select('id, username, raw_password, tier, hwid, created_at, expires_at, total_minutes, last_online, is_blocked, download_count, last_ip', { count: 'exact' });

    // Category Filter
    if (category !== 'all') {
      if (category === 'online') {
        const sixMinsAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
        query = query.gte('last_online', sixMinsAgo);
      } else if (category === 'blocked') {
        query = query.eq('is_blocked', true);
      } else {
        query = query.eq('tier', category);
      }
    }

    // Search Filter
    if (search) {
      query = query.or(`username.ilike.%${search}%,hwid.ilike.%${search}%,last_ip.ilike.%${search}%`);
    }

    const { data: users, error, count } = await query
      .order('created_at', { ascending: false })
      .range(start, end);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ users, total: count, page, totalPages: Math.ceil((count || 0) / limit) });
  } catch (err) {
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

    const updates = { tier };

    // Set expiration
    if (days && days > 0) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + days);
      updates.expires_at = expiresAt.toISOString();
    }

    const { error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, message: `Tier ${tier} ga o'zgartirildi` });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ==================== BLOCK/UNBLOCK ====================
router.put('/users/:id/block', async (req, res) => {
  try {
    const { blocked } = req.body;

    const { error } = await supabase
      .from('users')
      .update({ is_blocked: blocked === true })
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });
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

    const { error } = await supabase
      .from('users')
      .update({ password_hash: passwordHash, raw_password: password })
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });
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
    
    const { data: users } = await supabase
      .from('users')
      .select('id, tier, last_online, download_count, total_minutes');

    const { data: settings } = await supabase
      .from('settings')
      .select('key, value');

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

    const { error } = await supabase
      .from('settings')
      .upsert({ key, value: String(value) }, { onConflict: 'key' });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

module.exports = router;
