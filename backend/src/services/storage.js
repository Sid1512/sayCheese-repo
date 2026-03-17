const { getAdminClient } = require('../config/supabase');

const BUCKET = 'scans';

/**
 * Upload scan image to Supabase Storage and return a permanent public URL.
 * The bucket must be created in Supabase dashboard with public access enabled.
 * @param {string} userId
 * @param {string} scanId
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @returns {Promise<string>} permanent public URL
 */
async function uploadScanImage(userId, scanId, buffer, mimeType) {
  let ext = 'jpg';
  if (mimeType === 'image/png') ext = 'png';
  if (mimeType === 'image/webp') ext = 'webp';

  const path = `${userId}/${scanId}.${ext}`;

  const { error } = await getAdminClient()
    .storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: mimeType,
      upsert: true,
    });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  // Get permanent public URL — no expiry, no signing needed
  const { data } = getAdminClient().storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

module.exports = { uploadScanImage };
