#!/usr/bin/env bash
# Bulk add wardrobe items from images folder: scan each with Claude Vision, then add to DB.
# Run from project root: ./backend/scripts/bulk-add-from-images.sh
# Optional: LIMIT=10 (default 10), IMAGES_DIR=./images, BASE_URL=http://localhost:3000/api/v1

set -e
BASE="${BASE_URL:-http://localhost:3000/api/v1}"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
IMAGES_DIR="${IMAGES_DIR:-$PROJECT_ROOT/images}"
LIMIT="${LIMIT:-20}"
TMP_PAYLOAD="${TMPDIR:-/tmp}/dayadapt-bulk-add-payload.json"
export TMP_PAYLOAD

if [ ! -d "$IMAGES_DIR" ]; then
  echo "No images dir at $IMAGES_DIR. Set IMAGES_DIR."
  exit 1
fi

# Collect up to LIMIT images (jpg, jpeg, png)
IMAGE_FILES=()
while IFS= read -r -d '' f; do
  IMAGE_FILES+=("$f")
  [ ${#IMAGE_FILES[@]} -ge "$LIMIT" ] && break
done < <(find "$IMAGES_DIR" -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" \) -print0 2>/dev/null | sort -z)

if [ ${#IMAGE_FILES[@]} -eq 0 ]; then
  echo "No jpg/png found in $IMAGES_DIR. Add images or set IMAGES_DIR."
  exit 1
fi

echo "Bulk add: ${#IMAGE_FILES[@]} images from $IMAGES_DIR (limit $LIMIT)"
echo ""

# 1) Get token (seed user)
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
  LOGIN=$(curl -s -X POST "$BASE/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"seed@test.dayadapt.local","password":"seed-pass-123"}')
  TOKEN=$(echo "$LOGIN" | node -e "
let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
  try { const j=JSON.parse(d); if(j.token) console.log(j.token); else process.exit(1); } catch(e){ process.exit(1); }
});
" 2>/dev/null)
fi

if [ -z "$TOKEN" ]; then
  echo "   Failed to get token."
  exit 1
fi
echo "   Token obtained."
echo ""

# 2) For each image: scan -> add item
ADDED=0
FAILED=0
i=0
for IMAGE_PATH in "${IMAGE_FILES[@]}"; do
  i=$((i + 1))
  echo "[$i/${#IMAGE_FILES[@]}] $(basename "$IMAGE_PATH") ..."

  SCAN_RESP=$(curl -s -X POST "$BASE/wardrobe/scan" \
    -H "Authorization: Bearer $TOKEN" \
    -F "image=@$IMAGE_PATH")

  if ! echo "$SCAN_RESP" | node -e "
let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
  try {
    const j=JSON.parse(d);
    if (j.error || !j.detected_item) process.exit(1);
    const di = j.detected_item;
    const payload = {
      name: di.name,
      description: di.description || '',
      category: di.category,
      image_url: di.image_url,
      tags: di.tags || {},
      confidence: di.confidence != null ? di.confidence : undefined
    };
    require('fs').writeFileSync(process.env.TMP_PAYLOAD, JSON.stringify(payload));
  } catch(e) { process.exit(1); }
});
" 2>/dev/null; then
    echo "   Scan failed, skipping."
    FAILED=$((FAILED + 1))
    continue
  fi

  ADD_RESP=$(curl -s -w "\n%{http_code}" -X POST "$BASE/wardrobe/items" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d @"$TMP_PAYLOAD")
  ADD_BODY=$(echo "$ADD_RESP" | sed '$d')
  ADD_CODE=$(echo "$ADD_RESP" | tail -1)

  if [ "$ADD_CODE" = "201" ]; then
    NAME=$(echo "$ADD_BODY" | node -e "let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{ try { const j=JSON.parse(d); console.log(j.name); } catch(e){} });" 2>/dev/null)
    echo "   Added: $NAME"
    ADDED=$((ADDED + 1))
  else
    echo "   Add failed (HTTP $ADD_CODE): $ADD_BODY"
    FAILED=$((FAILED + 1))
  fi
done

echo ""
echo "Done. Added: $ADDED, failed: $FAILED"
