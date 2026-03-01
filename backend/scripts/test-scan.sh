#!/usr/bin/env bash
# Test wardrobe + pre-filter + LLM recommendation.
# Run from project root: ./backend/scripts/test-scan.sh
#
# Full flow (default): 1) token 2) scan 3) add item 4) list wardrobe 5) GET candidates 6) POST /recommendations
# QUICK=1: skip scan+add (steps 2–3); use existing DB from bulk-add. Runs: token -> list -> candidates -> POST /recommendations
#
# Optional: IMAGE_PATH=./path/to/photo.jpg
# Optional: ACTIVITY=casual|office|gym|formal|outdoor (pre-filter occasion + recommendation)
# Optional: CANDIDATES_DATE=2026-02-28 (recency cutoff and recommendation date)
# Optional: LAT=40.7128 LON=-74.0060 (weather for pre-filter + next-best ordering)
# Optional: SKIP_RECOMMEND=1 (do not call POST /recommendations after step 5)
#
# Tests: pre-filter, mandatory top/bottom/footwear, next-best when no weather-ideal item.

set -e
BASE="${BASE_URL:-http://localhost:3000/api/v1}"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
IMAGES_DIR="${IMAGES_DIR:-$PROJECT_ROOT/images}"
TMP_PAYLOAD="${TMPDIR:-/tmp}/dayadapt-add-payload.json"
export TMP_PAYLOAD

# Pick first image if IMAGE_PATH not set (not needed when QUICK=1)
if [ -z "${QUICK}" ] || [ "${QUICK}" != "1" ]; then
  if [ -z "${IMAGE_PATH}" ]; then
    if [ ! -d "$IMAGES_DIR" ]; then
      echo "No images dir at $IMAGES_DIR. Set IMAGES_DIR or IMAGE_PATH (or use QUICK=1 to skip scan/add)."
      exit 1
    fi
    IMAGE_PATH=$(find "$IMAGES_DIR" -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" \) | head -1)
    if [ -z "$IMAGE_PATH" ]; then
      echo "No jpg/png found in $IMAGES_DIR. Set IMAGE_PATH or use QUICK=1."
      exit 1
    fi
    echo "Using image: $IMAGE_PATH"
  fi
  if [ ! -f "$IMAGE_PATH" ]; then
    echo "File not found: $IMAGE_PATH"
    exit 1
  fi
elif [ -z "${IMAGE_PATH}" ]; then
  IMAGE_PATH=""
fi

# 1) Get token (register seed user or login)
echo "1. Getting token (seed user)..."
REG=$(curl -s -X POST "$BASE/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"seed@test.dayadapt.local","password":"seed-pass-123","name":"Seed User"}')
TOKEN=$(echo "$REG" | node -e "
let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
  try { const j=JSON.parse(d); if(j.token) console.log(j.token); else process.exit(1); } catch(e){ process.exit(1); }
});
" 2>/dev/null) || true

if [ -z "$TOKEN" ]; then
  echo "   Register failed (maybe exists), trying login..."
  LOGIN=$(curl -s -X POST "$BASE/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"seed@test.dayadapt.local","password":"seed-pass-123"}')
  TOKEN=$(echo "$LOGIN" | node -e "
let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
  try { const j=JSON.parse(d); console.log(j.token||''); } catch(e){}
});
" 2>/dev/null)
fi

if [ -z "$TOKEN" ]; then
  echo "   Could not get token. Is the server running? Try: cd backend && npm run dev"
  exit 1
fi
echo "   Token obtained."

# 2) POST /wardrobe/scan (skip if QUICK=1)
if [ -z "${QUICK}" ] || [ "${QUICK}" != "1" ]; then
  echo ""
  echo "2. POST /wardrobe/scan ..."
  SCAN_RESP=$(curl -s -X POST "$BASE/wardrobe/scan" \
    -H "Authorization: Bearer $TOKEN" \
    -F "image=@$IMAGE_PATH" \
    -F "category_hint=top")

  echo "$SCAN_RESP" | node -e "
let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
  try {
    const j=JSON.parse(d);
    if (j.error) { console.error('Error:', j.error); process.exit(1); }
    console.log('   scan_id:', j.scan_id);
    console.log('   status:', j.status);
    if (j.detected_item) {
      const di = j.detected_item;
      console.log('   detected_item.name:', di.name);
      console.log('   detected_item.category:', di.category);
      console.log('   detected_item.confidence:', di.confidence);
    }
  } catch(e) { console.error(d); process.exit(1); }
});
"

  echo ""
  echo "3. POST /wardrobe/items (add scanned item) ..."
  echo "$SCAN_RESP" | node -e "
