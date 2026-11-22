# Media pipeline

All video, frame-sequence and still exports are produced by one re-runnable script: **`tools/media.sh`**.
Do not hand-edit the outputs; change the script and re-run it.

## Prerequisites

- Windows with Git Bash (the script is bash).
- ffmpeg with libx264, libvpx-vp9 and libwebp:
  ```bash
  winget install Gyan.FFmpeg
  ```
  The script looks for the winget build at
  `/c/Users/Dell/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.1-full_build/bin/ffmpeg.exe`
  (ffprobe.exe sits beside it). Any other install works: `FF=/path/to/ffmpeg.exe tools/media.sh <name>`,
  or put `ffmpeg` on PATH.

## Adding a new video clip

1. **Drop the file** in `assets/source/<name>.mp4` (the original stays untouched).
2. **Run the pipeline** from the repo root:
   ```bash
   tools/media.sh <name>
   ```
   This writes:
   - `assets/video/<name>-1080.mp4/.webm`, `<name>-720.mp4/.webm` (product-gallery loops)
   - `assets/video/<name>-poster.webp/.jpg`, `<name>-crop.mp4` (3 s card crop)
   - the scroll-driven frame sequences (see below): `assets/frames/desktop/` and `assets/frames/mobile/`
     for `rider-hero`, or `assets/frames/<name>/desktop/` and `assets/frames/<name>/mobile/` for any other clip
   - the category stills and About stills (see below)
3. **Set the backdrop** in `js/site.config.js`:
   ```js
   backdrop: {
     frames: { desktop: 'assets/frames/<name>/desktop', mobile: 'assets/frames/<name>/mobile', count: 150 }
   }
   ```
   (For `rider-hero` the paths are `assets/frames/desktop` and `assets/frames/mobile`.)
4. **Add an entry** to `videos` in `js/site.config.js` pointing at the new files.
5. **Assign it** in `videoSlots` in `js/site.config.js`.

Category stills (`assets/img/categories/*.webp`) and About stills (`assets/img/stills/rider-{1,2,3}-*`)
are written by the same run. They are **fixed to the rider-hero crop timestamps**, so for a new clip either
edit the `still` lines in `tools/media.sh` first or copy the old files aside, since they will be overwritten.

## Scroll-driven frame sequence (canvas background)

The site draws a scroll-driven canvas background from a sequence of WebP frames. Scrolling moves through
the sequence: **page top = frame 0001, page bottom = the last frame (0150)**. The frames are
decoded and drawn in order by the canvas, so every frame must be a standalone image (no video seeking).

- **Count:** `FRAME_COUNT=150` by default (`FRAME_COUNT=<n> tools/media.sh <name>` overrides it).
  The frames are spread evenly over the **whole** clip, from the very first video frame to the final moment.
  The script fails if the folder does not contain exactly `FRAME_COUNT` files.
- **Naming:** `frame_0001.webp` … `frame_0150.webp` (1-based, 4-digit, no gaps).
- **Folders:** `assets/frames/desktop/` and `assets/frames/mobile/` for `rider-hero`;
  `assets/frames/<name>/desktop/` and `assets/frames/<name>/mobile/` for other clips.
- **Framing:** full 9:16, no cropping. The source is already 1080x1920 so the scale is a straight resize.
- **Size budget:** the desktop set should total **under ~22 MB**. If it goes over, lower the desktop
  quality in steps of 5 (not below 55) in `tools/media.sh` and re-run. The mobile set has no hard budget but
  should stay well below the desktop set.

Commands (rider-hero run; the script builds these with the `frames` function):

```bash
SRC=assets/source/rider-hero.mp4
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 $SRC)   # 7.850000
FPS=$(awk -v d=$DUR -v n=150 'BEGIN{printf "%.6f", n/d}')                # 19.108280 = 150 / 7.85

# desktop 1080x1920, WebP q72
ffmpeg -y -v error -i $SRC -vf "fps=$FPS,scale=1080:1920:flags=lanczos" \
  -frames:v 150 -start_number 1 -c:v libwebp -quality 72 -compression_level 6 \
  assets/frames/desktop/frame_%04d.webp

# mobile 720x1280, WebP q70
ffmpeg -y -v error -i $SRC -vf "fps=$FPS,scale=720:1280:flags=lanczos" \
  -frames:v 150 -start_number 1 -c:v libwebp -quality 70 -compression_level 6 \
  assets/frames/mobile/frame_%04d.webp
```

Why these choices:
- `fps = 150 / duration` spreads the 150 frames evenly over the whole clip, so the first frame is the
  first video frame and the last frame is the clip's final moment.
- `-compression_level 6` is the slowest, smallest WebP setting; the frames are encoded once and read many times.
- Mobile is 720x1280 to save bandwidth on phones, where the canvas is also smaller.

Current output (rider-hero, verified after the run):

| Folder | Frames | Quality | Total size | Average per frame |
|---|---|---|---|---|
| `assets/frames/desktop/` | 150 (0001–0150) | q72 | 16,496,998 bytes (~16.5 MB) | ~110 KB |
| `assets/frames/mobile/` | 150 (0001–0150) | q70 | 9,260,546 bytes (~9.3 MB) | ~62 KB |

The desktop set is under the 22 MB budget, so the quality was not lowered.

## What the video commands do

Target specs:

