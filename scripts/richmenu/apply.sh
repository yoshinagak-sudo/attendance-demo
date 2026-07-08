#!/usr/bin/env bash
# LINE Messaging API 経由でリッチメニューを再作成する。
# 使い方: ./apply.sh
# 前提: `security add-generic-password -a "$USER" -s "claude-line-attendance-ninau-token" -w "<token>"` 済み
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
TOKEN=$(security find-generic-password -a "$USER" -s "claude-line-attendance-ninau-token" -w)
IMG="$DIR/richmenu.png"

# 画像が無ければ生成
if [ ! -f "$IMG" ]; then
  python3 "$DIR/generate.py"
fi

# 既存の default richmenu を解除 (残しても新しい方で上書きされるが念のため)
CURRENT=$(curl -sS -H "Authorization: Bearer $TOKEN" https://api.line.me/v2/bot/user/all/richmenu 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('richMenuId',''))" 2>/dev/null || true)

# 新規リッチメニュー作成
RID=$(curl -sS -X POST https://api.line.me/v2/bot/richmenu \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @"$DIR/richmenu.json" | python3 -c "import sys,json; print(json.load(sys.stdin)['richMenuId'])")

echo "created: $RID"

# 画像アップロード
curl -sS -X POST "https://api-data.line.me/v2/bot/richmenu/$RID/content" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: image/png" \
  --data-binary "@$IMG" > /dev/null
echo "uploaded image"

# 全ユーザーの既定に設定
curl -sS -X POST "https://api.line.me/v2/bot/user/all/richmenu/$RID" \
  -H "Authorization: Bearer $TOKEN" > /dev/null
echo "set as default for all users"

# 古いメニューを削除
if [ -n "$CURRENT" ] && [ "$CURRENT" != "$RID" ]; then
  curl -sS -X DELETE "https://api.line.me/v2/bot/richmenu/$CURRENT" \
    -H "Authorization: Bearer $TOKEN" > /dev/null
  echo "deleted old: $CURRENT"
fi
