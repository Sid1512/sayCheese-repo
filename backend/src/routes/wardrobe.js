const express = require('express');
const multer = require('multer');
const { nanoid } = require('nanoid');
const { getAdmin } = require('../config/firebase');
const { authMiddleware } = require('../middleware/auth');
const { WARDROBE_ITEMS } = require('../config/collections');
const { detectClothingItem } = require('../services/vision');
const { uploadScanImage } = require('../services/storage');
const { toApiItem, toFirestoreItem } = require('../utils/wardrobeMapper');

const router = express.Router();
const db = () => getAdmin().firestore();
const VALID_CATEGORIES = new Set([
  'top', 'bottom', 'footwear', 'thermal', 'jacket', 'scarf', 'hat', 'gloves', 'facemask', 'umbrella',
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(jpeg|png|jpg)$/i.test(file.mimetype);
    if (ok) cb(null, true);
    else cb(new Error('Only JPEG or PNG images allowed'), false);
  },
});

// POST /api/v1/wardrobe/scan — requires auth, multipart image
router.post('/scan', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'image file is required', status: 400 },
      });
    }

    const userId = req.userId;
    const categoryHint = req.body.category_hint || null;
    const scanId = `scn_${nanoid(12)}`;
    const mimeType = req.file.mimetype || 'image/jpeg';

    const [imageUrl, detected] = await Promise.all([
      uploadScanImage(userId, scanId, req.file.buffer, mimeType),
      detectClothingItem(req.file.buffer, mimeType, categoryHint),
    ]);

    const detected_item = {
      name: detected.name,
      description: detected.description || undefined,
      category: detected.category,
      image_url: imageUrl,
      tags: detected.tags,
      confidence: detected.confidence,
    };

    return res.json({
      scan_id: scanId,
      status: 'complete',
      detected_item,
    });
  } catch (err) {
    console.error('Wardrobe scan error:', err);
    const code = err.message && err.message.includes('JSON') ? 'SCAN_FAILED' : 'INTERNAL_ERROR';
    const status = code === 'SCAN_FAILED' ? 422 : 500;
    return res.status(status).json({
      error: { code, message: err.message || 'Scan failed', status },
    });
  }
});

// GET /api/v1/wardrobe — list items for user, optional category, occasion, limit, offset
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const category = req.query.category ? String(req.query.category).trim() : null;
    const occasion = req.query.occasion ? String(req.query.occasion).trim() : null;
    let limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 50), 200);
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

    let ref = db().collection(WARDROBE_ITEMS).where('userId', '==', userId);
    if (category) ref = ref.where('category', '==', category);
    if (occasion) ref = ref.where('tags.occasion', 'array-contains', occasion);
    ref = ref.orderBy('addedAt', 'desc');

    let total = 0;
    let docs = [];
    try {
      const [countSnap, itemsSnap] = await Promise.all([
        ref.count().get(),
        ref.limit(limit).offset(offset).get(),
      ]);
      total = countSnap.data().count ?? itemsSnap.docs.length;
      docs = itemsSnap.docs;
    } catch (e) {
      if (e.message && e.message.includes('count')) {
        const itemsSnap = await ref.limit(limit).offset(offset).get();
        docs = itemsSnap.docs;
        total = docs.length;
      } else throw e;
    }

    const items = docs.map((d) => toApiItem(d.id, d.data()));
    return res.json({ total, items });
  } catch (err) {
    console.error('GET /wardrobe error:', err);
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to list wardrobe', status: 500 },
    });
  }
});

// POST /api/v1/wardrobe/items — add item (after scan confirm or manual)
router.post('/items', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const body = req.body || {};

    const name = body.name != null ? String(body.name).trim() : '';
    const category = body.category != null ? String(body.category).trim().toLowerCase() : '';
    const imageUrl = body.image_url != null ? String(body.image_url).trim() : '';
    const tags = body.tags && typeof body.tags === 'object' ? body.tags : {};

    if (!name) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'name is required', status: 400 },
      });
    }
    if (!category || !VALID_CATEGORIES.has(category)) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: `category is required and must be one of: ${[...VALID_CATEGORIES].join(', ')}`,
          status: 400,
        },
      });
    }
    if (!imageUrl) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'image_url is required', status: 400 },
      });
    }

    const itemId = `itm_${nanoid(12)}`;
    const doc = toFirestoreItem(userId, {
      ...body,
      name,
      category,
      image_url: imageUrl,
      confidence: body.confidence != null ? body.confidence : undefined,
      tags: {
        warmth: clamp(tags.warmth, 1, 5),
        breathability: clamp(tags.breathability, 1, 5),
        waterproof: Boolean(tags.waterproof),
        occasion: Array.isArray(tags.occasion) ? tags.occasion : [tags.occasion || 'casual'].filter(Boolean),
        color: String(tags.color || 'unknown').trim(),
        user_comfort: clamp(tags.user_comfort, 1, 5),
      },
    });

    await db().collection(WARDROBE_ITEMS).doc(itemId).set(doc);

    const created = {
      ...doc,
      addedAt: doc.addedAt,
    };
    return res.status(201).json(toApiItem(itemId, created));
  } catch (err) {
    console.error('POST /wardrobe/items error:', err);
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to add item', status: 500 },
    });
  }
});

function clamp(val, min, max) {
  const n = Number(val);
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

module.exports = router;
