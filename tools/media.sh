#!/usr/bin/env bash
# Fury Moto media pipeline (see docs/MEDIA.md).
#
#   tools/media.sh <name>            build all video/still/frame outputs from assets/source/<name>.mp4
#   tools/media.sh photos <in.jpg> <name>
#                                    WebP + JPG at 2400/1600/800 widths (originals untouched)
#
# Environment overrides:
#   FF=/path/to/ffmpeg.exe           ffmpeg location (ffprobe is looked up next to it)
#   FRAME_COUNT=150                  number of frames in the scroll-driven frame sequence
#
# Override the ffmpeg location with FF=/path/to/ffmpeg.exe (ffprobe is looked up next to it).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FF="${FF:-/c/Users/Dell/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.1-full_build/bin/ffmpeg.exe}"
if [ ! -f "$FF" ]; then FF=ffmpeg; fi
FP="${FF%ffmpeg.exe}ffprobe.exe"
if [ ! -f "$FP" ]; then FP=ffprobe; fi

FRAME_COUNT="${FRAME_COUNT:-150}"

# Fit any source to W x H (9:16 targets): scale to cover, then crop keeping the TOP
# area (helmet). For a 9:16 source this is a no-op scale + crop.
fit() { echo "scale=$1:$2:force_original_aspect_ratio=increase:flags=lanczos,crop=$1:$2:(iw-ow)/2:0"; }

# ---------------------------------------------------------------- photos mode
if [ "${1:-}" = "photos" ]; then
  IN="${2:?usage: tools/media.sh photos <in.jpg> <name>}"
  NAME="${3:?usage: tools/media.sh photos <in.jpg> <name>}"
  OUT="assets/img/photos"
  mkdir -p "$OUT"
  for W in 2400 1600 800; do
    # min(W,iw) = never upscale a photo that is smaller than the target width
    "$FF" -y -v error -i "$IN" -vf "scale='min($W,iw)':-2:flags=lanczos" -frames:v 1 \
      -c:v libwebp -quality 80 "$OUT/$NAME-$W.webp"
    "$FF" -y -v error -i "$IN" -vf "scale='min($W,iw)':-2:flags=lanczos" -frames:v 1 \
      -q:v 3 "$OUT/$NAME-$W.jpg"
  done
  ls -l "$OUT"/"$NAME"-*
  exit 0
fi

# ---------------------------------------------------------------- video mode
NAME="${1:?usage: tools/media.sh <name>   (reads assets/source/<name>.mp4)}"
SRC="assets/source/$NAME.mp4"
[ -f "$SRC" ] || { echo "missing $SRC" >&2; exit 1; }

V="assets/video"
C="assets/img/categories"
ST="assets/img/stills"
mkdir -p "$V" "$C" "$ST"

DUR="$("$FP" -v error -show_entries format=duration -of csv=p=0 "$SRC")"
# Frame sequence: FRAME_COUNT evenly spread over the whole clip (first frame = first video frame,
# last frame = final moment of the clip).
FPS="$(awk -v d="$DUR" -v n="$FRAME_COUNT" 'BEGIN{printf "%.6f", n/d}')"

VF1080="$(fit 1080 1920)"
VF720="$(fit 720 1280)"

# Frame sequence helper: frames <dir> <W> <H> <WebP quality>
# Writes <dir>/frame_0001.webp ... frame_NNNN.webp (1-based, no gaps). Clears old frames first.
frames() {
  local dir="$1" w="$2" h="$3" q="$4" n
  mkdir -p "$dir"
  rm -f "$dir"/frame_*.webp
  "$FF" -y -v error -i "$SRC" -vf "fps=$FPS,scale=$w:$h:flags=lanczos" \
    -frames:v "$FRAME_COUNT" -start_number 1 \
    -c:v libwebp -quality "$q" -compression_level 6 "$dir/frame_%04d.webp"
  n="$(ls "$dir" | grep -c '^frame_[0-9]\{4\}\.webp$' || true)"
  if [ "$n" != "$FRAME_COUNT" ]; then
    echo "FAIL: $dir has $n frames, expected $FRAME_COUNT" >&2; exit 1
  fi
}

# Still helper: still <time_sec> <crop w:h:x:y in source px> <out basename> <width>
# Writes <out>.webp (q78) and <out>.jpg (-q:v 3).
still() {
  local t="$1" crop="$2" out="$3" w="$4"
  "$FF" -y -v error -ss "$t" -i "$SRC" -frames:v 1 \
    -vf "crop=$crop,scale=$w:-2:flags=lanczos" -c:v libwebp -quality 78 "$out.webp"
  "$FF" -y -v error -ss "$t" -i "$SRC" -frames:v 1 \
    -vf "crop=$crop,scale=$w:-2:flags=lanczos" -q:v 3 "$out.jpg"
}

echo "== source: $SRC  duration=${DUR}s  frames=$FRAME_COUNT  fps-for-frames=$FPS"

# 1080x1920 H.264
"$FF" -y -v error -i "$SRC" -vf "$VF1080" -c:v libx264 -preset veryfast -crf 23 \
  -pix_fmt yuv420p -an -movflags +faststart "$V/$NAME-1080.mp4"

