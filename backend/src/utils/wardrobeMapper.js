/**
 * Safe date/timestamp to ISO string or null. Handles Firestore Timestamp, string, or invalid.
 */
function toISOOrNull(val) {
  if (val == null || val === '') return null;
  try {
    if (typeof val.toDate === 'function') {
      const d = val.toDate();
      return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
    }
    if (typeof val === 'string') return val;
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}

/** For last_worn_date we want YYYY-MM-DD or null. */
function toDateOnlyOrNull(val) {
  const iso = toISOOrNull(val);
  return iso ? iso.slice(0, 10) : null;
}

function safeAddedAt(data) {
  if (!data || data.addedAt == null) return null;
  return toISOOrNull(data.addedAt);
}

function toApiItem(id, data) {
  if (!data) data = {};
  try {
    const confidence = data.confidence != null ? Number(data.confidence) : null;
    return {
      item_id: id,
      name: data.name ?? '',
      description: data.description ?? '',
      category: data.category ?? '',
      image_url: data.imageUrl ?? '',
      tags: data.tags && typeof data.tags === 'object' ? data.tags : {},
      times_worn_last_7_days: Number(data.timesWornLast7Days) || 0,
      times_worn_last_30_days: Number(data.timesWornLast30Days) || 0,
      last_worn_date: toDateOnlyOrNull(data.lastWornDate),
      added_at: safeAddedAt(data),
      confidence: confidence >= 0 && confidence <= 1 ? confidence : null,
    };
  } catch (err) {
    throw new Error(`toApiItem(${id}) failed: ${err.message}`);
  }
}

/**
 * Map API request (snake_case) to Firestore document (camelCase) for create.
 */
function toFirestoreItem(userId, body) {
  const now = new Date().toISOString();
  const rawConf = body.confidence;
  const confidence =
    rawConf == null || rawConf === '' || Number.isNaN(Number(rawConf))
      ? null
      : Math.min(1, Math.max(0, Number(rawConf)));
  return {
    userId,
    name: body.name,
    description: body.description ?? null,
    category: body.category,
    imageUrl: body.image_url ?? '',
    tags: body.tags ?? {},
    timesWornLast7Days: 0,
    timesWornLast30Days: 0,
    lastWornDate: null,
    addedAt: now,
    confidence,
  };
}

module.exports = { toApiItem, toFirestoreItem };
