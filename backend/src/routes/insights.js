const express = require('express');
const { getAdminClient } = require('../config/supabase');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const db = () => getAdminClient();

function dateOnly(d) {
  return d.toISOString().slice(0, 10);
}

router.get('/wardrobe-utilization', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const period = req.query.period === 'week' ? 'week' : 'month';
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - (period === 'week' ? 6 : 29));

    const fromStr = dateOnly(from);
    const toStr = dateOnly(to);

    const [{ data: logs }, { data: wardrobeItems }] = await Promise.all([
      db()
        .from('wear_logs')
        .select('item_ids, date')
        .eq('user_id', userId)
        .gte('date', fromStr)
        .lte('date', toStr)
        .order('date', { ascending: false }),
      db()
        .from('wardrobe_items')
        .select('id, name')
        .eq('user_id', userId),
    ]);

    const wearCount = new Map();
    const lastWorn = new Map();
    (logs || []).forEach((e) => {
      (e.item_ids || []).forEach((id) => {
        wearCount.set(id, (wearCount.get(id) || 0) + 1);
        if (!lastWorn.has(id)) lastWorn.set(id, e.date || null);
      });
    });

    const items = (wardrobeItems || []).map((w) => ({
      item_id: w.id,
      name: w.name || 'Item',
      times_worn: wearCount.get(w.id) || 0,
      last_worn_date: lastWorn.get(w.id) || null,
    }));

    const totalWears = items.reduce((sum, i) => sum + i.times_worn, 0);
    const unwornCount = items.filter((i) => i.times_worn === 0).length;

    return res.json({
      period,
      from: fromStr,
      to: toStr,
      total_wears: totalWears,
      items,
      summary: unwornCount > 0
        ? `${unwornCount} items haven't been worn this ${period}.`
        : `Great rotation this ${period}.`,
    });
  } catch (err) {
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to load insights', status: 500 },
    });
  }
});

module.exports = router;
