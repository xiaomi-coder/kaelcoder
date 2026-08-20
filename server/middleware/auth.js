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

function adminMiddleware(req, res, next) {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_PASSWORD) {
    return res.status(403).json({ error: 'Admin ruxsati yo\'q' });
  }
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

module.exports = { authMiddleware, adminMiddleware, optionalAuth };