# 720x1280 H.264
"$FF" -y -v error -i "$SRC" -vf "$VF720" -c:v libx264 -preset veryfast -crf 23 \
  -pix_fmt yuv420p -an -movflags +faststart "$V/$NAME-720.mp4"

# VP9 WebM (row-mt/cpu-used only affect encode speed, not the CRF target)
"$FF" -y -v error -i "$SRC" -vf "$VF1080" -c:v libvpx-vp9 -crf 33 -b:v 0 \
  -row-mt 1 -cpu-used 4 -pix_fmt yuv420p -an "$V/$NAME-1080.webm"
"$FF" -y -v error -i "$SRC" -vf "$VF720" -c:v libvpx-vp9 -crf 33 -b:v 0 \
  -row-mt 1 -cpu-used 4 -pix_fmt yuv420p -an "$V/$NAME-720.webm"

# Poster = first frame at 1080x1920
"$FF" -y -v error -i "$SRC" -frames:v 1 -vf "$VF1080" -c:v libwebp -quality 80 "$V/$NAME-poster.webp"
"$FF" -y -v error -i "$SRC" -frames:v 1 -vf "$VF1080" -q:v 3 "$V/$NAME-poster.jpg"

# 3 s crop clip (from t=2 s), 540x960
"$FF" -y -v error -ss 2 -t 3 -i "$SRC" -vf "scale=540:960:flags=lanczos" -c:v libx264 \
  -preset veryfast -crf 26 -pix_fmt yuv420p -an -movflags +faststart "$V/$NAME-crop.mp4"

# Scroll-driven canvas frame sequences (page top = frame 1, page bottom = frame FRAME_COUNT).
# rider-hero keeps the short paths assets/frames/{desktop,mobile}; other clips get assets/frames/<name>/...
if [ "$NAME" = "rider-hero" ]; then FD="assets/frames/desktop"; FM="assets/frames/mobile"
else FD="assets/frames/$NAME/desktop"; FM="assets/frames/$NAME/mobile"; fi
frames "$FD" 1080 1920 72   # desktop, WebP q72 (step down by 5 if the set exceeds ~22 MB, not below 55)
frames "$FM"  720 1280 70   # mobile,  WebP q70

# Category stills (1:1 = 1080x1080 or 840x840 crop, 4:5 = 1080x1350), 800 wide
still 5.0 "840:840:120:260"  "$C/helmets"      800   # helmet close-up
still 2.0 "1080:1350:0:570"  "$C/race-suits"   800   # full race suit
still 3.0 "1080:1350:0:300"  "$C/jackets"      800   # chest / jacket
still 6.0 "1080:1080:0:780"  "$C/gloves"       800   # glove raised at shoulder
still 0.5 "800:1000:140:920"  "$C/boots"        800   # lower body (boots sit at the source's bottom edge)
still 4.0 "1080:1350:0:300"  "$C/protection"   800   # back/chest protection
still 7.0 "1080:1080:0:0"    "$C/accessories"  800   # helmet + glove detail

# About page stills (4:5 crop). 1600 is upscaled from the 1080 source (no higher-res source exists).
still 1.0 "1080:1350:0:300" "$ST/rider-1-800"  800
still 1.0 "1080:1350:0:300" "$ST/rider-1-1600" 1600
still 3.5 "1080:1350:0:300" "$ST/rider-2-800"  800
still 3.5 "1080:1350:0:300" "$ST/rider-2-1600" 1600
still 6.5 "1080:1350:0:300" "$ST/rider-3-800"  800
still 6.5 "1080:1350:0:300" "$ST/rider-3-1600" 1600

# ---------------------------------------------------------------- verify
echo "== verify (non-zero size required)"
FAIL=0
check() { if [ -s "$1" ]; then printf '%10d  %s\n' "$(stat -c %s "$1")" "$1"; else echo "MISSING/EMPTY: $1"; FAIL=1; fi; }
for f in "$V/$NAME-1080.mp4" "$V/$NAME-720.mp4" "$V/$NAME-1080.webm" "$V/$NAME-720.webm" \
         "$V/$NAME-poster.webp" "$V/$NAME-poster.jpg" "$V/$NAME-crop.mp4"; do check "$f"; done
for dir in "$FD" "$FM"; do
  for i in $(seq 1 "$FRAME_COUNT"); do check "$(printf '%s/frame_%04d.webp' "$dir" "$i")" >/dev/null || FAIL=1; done
  echo "frames: $(ls "$dir" | grep -c '^frame_[0-9]\{4\}\.webp$' || true) files in $dir  total=$(du -cb "$dir"/frame_*.webp | tail -1 | cut -f1) bytes"
done
for n in helmets race-suits jackets gloves boots protection accessories; do check "$C/$n.webp"; done
for n in rider-1 rider-2 rider-3; do for w in 800 1600; do check "$ST/$n-$w.webp"; check "$ST/$n-$w.jpg"; done; done
[ "$FAIL" = 0 ] && echo "ALL OK" || { echo "FAILURES above"; exit 1; }
