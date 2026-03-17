const express = require('express');
const { getAdminClient } = require('../config/supabase');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const db = () => getAdminClient();

function defaultPreferences(existing = {}) {
  return {
    age: '',
    gender: '',
    height: '',
    weight: '',
    skinTone: 'Medium',
    stylePreference: [],
    ...(existing || {}),
  };
}

router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { data, error } = await db()
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !data) {
      return res.status(404).json({
        error: { code: 'USER_NOT_FOUND', message: 'User not found', status: 404 },
      });
    }

    return res.json({
      user_id: userId,
      name: data.name || '',
      email: data.email || '',
      location: data.location || null,
      preferences: defaultPreferences(data.preferences),
    });
  } catch (err) {
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to get profile', status: 500 },
    });
  }
});

router.patch('/profile', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const updates = req.body || {};

    // Fetch current profile
    const { data: current, error: fetchErr } = await db()
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (fetchErr || !current) {
      return res.status(404).json({
        error: { code: 'USER_NOT_FOUND', message: 'User not found', status: 404 },
      });
    }

    const next = {
      id: userId,
      name: current.name,
      email: current.email,
      location: current.location,
      preferences: current.preferences,
      updated_at: new Date().toISOString(),
    };

    if (updates.name != null) next.name = String(updates.name).trim();
    if (updates.location !== undefined) next.location = updates.location;
    if (updates.preferences && typeof updates.preferences === 'object') {
      next.preferences = defaultPreferences({
        ...(current.preferences || {}),
        ...updates.preferences,
      });
    }

    const { error: updateErr } = await db().from('profiles').upsert(next);
    if (updateErr) throw new Error(updateErr.message);

    return res.json({
      user_id: userId,
      name: next.name || '',
      email: next.email || '',
      location: next.location || null,
      preferences: defaultPreferences(next.preferences),
    });
  } catch (err) {
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to update profile', status: 500 },
    });
  }
});

module.exports = router;