const { createClient } = require('@supabase/supabase-js');

let client = null;
let adminClient = null;

/**
 * Regular client — uses the anon key, respects Row Level Security.
 * Used for auth operations (signUp, signInWithPassword).
 */
function getClient() {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required');
  client = createClient(url, anonKey, { auth: { persistSession: false } });
  return client;
}

/**
 * Admin client — uses the service role key, bypasses Row Level Security.
 * Used for all server-side DB and Storage operations.
 */
function getAdminClient() {
  if (adminClient) return adminClient;
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  adminClient = createClient(url, serviceKey, { auth: { persistSession: false } });
  return adminClient;
}

module.exports = { getClient, getAdminClient };
