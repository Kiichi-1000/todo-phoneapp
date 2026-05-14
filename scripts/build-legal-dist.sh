#!/bin/sh
# Cloudflare Pages 用: 法務 HTML のみを legal-pages-dist にまとめる（expo の dist/ と分離）。
# ダッシュボードの例:
#   ビルドコマンド: npm run legal:dist  （または sh scripts/build-legal-dist.sh）
#   ビルド出力ディレクトリ: legal-pages-dist
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/legal-pages-dist"
rm -rf "$OUT"
mkdir -p "$OUT/legal/tosche"
cp "$ROOT/legal/tosche/terms.html" "$ROOT/legal/tosche/privacy.html" "$ROOT/legal/tosche/subscription.html" "$ROOT/legal/tosche/tokushoho.html" "$ROOT/legal/tosche/index.html" "$OUT/legal/tosche/"
cp "$ROOT/legal/cf-dist-files/index-root.html" "$OUT/index.html"
cp "$ROOT/legal/cf-dist-files/_redirects" "$OUT/_redirects"
echo "Built $OUT (root index + legal/tosche/*.html + _redirects)"
