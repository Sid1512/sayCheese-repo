/**
 * Maps between Supabase DB rows (snake_case) and the API response shape.
 */

function toApiItem(row) {
  if (!row) throw new Error('toApiItem: row is null');
  return {
    item_id: row.id,
    name: row.name ?? '',
    description: row.description ?? '',
    category: row.category ?? '',
    layer: row.layer ?? null, // 'inner' | 'outer' | null
    image_url: row.image_url ?? '',
    tags: row.tags && typeof row.tags === 'object' ? row.tags : {},
    times_worn_last_7_days: Number(row.times_worn_last_7_days) || 0,
    times_worn_last_30_days: Number(row.times_worn_last_30_days) || 0,
    last_worn_date: row.last_worn_date ? String(row.last_worn_date).slice(0, 10) : null,
    added_at: row.added_at ?? null,
  };
}

/**
 * Map API request body to a Supabase DB insert row.
 * layer: only set for tops. Validated by the DB check constraint.
 */
function toDbItem(userId, itemId, body) {
  // Only store layer for top category; null for everything else
  const layer = body.category === 'top' && (body.layer === 'inner' || body.layer === 'outer')
    ? body.layer
    : null;

  return {
    id: itemId,
    user_id: userId,
    name: body.name,
    description: body.description ?? null,
    category: body.category,
    layer,
    image_url: body.image_url ?? '',
    tags: body.tags ?? {},
    times_worn_last_7_days: 0,
    times_worn_last_30_days: 0,
    last_worn_date: null,
    wear_history: [],
    added_at: new Date().toISOString(),
  };
}

module.exports = { toApiItem, toDbItem };