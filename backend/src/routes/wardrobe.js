const express = require('express');
const multer = require('multer');
const { nanoid } = require('nanoid');
const { getAdminClient } = require('../config/supabase');
const { authMiddleware } = require('../middleware/auth');
const { detectClothingItem } = require('../services/vision');
const { uploadScanImage } = require('../services/storage');
const { toApiItem, toDbItem } = require('../utils/wardrobeMapper');

const router = express.Router();
const db = () => getAdminClient();

const VALID_CATEGORIES = new Set(['top', 'bottom', 'footwear', 'accessory']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(jpeg|png|jpg|webp)$/i.test(file.mimetype);
    if (ok) cb(null, true);
    else cb(new Error('Only JPEG, PNG, or WEBP images allowed'), false);
  },
});

// POST /api/v1/wardrobe/scan
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
    const allowFallback = process.env.ALLOW_SCAN_FALLBACK !== 'false' && process.env.NODE_ENV !== 'production';

    let imageUrl = null;
    let detected = null;

    try {
      imageUrl = await uploadScanImage(userId, scanId, req.file.buffer, mimeType);
    } catch (err) {
      if (!allowFallback) throw err;
      imageUrl = `data:${mimeType};base64,${req.file.buffer.toString('base64')}`;
    }

    try {
      detected = await detectClothingItem(req.file.buffer, mimeType, categoryHint);
    } catch (err) {
      if (!allowFallback) throw err;
      const fallbackCategory = normalizeCategory(categoryHint);
      detected = {
        name: fallbackDisplayName(fallbackCategory),
        description: 'Scanned in fallback mode (vision API unavailable).',
        category: fallbackCategory,
        tags: { warmth: 3, breathability: 3, waterproof: false, occasion: ['casual'], color: 'unknown' },
      };
    }

    return res.json({
      scan_id: scanId,
      status: 'complete',
      detected_item: {
        name: detected.name,
        description: detected.description || undefined,
        category: detected.category,
        layer: detected.layer ?? null,
        image_url: imageUrl,
        tags: detected.tags,
      },
    });
  } catch (err) {
    console.error('Wardrobe scan error:', err);
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: err.message || 'Scan failed', status: 500 },
    });
  }
});

function normalizeCategory(hint) {
  const raw = String(hint || '').trim().toLowerCase();
  return VALID_CATEGORIES.has(raw) ? raw : 'top';
}

function fallbackDisplayName(category) {
  const names = { top: 'Scanned Top', bottom: 'Scanned Bottom', footwear: 'Scanned Footwear', accessory: 'Scanned Accessory' };
  return names[category] || 'Scanned Item';
}

// GET /api/v1/wardrobe
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const category = req.query.category ? String(req.query.category).trim() : null;
    const occasion = req.query.occasion ? String(req.query.occasion).trim() : null;
    const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 50), 200);
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);

    let query = db()
      .from('wardrobe_items')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('added_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (category) query = query.eq('category', category);
    // Postgres JSON array contains: tags->'occasion' @> '["value"]'
    if (occasion) query = query.contains('tags->occasion', [occasion]);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    return res.json({ total: count ?? data.length, items: (data || []).map(toApiItem) });
  } catch (err) {
    console.error('GET /wardrobe error:', err);
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to list wardrobe', status: 500 },
    });
  }
});

// POST /api/v1/wardrobe/items
router.post('/items', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const body = req.body || {};
    const name = body.name != null ? String(body.name).trim() : '';
    const category = body.category != null ? String(body.category).trim().toLowerCase() : '';
    const imageUrl = body.image_url != null ? String(body.image_url).trim() : '';
    const tags = body.tags && typeof body.tags === 'object' ? body.tags : {};
    const layer = category === 'top' && (body.layer === 'inner' || body.layer === 'outer')
      ? body.layer : null;

    if (!name) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'name is required', status: 400 } });
    if (!category || !VALID_CATEGORIES.has(category)) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: `category must be one of: ${[...VALID_CATEGORIES].join(', ')}`, status: 400 } });
    if (!imageUrl) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'image_url is required', status: 400 } });

    const itemId = `itm_${nanoid(12)}`;
    const doc = toDbItem(userId, itemId, {
      ...body, name, category, layer, image_url: imageUrl,
      tags: {
        warmth: clamp(tags.warmth, 1, 5),
        breathability: clamp(tags.breathability, 1, 5),
        waterproof: Boolean(tags.waterproof),
        occasion: Array.isArray(tags.occasion) ? tags.occasion : [tags.occasion || 'casual'].filter(Boolean),
        color: String(tags.color || 'unknown').trim(),
      },
    });

    const { data, error } = await db().from('wardrobe_items').insert(doc).select().single();
    if (error) throw new Error(error.message);

    return res.status(201).json(toApiItem(data));
  } catch (err) {
    console.error('POST /wardrobe/items error:', err);
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to add item', status: 500 },
    });
  }
});

// GET /api/v1/wardrobe/items/:item_id
router.get('/items/:item_id', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const itemId = String(req.params.item_id || '');
    const { data, error } = await db().from('wardrobe_items').select('*').eq('id', itemId).single();
    if (error || !data) return res.status(404).json({ error: { code: 'ITEM_NOT_FOUND', message: 'No wardrobe item found', status: 404 } });
    if (data.user_id !== userId) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Item does not belong to user', status: 403 } });
    return res.json(toApiItem(data));
  } catch (err) {
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to get item', status: 500 } });
  }
});

// PATCH /api/v1/wardrobe/items/:item_id
router.patch('/items/:item_id', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const itemId = String(req.params.item_id || '');
    const { data: current, error: fetchErr } = await db().from('wardrobe_items').select('*').eq('id', itemId).single();
    if (fetchErr || !current) return res.status(404).json({ error: { code: 'ITEM_NOT_FOUND', message: 'No wardrobe item found', status: 404 } });
    if (current.user_id !== userId) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Item does not belong to user', status: 403 } });

    const body = req.body || {};
    const next = { ...current };
    if (body.name != null) next.name = String(body.name).trim();
    if (body.description != null) next.description = String(body.description).trim();
    if (body.category != null) {
      const cat = String(body.category).trim().toLowerCase();
      if (!VALID_CATEGORIES.has(cat)) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid category', status: 400 } });
      next.category = cat;
    }
    // Update layer — only valid for tops, must be cleared for other categories
    if (body.layer !== undefined) {
      const cat = next.category;
      next.layer = cat === 'top' && (body.layer === 'inner' || body.layer === 'outer')
        ? body.layer
        : null;
    }
    if (body.tags && typeof body.tags === 'object') next.tags = { ...(current.tags || {}), ...body.tags };

    const { data, error } = await db().from('wardrobe_items').update(next).eq('id', itemId).select().single();
    if (error) throw new Error(error.message);
    return res.json(toApiItem(data));
  } catch (err) {
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to update item', status: 500 } });
  }
});

// DELETE /api/v1/wardrobe/items/:item_id
router.delete('/items/:item_id', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const itemId = String(req.params.item_id || '');
    const { data, error: fetchErr } = await db().from('wardrobe_items').select('user_id').eq('id', itemId).single();
    if (fetchErr || !data) return res.status(404).json({ error: { code: 'ITEM_NOT_FOUND', message: 'No wardrobe item found', status: 404 } });
    if (data.user_id !== userId) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Item does not belong to user', status: 403 } });
    await db().from('wardrobe_items').delete().eq('id', itemId);
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to delete item', status: 500 } });
  }
});

function clamp(val, min, max) {
  const n = Number(val);
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

module.exports = router;