require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const { initializeDb } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Initialize database
initializeDb();

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/menu', require('./routes/menu'));
app.use('/api/cart', require('./routes/cart'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/rewards', require('./routes/rewards'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/guest', require('./routes/guest'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SPA fallback — serve index.html for non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
  }
});

app.listen(PORT, () => {
  console.log(`\n🐔 Chick-fil-B server running at http://localhost:${PORT}\n`);
});