| Output | Size | Encode |
|---|---|---|
| `<name>-1080.mp4` | 1080x1920 | H.264, CRF 23, preset veryfast, `-an`, yuv420p, faststart |
| `<name>-720.mp4` | 720x1280 | same |
| `<name>-1080.webm` / `-720.webm` | as above | VP9 `-crf 33 -b:v 0 -an` |
| `<name>-poster.webp` / `.jpg` | 1080x1920, first frame | WebP q80 / JPG `-q:v 3` |
| `<name>-crop.mp4` | 540x960, 3 s from t=2 s | H.264 CRF 26, `-an`, faststart |
| `frames/.../frame_NNNN.webp` | 1080x1920 (desktop, q72) and 720x1280 (mobile, q70), 150 frames | `fps=150/duration`, `-compression_level 6` (see above) |

Any source is first fitted to 9:16 for the MP4s and posters (scale to cover, then crop keeping the **top** area,
where the helmet is). For the 1080x1920 rider-hero source this is a no-op. The frame sequences are a plain
scale and do not crop.

## Photos (not yet supplied)

No photos exist yet. When they arrive, drop the original in `assets/source/` and run:

```bash
tools/media.sh photos assets/source/<photo>.jpg <name>
```

This writes `assets/img/photos/<name>-2400.webp/.jpg`, `-1600.webp/.jpg` and `-800.webp/.jpg`
(WebP q80, JPG `-q:v 3`). Widths are capped at the source width, so small photos are never upscaled.
The originals are not modified.

## Commands (the rider-hero run)

These are the exact commands in `tools/media.sh`. Run them via the script, not by hand.

```bash
SRC=assets/source/rider-hero.mp4
V=assets/video; C=assets/img/categories; ST=assets/img/stills
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 $SRC)   # 7.85 s
FPS=$(awk -v d=$DUR -v n=150 'BEGIN{printf "%.6f", n/d}')                # 19.108280

ffmpeg -y -i $SRC -vf "scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920:(iw-ow)/2:0" -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p -an -movflags +faststart $V/rider-hero-1080.mp4
ffmpeg -y -i $SRC -vf "scale=720:1280:force_original_aspect_ratio=increase:flags=lanczos,crop=720:1280:(iw-ow)/2:0" -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p -an -movflags +faststart $V/rider-hero-720.mp4
ffmpeg -y -i $SRC -vf "<1080 fit>" -c:v libvpx-vp9 -crf 33 -b:v 0 -row-mt 1 -cpu-used 4 -pix_fmt yuv420p -an $V/rider-hero-1080.webm
ffmpeg -y -i $SRC -vf "<720 fit>"  -c:v libvpx-vp9 -crf 33 -b:v 0 -row-mt 1 -cpu-used 4 -pix_fmt yuv420p -an $V/rider-hero-720.webm
ffmpeg -y -i $SRC -frames:v 1 -vf "<1080 fit>" -c:v libwebp -quality 80 $V/rider-hero-poster.webp
ffmpeg -y -i $SRC -frames:v 1 -vf "<1080 fit>" -q:v 3 $V/rider-hero-poster.jpg
ffmpeg -y -ss 2 -t 3 -i $SRC -vf "scale=540:960:flags=lanczos" -c:v libx264 -preset veryfast -crf 26 -pix_fmt yuv420p -an -movflags +faststart $V/rider-hero-crop.mp4

# frame sequences (see "Scroll-driven frame sequence" above)
ffmpeg -y -v error -i $SRC -vf "fps=$FPS,scale=1080:1920:flags=lanczos" -frames:v 150 -start_number 1 -c:v libwebp -quality 72 -compression_level 6 assets/frames/desktop/frame_%04d.webp
ffmpeg -y -v error -i $SRC -vf "fps=$FPS,scale=720:1280:flags=lanczos"  -frames:v 150 -start_number 1 -c:v libwebp -quality 70 -compression_level 6 assets/frames/mobile/frame_%04d.webp

# stills: ffmpeg -y -ss <t> -i $SRC -frames:v 1 -vf "crop=<w:h:x:y>,scale=<W>:-2:flags=lanczos" -c:v libwebp -quality 78 <out>.webp
#                                                  ... and  -q:v 3 <out>.jpg
#   helmets      t=5.0  crop 840:840:120:260    W=800
#   race-suits   t=2.0  crop 1080:1350:0:570    W=800
#   jackets      t=3.0  crop 1080:1350:0:300    W=800
#   gloves       t=6.0  crop 1080:1080:0:780    W=800
#   boots        t=0.5  crop 800:1000:140:920   W=800
#   protection   t=4.0  crop 1080:1350:0:300    W=800
#   accessories  t=7.0  crop 1080:1080:0:0      W=800
#   rider-1      t=1.0  crop 1080:1350:0:300    W=800 and W=1600
#   rider-2      t=3.5  crop 1080:1350:0:300    W=800 and W=1600
#   rider-3      t=6.5  crop 1080:1350:0:300    W=800 and W=1600
```

The `<1080 fit>` and `<720 fit>` filters are `scale=W:H:force_original_aspect_ratio=increase:flags=lanczos,crop=W:H:(iw-ow)/2:0`.

## Size budget

- The 720 H.264 MP4 should be under 3 MB. Current build (rider-hero, 7.85 s): `rider-hero-720.mp4` = 1.84 MB.
  If it grows over budget, raise `-crf` by 1 or 2 in `tools/media.sh` and re-run.
- The desktop frame sequence should total under ~22 MB (currently ~16.5 MB at q72). Lower the quality in steps
  of 5, not below 55, if it goes over.
