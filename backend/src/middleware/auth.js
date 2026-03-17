const { getAdminClient } = require('../config/supabase');

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Missing or invalid token', status: 401 },
    });
  }

  try {
    // Verify the Supabase JWT by calling getUser — validates signature + expiry server-side
    const { data, error } = await getAdminClient().auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token', status: 401 },
      });
    }
    req.userId = data.user.id; // Supabase user UUID
    next();
  } catch (err) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Token verification failed', status: 401 },
    });
  }
}

module.exports = { authMiddleware };
