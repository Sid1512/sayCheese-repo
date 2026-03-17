require('dotenv').config();
const express = require('express');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const wardrobeRoutes = require('./routes/wardrobe');
const wearLogRoutes = require('./routes/wearLog');
const insightsRoutes = require('./routes/insights');
const recommendationsRoutes = require('./routes/recommendations');

const app = express();
const PORT = process.env.PORT || 3000;
const API_BASE = process.env.API_BASE_URL || '/api/v1';

app.use(express.json());

// CORS for local dev and deployed frontend
app.use((req, res, next) => {
  const origin = req.headers.origin || '';
  const allowed =
    /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/.test(origin) ||
    /^https?:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/.test(origin) ||
    /^https?:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin) ||
    /^https?:\/\/172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+(:\d+)?$/.test(origin) ||
    (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL);

  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).send();
  return next();
});

app.get('/health', (_, res) => res.json({ ok: true }));

app.use(`${API_BASE}/auth`, authRoutes);
app.use(`${API_BASE}/user`, userRoutes);
app.use(`${API_BASE}/wardrobe`, wardrobeRoutes);
app.use(`${API_BASE}/wear-log`, wearLogRoutes);
app.use(`${API_BASE}/insights`, insightsRoutes);
app.use(`${API_BASE}/recommendations`, recommendationsRoutes);

app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Image must be 10MB or less', status: 400 } });
  }
  if (err.message && err.message.includes('images allowed')) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.message, status: 400 } });
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message || 'Internal server error', status: 500 } });
});

app.listen(PORT, () => {
  console.log(`DayAdapt API running at http://localhost:${PORT}${API_BASE}`);
});
