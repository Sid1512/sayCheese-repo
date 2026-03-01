const { getAdmin } = require('../config/firebase');

const SCAN_PATH_PREFIX = 'scans';

/**
 * Upload scan image to Storage and return a signed download URL.
 * Uses the project's default Storage bucket.
 * @param {string} userId
 * @param {string} scanId
 * @param {Buffer} buffer
 * @param {string} mimeType - e.g. image/jpeg, image/png
 * @returns {Promise<string>} download URL (signed, 7 days)
 */
async function uploadScanImage(userId, scanId, buffer, mimeType) {
  const admin = getAdmin();
  const bucket = admin.storage().bucket();
  const ext = mimeType === 'image/png' ? 'png' : 'jpg';
  const path = `${SCAN_PATH_PREFIX}/${userId}/${scanId}.${ext}`;
  const file = bucket.file(path);

  await file.save(buffer, {
    metadata: { contentType: mimeType },
    resumable: false,
  });

  const [url] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });
  return url;
}

module.exports = { uploadScanImage };
