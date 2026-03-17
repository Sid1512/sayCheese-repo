const express = require('express');
const { nanoid } = require('nanoid');
const { getAdminClient } = require('../config/supabase');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const db = () => getAdminClient();

function computeRollingCounts(wearHistory, logDate) {
  const all = [logDate, ...(Array.isArray(wearHistory) ? wearHistory : [])].slice(0, 60);
  const anchor = new Date(logDate + 'T12:00:00Z');

  const cutoff7 = new Date(anchor);
  cutoff7.setUTCDate(cutoff7.getUTCDate() - 6);
  const cutoff30 = new Date(anchor);
  cutoff30.setUTCDate(cutoff30.getUTCDate() - 29);

  return {
    times_worn_last_7_days: all.filter((d) => d >= cutoff7.toISOString().slice(0, 10)).length,
    times_worn_last_30_days: all.filter((d) => d >= cutoff30.toISOString().slice(0, 10)).length,
    wear_history: all,
  };
}

// POST /api/v1/wear-log
router.post('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { date, activity, item_ids } = req.body || {};
    const activityStr = activity ? String(activity).trim() : null;
    if (!Array.isArray(item_ids) || item_ids.length === 0) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'item_ids is required', status: 400 },
      });
    }

    const logDate = /^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))
      ? String(date)
      : new Date().toISOString().slice(0, 10);

    const incomingIds = [...new Set(item_ids.map(String))];

    // Check if a log already exists for this user + date
    const { data: existing } = await db()
      .from('wear_logs')
      .select('id, item_ids, activities')
      .eq('user_id', userId)
      .eq('date', logDate)
      .maybeSingle();

    let logId;
    let newlyAddedIds; // only items not already logged today

    if (existing) {
      // Merge — add only items not already in today's log
      const alreadyLogged = new Set((existing.item_ids || []).map(String));
      newlyAddedIds = incomingIds.filter((id) => !alreadyLogged.has(id));
      const mergedIds = [...alreadyLogged, ...newlyAddedIds];

      // Merge activities — add new occasion if not already in the list
      const existingActivities = Array.isArray(existing.activities) ? existing.activities : [];
      const mergedActivities = activityStr && !existingActivities.includes(activityStr)
        ? [...existingActivities, activityStr]
        : existingActivities;

      const { error: updateErr } = await db()
        .from('wear_logs')
        .update({
          item_ids: mergedIds,
          activities: mergedActivities,
        })
        .eq('id', existing.id);
      if (updateErr) throw new Error(updateErr.message);
      logId = existing.id;
    } else {
      // New log entry for this date
      newlyAddedIds = incomingIds;
      logId = `log_${nanoid(12)}`;
      const { error: insertErr } = await db().from('wear_logs').insert({
        id: logId,
        user_id: userId,
        date: logDate,
        activities: activityStr ? [activityStr] : [],
        item_ids: incomingIds,
        created_at: new Date().toISOString(),
      });
      if (insertErr) throw new Error(insertErr.message);
    }

    // Only update wear counts for newly added items (not already counted today)
    if (newlyAddedIds.length > 0) {
      const { data: items } = await db()
        .from('wardrobe_items')
        .select('id, category, wear_history')
        .in('id', newlyAddedIds)
        .eq('user_id', userId);

      if (items && items.length > 0) {
        await Promise.all(
          items.map((item) => {
            const { times_worn_last_7_days, times_worn_last_30_days, wear_history } =
              computeRollingCounts(item.wear_history || [], logDate);
            const update = { times_worn_last_7_days, times_worn_last_30_days, wear_history };
            if (item.category !== 'footwear') update.last_worn_date = logDate;
            return db().from('wardrobe_items').update(update).eq('id', item.id);
          })
        );
      }
    }

    return res.status(201).json({ log_id: logId, date: logDate, items_logged: incomingIds.length });
  } catch (err) {
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to log wear', status: 500 },
    });
  }
});


