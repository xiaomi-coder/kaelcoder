const express = require('express');
const supabase = require('../supabase');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// ==================== LICENSE CHECK (EXE chaqiradi) ====================
router.get('/check', authMiddleware, async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (!user) return res.status(404).json({ error: 'User topilmadi' });

    // Check blocked
    if (user.is_blocked) {
      return res.json({ valid: false, reason: 'blocked', tier: 'none' });
    }

    // Check expiration
    const now = new Date();
    const expires = new Date(user.expires_at);
    const isExpired = expires < now;

    // Allowed features by tier
    const features = {
      free: ['esp', 'radar', 'c4_timer', 'anti_flash'],
      mid:  ['esp', 'radar', 'c4_timer', 'anti_flash', 'bhop'],
      pro:  ['esp', 'radar', 'c4_timer', 'anti_flash', 'bhop', 'aimbot', 'triggerbot']
    };

    if (isExpired && user.tier === 'free') {
      return res.json({
        valid: false,
        reason: 'expired',
        tier: user.tier,
        features: [],
        expires_at: user.expires_at,
        message: 'Free muddat tugadi. Mid yoki Pro rejimga o\'ting!'
      });
    }

    res.json({
      valid: true,
      tier: user.tier,
      features: features[user.tier] || features.free,
      expires_at: user.expires_at,
      username: user.username,
      total_minutes: user.total_minutes
    });
  } catch (err) {
    console.error('License check error:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ==================== HEARTBEAT (har 5 daqiqada) ====================
router.post('/heartbeat', authMiddleware, async (req, res) => {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('total_minutes, is_blocked, expires_at, tier')
      .eq('id', req.user.id)
      .single();

    if (!user) return res.status(404).json({ error: 'User topilmadi' });

    // Agar foydalanuvchi admin tomonidan bloklansa, keyingi heartbeatda dastur o'chadi
    if (user.is_blocked) {
      return res.json({ valid: false, reason: 'blocked', success: false });
    }

    // Litsenziya tugaganiga tekshirish
    const now = new Date();
    const expires = new Date(user.expires_at);
    if (expires < now && user.tier === 'free') {
      return res.json({ valid: false, reason: 'expired', success: false });
    }

    await supabase
      .from('users')
      .update({
        total_minutes: (user.total_minutes || 0) + 5,
        last_online: new Date().toISOString(),
        last_ip: req.ip
      })
      .eq('id', req.user.id);

    res.json({ success: true, valid: true });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

module.exports = router;
