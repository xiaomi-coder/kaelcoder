const express = require('express');
const supabase = require('../supabase');
const { adminMiddleware } = require('../middleware/auth');

const router = express.Router();

// All admin routes require admin key
router.use(adminMiddleware);

// ==================== GET ALL USERS ====================
router.get('/users', async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, username, tier, hwid, created_at, expires_at, total_minutes, last_online, is_blocked, download_count, last_ip')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ users, total: users.length });
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

// ==================== STATS ====================
router.get('/stats', async (req, res) => {
  try {
    const { data: users } = await supabase
      .from('users')
      .select('id, tier, last_online, download_count, total_minutes');

    const now = new Date();
    const fiveMinAgo = new Date(now - 5 * 60 * 1000);

    const stats = {
      total_users: users.length,
      tier_counts: { free: 0, mid: 0, pro: 0 },
      online_now: 0,
      total_downloads: 0,
      total_hours: 0
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