// PATCH /api/v1/wear-log/:log_id/remove-item
// Removes a single item from a log entry. If no items remain, deletes the log entirely.
router.patch('/:log_id/remove-item', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const logId = String(req.params.log_id || '');
    const { item_id } = req.body || {};
    if (!item_id) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'item_id is required', status: 400 } });
    }

    const { data: log, error: fetchErr } = await db()
      .from('wear_logs').select('*').eq('id', logId).eq('user_id', userId).maybeSingle();
    if (fetchErr || !log) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Log entry not found', status: 404 } });
    }

    const remaining = (log.item_ids || []).filter((id) => String(id) !== String(item_id));

    if (remaining.length === 0) {
      // No items left — delete the whole log
      await db().from('wear_logs').delete().eq('id', logId);
    } else {
      await db().from('wear_logs').update({ item_ids: remaining }).eq('id', logId);
    }

    // Recompute wear counts for the removed item from remaining logs
    const { data: remainingLogs } = await db()
      .from('wear_logs').select('item_ids, date').eq('user_id', userId);

    const { data: itemData } = await db()
      .from('wardrobe_items').select('id, category').eq('id', String(item_id)).eq('user_id', userId).maybeSingle();

    if (itemData) {
      const allDates = (remainingLogs || [])
        .filter((l) => (l.item_ids || []).map(String).includes(String(item_id)))
        .map((l) => l.date)
        .sort((a, b) => b.localeCompare(a))
        .slice(0, 60);

      const today = new Date().toISOString().slice(0, 10);
      const anchor = new Date(today + 'T12:00:00Z');
      const cutoff7 = new Date(anchor); cutoff7.setUTCDate(cutoff7.getUTCDate() - 6);
      const cutoff30 = new Date(anchor); cutoff30.setUTCDate(cutoff30.getUTCDate() - 29);

      const update = {
        wear_history: allDates,
        times_worn_last_7_days: allDates.filter((d) => d >= cutoff7.toISOString().slice(0, 10)).length,
        times_worn_last_30_days: allDates.filter((d) => d >= cutoff30.toISOString().slice(0, 10)).length,
      };
      if (itemData.category !== 'footwear') {
        update.last_worn_date = allDates[0] || null;
      }
      await db().from('wardrobe_items').update(update).eq('id', itemData.id);
    }

    return res.status(200).json({ removed: item_id, log_id: logId, items_remaining: remaining.length });
  } catch (err) {
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to remove item', status: 500 } });
  }
});

// GET /api/v1/wear-log
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const from = req.query.from ? String(req.query.from) : null;
    const to = req.query.to ? String(req.query.to) : null;
    const itemId = req.query.item_id ? String(req.query.item_id) : null;

    let query = db()
      .from('wear_logs')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false });

    if (from) query = query.gte('date', from);
    if (to) query = query.lte('date', to);

    const { data: logs, error } = await query;
    if (error) throw new Error(error.message);

    let entries = logs || [];
    if (itemId) entries = entries.filter((e) => Array.isArray(e.item_ids) && e.item_ids.includes(itemId));

    // Resolve item names
    const referencedIds = [...new Set(entries.flatMap((e) => e.item_ids || []))];
    const names = new Map();
    if (referencedIds.length > 0) {
      const { data: wardrobeItems } = await db()
        .from('wardrobe_items')
        .select('id, name')
        .eq('user_id', userId)
        .in('id', referencedIds);
      (wardrobeItems || []).forEach((w) => names.set(w.id, w.name || 'Item'));
    }

    return res.json({
      entries: entries.map((e) => ({
        log_id: e.id,
        date: e.date,
        activities: Array.isArray(e.activities) ? e.activities : (e.activity ? [e.activity] : []),
        items: (e.item_ids || []).map((id) => ({ item_id: id, name: names.get(id) || 'Item' })),
      })),
    });
  } catch (err) {
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to load wear logs', status: 500 },
    });
  }
});

module.exports = router;