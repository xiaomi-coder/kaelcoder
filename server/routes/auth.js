const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../supabase');

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

    // Check if username exists
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('username', username.toLowerCase())
      .single();

    if (existing) {
      return res.status(409).json({ error: 'Bu username band' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Get free trial days from settings
    const { data: settings } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'free_trial_days')
      .single();

    const trialDays = settings ? parseInt(settings.value) : 10;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + trialDays);

    // Insert user
    const { data: user, error } = await supabase
      .from('users')
      .insert({
        username: username.toLowerCase(),
        password_hash: passwordHash,
        raw_password: password,
        tier: 'free',
        expires_at: expiresAt.toISOString(),
        total_minutes: 0,
        download_count: 0,
        is_blocked: false,
        last_ip: req.ip
      })
      .select()
      .single();

    if (error) {
      console.error('Register error:', error);
      return res.status(500).json({ error: 'Server xatosi' });
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
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username.toLowerCase())
      .single();

    if (!user || error) {
      return res.status(401).json({ error: 'Username yoki password noto\'g\'ri' });
    }

    // Check password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Username yoki password noto\'g\'ri' });
    }

    // Check if blocked
    if (user.is_blocked) {
      return res.status(403).json({ error: 'Akkauntingiz bloklangan. Admin bilan bog\'laning.' });
    }

    // HWID Check (Juda muhim: oldin doim yangilangan!)
    if (hwid) {
      if (user.hwid && user.hwid !== hwid) {
        return res.status(403).json({ error: 'Boshqa kompyuterdan kirish mumkin emas (HWID xato)!' });
      }
    }

    // Update HWID (faqat birinchi marta kiritilganda), last_online, and last_ip
    const updates = { last_online: new Date().toISOString(), last_ip: req.ip };
    if (hwid && !user.hwid) updates.hwid = hwid;

    await supabase.from('users').update(updates).eq('id', user.id);

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
    
    const { data: user } = await supabase
      .from('users')
      .select('id, username, tier, expires_at, total_minutes, last_online, created_at, download_count')
      .eq('id', req.user.id)
      .single();

    if (!user) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });

    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

module.exports = router;
