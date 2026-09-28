#!/usr/bin/env bash
# Rasterises the brand mark into the icons browsers and phones ask for.
# Sources live next to this script; run it again after changing them.
# Needs ImageMagick 7 (`brew install imagemagick`).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"

render() { magick -background none -density 300 "$1" -resize "$2x$2" "$3"; }

render "$here/app-icon.svg" 180 "$root/src/app/apple-icon.png"
render "$here/app-icon.svg" 192 "$root/public/icons/icon-192.png"
render "$here/app-icon.svg" 512 "$root/public/icons/icon-512.png"
render "$here/app-icon-maskable.svg" 512 "$root/public/icons/icon-maskable-512.png"

# The .ico is for browsers that ignore icon.svg; a dark tile reads on any tab.
tmp="$(mktemp -d)"
for size in 16 32 48; do render "$here/favicon-tile.svg" "$size" "$tmp/$size.png"; done
magick "$tmp/16.png" "$tmp/32.png" "$tmp/48.png" "$root/src/app/favicon.ico"
rm -rf "$tmp"