let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
  try {
    const j=JSON.parse(d);
    if (j.error || !j.detected_item) { process.exit(1); }
    const di = j.detected_item;
    const payload = {
      name: di.name,
      description: di.description || '',
      category: di.category,
      image_url: di.image_url,
      tags: di.tags || {},
      confidence: di.confidence != null ? di.confidence : undefined
    };
    const fs = require('fs');
    fs.writeFileSync(process.env.TMP_PAYLOAD || '/tmp/dayadapt-add-payload.json', JSON.stringify(payload));
  } catch(e) { process.exit(1); }
});
" 2>/dev/null

  ADD_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/wardrobe/items" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d @"$TMP_PAYLOAD")
  ADD_BODY=$(echo "$ADD_RESP" | sed '$d')
  ADD_CODE=$(echo "$ADD_RESP" | tail -1)

  if [ "$ADD_CODE" != "201" ]; then
    echo "   Failed (HTTP $ADD_CODE): $ADD_BODY"
    exit 1
  fi
  echo "$ADD_BODY" | node -e "
let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
  try {
    const j=JSON.parse(d);
    if (j.error) { console.error('   Error:', j.error); process.exit(1); }
    console.log('   item_id:', j.item_id);
    console.log('   name:', j.name);
    console.log('   category:', j.category);
  } catch(e) {}
});
"
else
  echo ""
  echo "2.–3. Skipped (QUICK=1: using existing wardrobe)."
fi

# 4) GET /wardrobe
echo ""
echo "4. GET /wardrobe ..."
WARDROBE_RESP=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/wardrobe")

echo "$WARDROBE_RESP" | node -e "
let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
  try {
    const j=JSON.parse(d);
    if (j.error) { console.error('   Error:', j.error); process.exit(1); }
    console.log('   total:', j.total);
    console.log('   items:', (j.items || []).length);
    (j.items || []).forEach((it, i) => {
      console.log('   [' + (i+1) + ']', it.item_id, it.name, '(' + it.category + ')');
    });
  } catch(e) { console.error(d); }
});
"

# 5) GET /recommendations/candidates (database pre-filter; optional weather if LAT/LON set)
echo ""
echo "5. GET /recommendations/candidates (pre-filter) ..."
CANDIDATES_QUERY=""
if [ -n "${ACTIVITY}" ]; then
  CANDIDATES_QUERY="?activity=${ACTIVITY}"
fi
if [ -n "${CANDIDATES_DATE}" ]; then
  [ -z "${CANDIDATES_QUERY}" ] && CANDIDATES_QUERY="?" || CANDIDATES_QUERY="${CANDIDATES_QUERY}&"
  CANDIDATES_QUERY="${CANDIDATES_QUERY}date=${CANDIDATES_DATE}"
fi
if [ -n "${LAT}" ] && [ -n "${LON}" ]; then
  [ -z "${CANDIDATES_QUERY}" ] && CANDIDATES_QUERY="?" || CANDIDATES_QUERY="${CANDIDATES_QUERY}&"
  CANDIDATES_QUERY="${CANDIDATES_QUERY}lat=${LAT}&lon=${LON}"
  echo "   (with weather: lat=$LAT lon=$LON)"
fi
CANDIDATES_RESP=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/recommendations/candidates$CANDIDATES_QUERY")

