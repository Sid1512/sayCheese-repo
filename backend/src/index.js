require('dotenv').config();
const express = require('express');
const { initializeFirebase } = require('./config/firebase');
const authRoutes = require('./routes/auth');
const wardrobeRoutes = require('./routes/wardrobe');
const recommendationsRoutes = require('./routes/recommendations');

initializeFirebase();

const app = express();
const PORT = process.env.PORT || 3000;
const API_BASE = process.env.API_BASE_URL || '/api/v1';

app.use(express.json());

app.get('/health', (_, res) => res.json({ ok: true }));

app.use(`${API_BASE}/auth`, authRoutes);
app.use(`${API_BASE}/wardrobe`, wardrobeRoutes);
app.use(`${API_BASE}/recommendations`, recommendationsRoutes);

app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Image must be 10MB or less', status: 400 },
    });
  }
  if (err.message && err.message.includes('Only JPEG')) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: err.message, status: 400 },
    });
  }
  console.error(err);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: err.message || 'Internal server error', status: 500 },
  });
});

app.listen(PORT, () => {
  console.log(`DayAdapt API at http://localhost:${PORT}${API_BASE}`);
});
