const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token kerak' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token noto\'g\'ri yoki muddati o\'tgan' });
  }
}

// Ikki admin: egasi va sotuvchi. Har biri o'z paroli bilan kiradi,
// shunda har bir sotuv kimga tegishli ekani yozib boriladi.
function resolveAdmin(key) {
  if (!key) return null;
  if (process.env.ADMIN_PASSWORD && key === process.env.ADMIN_PASSWORD) {
    return { name: process.env.ADMIN_NAME || 'egasi', role: 'owner' };
  }
  if (process.env.SELLER_PASSWORD && key === process.env.SELLER_PASSWORD) {
    return { name: process.env.SELLER_NAME || 'sotuvchi', role: 'seller' };
  }
  return null;
}

function adminMiddleware(req, res, next) {
  const admin = resolveAdmin(req.headers['x-admin-key']);
  if (!admin) {
    return res.status(403).json({ error: 'Admin ruxsati yo\'q' });
  }
  req.admin = admin;
  next();
}

// Token bo'lsa foydalanuvchini aniqlaydi, bo'lmasa ham o'tkazib yuboradi.
// Bepul yuklab olish uchun: kim yuklayotgani ixtiyoriy.
function optionalAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    try { req.user = jwt.verify(token, process.env.JWT_SECRET); } catch (err) { /* anonim */ }
  }
  next();
}

module.exports = { authMiddleware, adminMiddleware, optionalAuth, resolveAdmin };