echo "$CANDIDATES_RESP" | node -e "
let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
  try {
    const j=JSON.parse(d);
    if (j.error) { console.error('   Error:', j.error); process.exit(1); }
    console.log('   date:', j.date);
    console.log('   activity:', j.activity);
    if (j.weather) {
      console.log('   weather: feels_like_c=' + j.weather.feels_like_c + ', condition=' + j.weather.condition + ', rain_probability=' + j.weather.rain_probability);
    }
    const c = j.counts || {};
    console.log('   counts: top=' + (c.top||0) + ', bottom=' + (c.bottom||0) + ', footwear=' + (c.footwear||0) + ', optional=' + (c.optional||0));
    const empty = ['top','bottom','footwear'].filter(s => !(c[s] > 0));
    if (empty.length) console.log('   note: no candidates for ' + empty.join(', ') + ' (mandatory slots need items in wardrobe)');
    const cand = j.candidates || {};
    ['top','bottom','footwear','optional'].forEach(slot => {
      const arr = cand[slot] || [];
      if (arr.length) {
        console.log('   ' + slot + ':', arr.map(it => it.name).join(', '));
      }
    });
  } catch(e) { console.error(d); }
});
"

# 6) POST /recommendations (pre-filter + LLM outfit); skip if SKIP_RECOMMEND=1
if [ -z "${SKIP_RECOMMEND}" ] || [ "${SKIP_RECOMMEND}" != "1" ]; then
  echo ""
  echo "6. POST /recommendations (LLM outfit) ..."
  RECOMMEND_BODY="{\"activity\":\"${ACTIVITY:-casual}\",\"mood\":\"relaxed\""
  if [ -n "${CANDIDATES_DATE}" ]; then
    RECOMMEND_BODY="${RECOMMEND_BODY},\"date\":\"${CANDIDATES_DATE}\""
  fi
  if [ -n "${LAT}" ] && [ -n "${LON}" ]; then
    RECOMMEND_BODY="${RECOMMEND_BODY},\"location\":{\"lat\":${LAT},\"lon\":${LON}}"
  fi
  RECOMMEND_BODY="${RECOMMEND_BODY}}"
  REC_RESP=$(curl -s -X POST "$BASE/recommendations" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$RECOMMEND_BODY")
  echo "$REC_RESP" | node -e "
let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
  try {
    const j=JSON.parse(d);
    if (j.error) { console.error('   Error:', j.error); process.exit(1); }
    console.log('   recommendation_id:', j.recommendation_id);
    console.log('   date:', j.date);
    if (j.weather) console.log('   weather: feels_like_c=' + j.weather.feels_like_c + ', ' + j.weather.condition);
    if (j.outfit) {
      const slots = ['top','bottom','footwear'];
      const filled = slots.filter(s => j.outfit[s] && j.outfit[s].item_id);
      console.log('   mandatory slots: ' + slots.map(s => filled.includes(s) ? s + ' ✓' : s + ' -').join('  '));
      slots.forEach(s => {
        if (j.outfit[s]) console.log('   outfit.' + s + ':', j.outfit[s].name, '-', (j.outfit[s].reason||'').slice(0,70));
      });
      (j.outfit.optional||[]).forEach((o,i)=> console.log('   outfit.optional['+i+']:', o.name, '-', (o.reason||'').slice(0,60)));
    }
    if (j.health_insights && j.health_insights.length) {
      console.log('   health_insights:');
      j.health_insights.forEach((h,i)=> console.log('     ['+i+']', (h.severity||'').toUpperCase(), (h.message||'').slice(0,100)));
    }
    console.log('   explanation:', (j.explanation||'').slice(0,160) + ((j.explanation||'').length > 160 ? '...' : ''));
  } catch(e) { console.error(d); process.exit(1); }
});
"
else
  echo ""
  echo "6. Skipped (SKIP_RECOMMEND=1)."
fi

echo ""
echo "Done. Pre-filter + LLM recommendation test succeeded."
