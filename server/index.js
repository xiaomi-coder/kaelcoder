require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const licenseRoutes = require('./routes/license');
const adminRoutes = require('./routes/admin');
const filesRoutes = require('./routes/files');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Static files (frontend)
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/license', licenseRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/files', filesRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'online', version: '1.0.0', timestamp: new Date().toISOString() });
});

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[ShiftHub] Server running on port ${PORT}`);
});
