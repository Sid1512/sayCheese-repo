const express = require('express');
const { nanoid } = require('nanoid');
const { getAdmin } = require('../config/firebase');
const { authMiddleware } = require('../middleware/auth');
const { WEAR_LOGS, WARDROBE_ITEMS } = require('../config/collections');

const router = express.Router();
const db = () => getAdmin().firestore();

/**
 * Recompute 7-day and 30-day wear counts from a wearHistory ring buffer stored on each item.
 * This avoids querying wear_logs just to update counters, and ensures they are always accurate
 * (no silent accumulation over time — counts reflect the actual rolling window).
 * @param {string[]} wearHistory - existing ring buffer of YYYY-MM-DD wear dates
 * @param {string} logDate - the date being logged now (YYYY-MM-DD)
 * @returns {{ timesWornLast7Days: number, timesWornLast30Days: number, wearHistory: string[] }}
 */
function computeRollingCounts(wearHistory, logDate) {
  // Prepend the new date; keep the last 60 entries max to bound document growth
  const all = [logDate, ...(Array.isArray(wearHistory) ? wearHistory : [])].slice(0, 60);

  const anchor = new Date(logDate + 'T12:00:00Z');
  const cutoff7 = new Date(anchor);
  cutoff7.setUTCDate(cutoff7.getUTCDate() - 6); // 7 days inclusive of today
  const cutoff30 = new Date(anchor);
  cutoff30.setUTCDate(cutoff30.getUTCDate() - 29); // 30 days inclusive of today

  const fmt7 = cutoff7.toISOString().slice(0, 10);
  const fmt30 = cutoff30.toISOString().slice(0, 10);

  return {
    timesWornLast7Days: all.filter((d) => d >= fmt7).length,
    timesWornLast30Days: all.filter((d) => d >= fmt30).length,
    wearHistory: all,
  };
}

router.post('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { date, activity, item_ids } = req.body || {};
    if (!Array.isArray(item_ids) || item_ids.length === 0) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'item_ids is required', status: 400 },
      });
    }

    const logId = `log_${nanoid(12)}`;
    // Accept client-provided date (from locationDate()) or fall back to server UTC date
    const logDate = /^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))
      ? String(date)
      : new Date().toISOString().slice(0, 10);

    await db().collection(WEAR_LOGS).doc(logId).set({
      userId,
      date: logDate,
      activity: activity ? String(activity) : null,
      itemIds: item_ids.map(String),
      createdAt: new Date().toISOString(),
    });

    // Best-effort wardrobe counter update.
    // Fetch only the specific item docs being logged — not the entire wardrobe.
    const uniqueIds = [...new Set(item_ids.map(String))];
    const itemSnaps = await Promise.all(
      uniqueIds.map((id) => db().collection(WARDROBE_ITEMS).doc(id).get())
    );

    const batch = db().batch();
    itemSnaps.forEach((snap) => {
      if (!snap.exists) return;
      const cur = snap.data() || {};
      if (cur.userId !== userId) return; // ownership guard

      const { timesWornLast7Days, timesWornLast30Days, wearHistory } =
        computeRollingCounts(cur.wearHistory || [], logDate);

      batch.update(snap.ref, {
        lastWornDate: logDate,
        timesWornLast7Days,
        timesWornLast30Days,
        wearHistory, // persist ring buffer so future logs can recompute accurately
      });
    });
    await batch.commit();

    return res.status(201).json({
      log_id: logId,
      date: logDate,
      items_logged: item_ids.length,
    });
  } catch (err) {
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to log wear', status: 500 },
    });
  }
});

router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const from = req.query.from ? String(req.query.from) : null;
    const to = req.query.to ? String(req.query.to) : null;
    const itemId = req.query.item_id ? String(req.query.item_id) : null;

    let ref = db().collection(WEAR_LOGS).where('userId', '==', userId);
    if (from) ref = ref.where('date', '>=', from);
    if (to) ref = ref.where('date', '<=', to);
    ref = ref.orderBy('date', 'desc');

    const logs = await ref.get();
    const entries = logs.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((e) => !itemId || (Array.isArray(e.itemIds) && e.itemIds.includes(itemId)));

    // Resolve item names — fetch only the wardrobe items referenced in the returned entries
    const referencedIds = [...new Set(entries.flatMap((e) => e.itemIds || []))];
    const names = new Map();
    if (referencedIds.length > 0) {
      // Firestore 'in' supports up to 30 values; chunk if needed
      const CHUNK = 30;
      const admin = getAdmin();
      for (let i = 0; i < referencedIds.length; i += CHUNK) {
        const chunk = referencedIds.slice(i, i + CHUNK);
        const snap = await db()
          .collection(WARDROBE_ITEMS)
          .where('userId', '==', userId)
          .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
          .get();
        snap.docs.forEach((d) => names.set(d.id, d.data().name || 'Item'));
      }
    }

    return res.json({
      entries: entries.map((e) => ({
        log_id: e.id,
        date: e.date,
        activity: e.activity || null,
        items: (e.itemIds || []).map((id) => ({ item_id: id, name: names.get(id) || 'Item' })),
      })),
    });
  } catch (err) {
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to load wear logs', status: 500 },
    });
  }
});

module.exports = router;