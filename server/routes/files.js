const express = require('express');
const path = require('path');
const supabase = require('../supabase');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// ==================== DOWNLOAD EXE ====================
router.get('/exe', authMiddleware, async (req, res) => {
  try {
    // Increment download count
    const { data: user } = await supabase
      .from('users')
      .select('download_count')
      .eq('id', req.user.id)
      .single();

    await supabase
      .from('users')
      .update({ download_count: (user?.download_count || 0) + 1 })
      .eq('id', req.user.id);

    // Send EXE file
    const filePath = path.join(__dirname, '..', 'files', 'formehub.exe');
    res.download(filePath, 'ShiftHub.exe');
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: 'Yuklab olishda xato' });
  }
});

// ==================== DOWNLOAD WEAPONS/DEPENDENCIES ====================
router.get('/weapons/:filename', authMiddleware, async (req, res) => {
  try {
    const filename = req.params.filename.replace(/[^a-zA-Z0-9_\-\.]/g, '');
    const filePath = path.join(__dirname, '..', 'files', 'weapons', filename);
    res.download(filePath);
  } catch (err) {
    res.status(404).json({ error: 'Fayl topilmadi' });
  }
});

// ==================== LIST AVAILABLE FILES ====================
router.get('/list', authMiddleware, async (req, res) => {
  const fs = require('fs');
  try {
    const weaponsDir = path.join(__dirname, '..', 'files', 'weapons');
    let files = [];
    if (fs.existsSync(weaponsDir)) {
      files = fs.readdirSync(weaponsDir).map(f => ({
        name: f,
        size: fs.statSync(path.join(weaponsDir, f)).size
      }));
    }
    res.json({ files });
  } catch (err) {
    res.json({ files: [] });
  }
});

module.exports = router;
