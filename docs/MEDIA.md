# Media pipeline

All video and still exports are produced by one re-runnable script: **`tools/media.sh`**.
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
   This writes `assets/video/<name>-1080.mp4`, `-720.mp4`, `-1080.webm`, `-720.webm`, `-scrub.mp4`,
   `-poster.webp/.jpg`, `-blurfill.mp4`, `-crop.mp4`, `assets/video/frames/<name>/f_001.webp` … `f_060.webp`,
   and the category stills and About stills (see below).
3. **Add an entry** to `videos` in `js/site.config.js` pointing at the new files.
4. **Assign it** in `videoSlots` in `js/site.config.js`.

Category stills (`assets/img/categories/*.webp`) and About stills (`assets/img/stills/rider-{1,2,3}-*`)
are written by the same run. They are **fixed to the rider-hero crop timestamps**, so for a new clip either
edit the `still` lines in `tools/media.sh` first or copy the old files aside, since they will be overwritten.

## What the video commands do

Target specs (from the Phase 2 brief):

| Output | Size | Encode |
|---|---|---|
| `<name>-1080.mp4` | 1080x1920 | H.264, CRF 23, preset veryfast, `-an`, yuv420p, faststart |
| `<name>-720.mp4` | 720x1280 | same |
| `<name>-1080.webm` / `-720.webm` | as above | VP9 `-crf 33 -b:v 0 -an` |
| `<name>-scrub.mp4` | 720x1280 | H.264, `-g 1 -keyint_min 1` (every frame a keyframe), CRF 26, `-an`, faststart |
| `<name>-poster.webp` / `.jpg` | 1080x1920, first frame | WebP q80 / JPG `-q:v 3` |
| `<name>-blurfill.mp4` | 480x854 | `gblur=sigma=30`, `eq=brightness=-0.15`, CRF 30, `-an`, faststart |
| `frames/<name>/f_NNN.webp` | 540x960, 60 frames | `fps=60/duration`, WebP q70 |
| `<name>-crop.mp4` | 540x960, 3 s from t=2 s | H.264 CRF 26, `-an`, faststart |

Any source is first fitted to 9:16 (scale to cover, then crop keeping the **top** area, where the helmet is).
For the 1080x1920 rider-hero source this is a no-op.

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
FPS=$(awk -v d=$DUR 'BEGIN{printf "%.6f", 60/d}')                        # 7.643312

ffmpeg -y -i $SRC -vf "scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920:(iw-ow)/2:0" -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p -an -movflags +faststart $V/rider-hero-1080.mp4
ffmpeg -y -i $SRC -vf "scale=720:1280:...same fit..." -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p -an -movflags +faststart $V/rider-hero-720.mp4
ffmpeg -y -i $SRC -vf "<1080 fit>" -c:v libvpx-vp9 -crf 33 -b:v 0 -row-mt 1 -cpu-used 4 -pix_fmt yuv420p -an $V/rider-hero-1080.webm
ffmpeg -y -i $SRC -vf "<720 fit>"  -c:v libvpx-vp9 -crf 33 -b:v 0 -row-mt 1 -cpu-used 4 -pix_fmt yuv420p -an $V/rider-hero-720.webm
ffmpeg -y -i $SRC -vf "<720 fit>" -c:v libx264 -preset veryfast -g 1 -keyint_min 1 -crf 26 -pix_fmt yuv420p -an -movflags +faststart $V/rider-hero-scrub.mp4
ffmpeg -y -i $SRC -frames:v 1 -vf "<1080 fit>" -c:v libwebp -quality 80 $V/rider-hero-poster.webp
ffmpeg -y -i $SRC -frames:v 1 -vf "<1080 fit>" -q:v 3 $V/rider-hero-poster.jpg
ffmpeg -y -i $SRC -vf "scale=480:854:force_original_aspect_ratio=increase:flags=lanczos,crop=480:854:(iw-ow)/2:0,gblur=sigma=30,eq=brightness=-0.15" -c:v libx264 -preset veryfast -crf 30 -pix_fmt yuv420p -an -movflags +faststart $V/rider-hero-blurfill.mp4
ffmpeg -y -i $SRC -vf "fps=$FPS,scale=540:960:flags=lanczos" -frames:v 60 -c:v libwebp -quality 70 $V/frames/rider-hero/f_%03d.webp
ffmpeg -y -ss 2 -t 3 -i $SRC -vf "scale=540:960:flags=lanczos" -c:v libx264 -preset veryfast -crf 26 -pix_fmt yuv420p -an -movflags +faststart $V/rider-hero-crop.mp4

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

The 720 H.264 MP4 should be under 3 MB. Current build (rider-hero, 7.85 s): `rider-hero-720.mp4` = 1.84 MB.
If it grows over budget, raise `-crf` by 1 or 2 in `tools/media.sh` and re-run.
The scrub MP4 is all-keyframe by design (`-g 1`), so it is much larger: 6.36 MB at CRF 26.
