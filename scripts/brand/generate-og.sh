#!/usr/bin/env bash
# Renders src/app/opengraph-image.png, the card shown when the link is shared.
# Downloads the brand fonts (OFL) into a temp dir; nothing is kept but the PNG.
# Needs ImageMagick 7, curl and python3.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

css="$(curl -s -A 'Mozilla/4.0' 'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;600&family=JetBrains+Mono:wght@500')"
urls=($(grep -oE 'https://[^)]+\.ttf' <<<"$css"))
curl -s -o "$tmp/sans-400.ttf" "${urls[0]}"
curl -s -o "$tmp/sans-600.ttf" "${urls[1]}"
curl -s -o "$tmp/mono-500.ttf" "${urls[2]}"

# Shapes: the mark, and a week of forecast pills whose peaks turn epic yellow.
python3 - "$tmp/bg.svg" <<'PY'
import math, sys
W, H = 1200, 630
out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}"><rect width="{W}" height="{H}" fill="#0F171D"/>']
out.append('<g transform="translate(96 196) scale(3.2)">')
for x, h, accent in [(2, 8, 0), (8, 13, 0), (14, 20, 0), (20, 24, 1), (26, 11, 0)]:
    out.append(f'<rect x="{x}" y="{28 - h}" width="4" height="{h}" rx="2" fill="{"#FBBF24" if accent else "#F1F4F6"}"/>')
out.append('</g>')
cold, hot = (0x3A, 0x44, 0x4C), (0xFB, 0xBF, 0x24)
for i in range(40):
    v = max(0.05, min(1, 0.5 + 0.4 * math.sin(i / 4.2 - 1.2) + 0.2 * math.sin(i / 1.7)))
    h = 10 + 80 * v
    t = max(0, min(1, (v - 0.55) / 0.3))
    c = tuple(round(cold[k] + (hot[k] - cold[k]) * t) for k in range(3))
    out.append(f'<rect x="{96 + i * 25.6:.1f}" y="{560 - h:.1f}" width="10" height="{h:.1f}" rx="5" fill="rgb{c}"/>')
out.append('</svg>')
open(sys.argv[1], 'w').write(''.join(out))
PY

magick -background none -density 96 "$tmp/bg.svg" "$tmp/bg.png"
wave="$(magick -font "$tmp/sans-600.ttf" -pointsize 96 label:wave -format %w info:)"
magick "$tmp/bg.png" \
  -font "$tmp/mono-500.ttf" -pointsize 22 -fill '#66727B' -annotate +98+132 'SURF FORECAST  ·  A 0–10 SCORE FOR EVERY SPOT' \
  -font "$tmp/sans-600.ttf" -pointsize 96 -fill '#F1F4F6' -annotate +222+276 'wave' \
  -font "$tmp/sans-400.ttf" -pointsize 96 -fill '#95A1AA' -annotate +$((222 + wave - 8))+276 'reader' \
  -font "$tmp/sans-400.ttf" -pointsize 44 -fill '#CBD3D9' -annotate +98+384 'Read the sea before you drive.' \
  "$root/src/app/opengraph-image.png"
