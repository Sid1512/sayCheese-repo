const express = require('express');
const { getClient, getAdminClient } = require('../config/supabase');

const router = express.Router();

// POST /api/v1/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'email and password are required', status: 400 },
      });
    }

    // Supabase Auth handles hashing, duplicate detection, and JWT issuance
    const { data, error } = await getClient().auth.signUp({ email, password });
    if (error) {
      const isExists = error.message?.toLowerCase().includes('already registered');
      return res.status(400).json({
        error: {
          code: isExists ? 'EMAIL_EXISTS' : 'REGISTRATION_FAILED',
          message: isExists ? 'An account with this email already exists.' : error.message,
          status: 400,
        },
      });
    }

    const userId = data.user.id;
    const token = data.session?.access_token;

    // Store display name in our profiles table
    if (name) {
      await getAdminClient()
        .from('profiles')
        .upsert({ id: userId, name: String(name).trim(), email: email.trim().toLowerCase() });
    } else {
      await getAdminClient()
        .from('profiles')
        .upsert({ id: userId, email: email.trim().toLowerCase() });
    }

    return res.status(201).json({ user_id: userId, token });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({
      error: { code: 'REGISTRATION_FAILED', message: err.message || 'Registration failed', status: 500 },
    });
  }
});

// POST /api/v1/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'email and password are required', status: 400 },
      });
    }

    const { data, error } = await getClient().auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Invalid email or password', status: 401 },
      });
    }

    return res.json({
      user_id: data.user.id,
      token: data.session.access_token,
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({
      error: { code: 'LOGIN_FAILED', message: err.message || 'Login failed', status: 500 },
    });
  }
});

// GET /api/v1/auth/me
router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Missing or invalid token', status: 401 },
    });
  }
  try {
    const { data, error } = await getAdminClient().auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token', status: 401 },
      });
    }
    return res.json({ user_id: data.user.id });
  } catch {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token', status: 401 },
    });
  }
});

module.exports = router;
