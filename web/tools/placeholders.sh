#!/usr/bin/env bash
# Generates labelled dark-gradient product placeholder images (WebP) into
# assets/img/products/. Re-runnable: overwrites existing placeholders.
#
# Output per product slot <category>-<n>:
#   <category>-<n>-1x1.webp  (1000x1000)
#   <category>-<n>-4x5.webp  (1000x1250)
# plus fallback.webp (1000x1250, "IMAGE COMING SOON").
#
# Requires ffmpeg with libwebp. Set FF to override the binary path.
set -euo pipefail

FF="${FF:-/c/Users/Dell/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.1-full_build/bin/ffmpeg.exe}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/assets/img/products"
FONT="C\:/Windows/Fonts/arialbd.ttf"
QUALITY=78

mkdir -p "$OUT"

# render <out> <width> <height> <accent_pct> <title_line1> [title_line2] <subline>
render() {
  local out="$1" w="$2" h="$3" accent="$4" t1="$5" t2="" sub
  if [[ $# -ge 7 ]]; then t2="$6"; sub="$7"; else sub="$6"; fi

  local ay=$(( h * accent / 100 ))
  local fs=$(( w / 10 ))
  local vf="drawbox=x=0:y=$((ay-70)):w=iw:h=140:color=0xE10600@0.10:t=fill"
  vf+=",drawbox=x=0:y=$ay:w=iw:h=4:color=0xE10600:t=fill"
  vf+=",drawbox=x=0:y=0:w=iw:h=ih:color=0x2A2A32:t=1"

  if [[ -z "$t2" ]]; then
    vf+=",drawtext=fontfile='$FONT':text='$t1':fontcolor=white:fontsize=$fs:x=(w-text_w)/2:y=(h-text_h)/2-30"
  else
    vf+=",drawtext=fontfile='$FONT':text='$t1':fontcolor=white:fontsize=$fs:x=(w-text_w)/2:y=(h-2*text_h)/2-40"
    vf+=",drawtext=fontfile='$FONT':text='$t2':fontcolor=white:fontsize=$fs:x=(w-text_w)/2:y=(h/2)+10"
  fi
  vf+=",drawtext=fontfile='$FONT':text='$sub':fontcolor=0x8A8A93:fontsize=$((w/30)):x=(w-text_w)/2:y=(h/2)+$((h>w ? 120 : 70))"

  "$FF" -hide_banner -loglevel error -y \
    -f lavfi -i "color=c=0x0E0E12:s=${w}x${h}:d=1,format=rgb24,geq=r='10+12*(X+Y)/(W+H)':g='10+12*(X+Y)/(W+H)':b='12+14*(X+Y)/(W+H)'" \
    -vf "$vf" -frames:v 1 -c:v libwebp -quality "$QUALITY" "$out"
}

# category slug:title:count
CATS=(
  "helmets:HELMET:8"
  "race-suits:RACE SUIT:6"
  "jackets:JACKET:6"
  "gloves:GLOVES:6"
  "boots:BOOTS:6"
  "protection:PROTECTION:5"
  "accessories:ACCESSORY:5"
)

for entry in "${CATS[@]}"; do
  IFS=':' read -r slug title count <<< "$entry"
  for (( n=1; n<=count; n++ )); do
    # Vary the accent line position by index so the grid is not identical.
    accent=$(( 15 + 6 * (n % 6) ))
    render "$OUT/$slug-$n-1x1.webp" 1000 1000 "$accent" "$title" "PLACEHOLDER · $slug $n"
    render "$OUT/$slug-$n-4x5.webp" 1000 1250 "$accent" "$title" "PLACEHOLDER · $slug $n"
  done
done

render "$OUT/fallback.webp" 1000 1250 30 "IMAGE" "COMING SOON" "PLACEHOLDER · fallback"

echo "Wrote placeholders to $OUT"
