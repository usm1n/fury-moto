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

## Two frame sequences (canvas background)

The site background is a scroll-driven canvas that draws WebP frame sequences. There are two sequences,
one per orientation of the viewport:

| Sequence | Source | Frame folders | Sizes (quality) | Frames |
|---|---|---|---|---|
| **9:16** (portrait) | `assets/source/rider-hero.mp4` (1080x1920, 7.85 s, 24 fps) | `assets/frames/9x16/1080/` and `assets/frames/9x16/720/` | 1080x1920 (q72), 720x1280 (q70) | 188 (every frame) |
| **16:9** (landscape) | `assets/source/rider-hero-16x9.mp4` (1920x1080, 10.0 s, 24 fps) | `assets/frames/16x9/1920/` and `assets/frames/16x9/1280/` | 1920x1080 (q72), 1280x720 (q70) | 240 (every frame) |

Which set the site uses is decided by the viewport: a **landscape viewport uses the 16:9 sequence, a portrait
viewport uses the 9:16 sequence**. The small set (1280/720 or 720/1280) is for smaller screens or slow
connections; the large set is for desktop-class screens.

Both sequences use the same rules:

- **Every frame:** by default the pipeline extracts **every frame** of the clip (24 fps sources → 188 and 240
  frames). That gives the smoothest scroll animation; the site also cross-fades between neighbouring frames.
  The canvas plays page top = frame 0001, page bottom = the last frame.
- **Fewer frames (optional):** `FRAME_COUNT=<n> bash tools/media.sh <name>` spreads n frames evenly over the whole
  clip instead (first = first video frame, last = final moment). Use it only to cut download size.
- **Naming:** `frame_0001.webp` … `frame_NNNN.webp` (1-based, 4-digit, no gaps). Every frame is a standalone
  image, so the canvas never seeks a video.
- **Framing:** no cropping. The clip is only scaled to the target size (lanczos).
- **Verification:** the script fails if a folder does not contain exactly the expected number of files.
- **Config:** `count` in `config.backdrop.sequences.landscape|portrait` must equal the number of frames.

### Sharpness

The large sets are only as sharp as their source. The 1080-wide (9:16) and 1920-wide (16:9) frames are straight
scales of the current sources, so a sharper desktop result needs a higher-resolution source in `assets/source/`
(for example a 2160 or 3840 pixel-wide clip), re-run through the pipeline.

### Size budget

- The large set of each sequence should total **under ~30 MB**. If it goes over, lower that set's quality in
  steps of 5 (not below 55) in `tools/media.sh`, or use a lower `FRAME_COUNT`, and re-run.
- The small set has no hard budget but should stay well below its large set.
- Only one set is downloaded per visitor (the one matching their screen), progressively.

### Commands

```bash
bash tools/media.sh rider-hero         # 9:16 set (and the other rider-hero outputs)
bash tools/media.sh rider-hero-16x9    # 16:9 set (landscape clips only get frame sequences)
```

The frame part of those runs, by hand (every frame, no fps filter):

```bash
# 9:16
ffmpeg -y -v error -i assets/source/rider-hero.mp4 -vf "scale=1080:1920:flags=lanczos" -fps_mode passthrough \
  -start_number 1 -c:v libwebp -quality 72 -compression_level 6 assets/frames/9x16/1080/frame_%04d.webp
ffmpeg -y -v error -i assets/source/rider-hero.mp4 -vf "scale=720:1280:flags=lanczos" -fps_mode passthrough \
  -start_number 1 -c:v libwebp -quality 70 -compression_level 6 assets/frames/9x16/720/frame_%04d.webp

# 16:9
ffmpeg -y -v error -i assets/source/rider-hero-16x9.mp4 -vf "scale=1920:1080:flags=lanczos" -fps_mode passthrough \
  -start_number 1 -c:v libwebp -quality 72 -compression_level 6 assets/frames/16x9/1920/frame_%04d.webp
ffmpeg -y -v error -i assets/source/rider-hero-16x9.mp4 -vf "scale=1280:720:flags=lanczos" -fps_mode passthrough \
  -start_number 1 -c:v libwebp -quality 70 -compression_level 6 assets/frames/16x9/1280/frame_%04d.webp
```

(Delete the old `frame_*.webp` in a folder first if the new clip has fewer frames; the script does this for you.)

### Output of the last run

| Folder | Frames | Quality | Total size |
|---|---|---|---|
| `assets/frames/9x16/1080/` | 188 (0001–0188) | q72 | ~21 MB |
| `assets/frames/9x16/720/` | 188 (0001–0188) | q70 | ~12 MB |
| `assets/frames/16x9/1920/` | 240 (0001–0240) | q72 | ~14 MB |
| `assets/frames/16x9/1280/` | 240 (0001–0240) | q70 | ~8.3 MB |

### Why these choices

- Every source frame = no invented motion and the most continuous scrub; the canvas cross-fade covers the gaps.
- `-compression_level 6` is the slowest, smallest WebP setting; the frames are encoded once and read many times.
- The small set is there to save bandwidth on phones and slow connections.

## Adding a new clip

1. **Drop the file** in `assets/source/<name>.mp4` (the original stays untouched). Orientation is detected
   from the file: taller than wide is a portrait clip, wider than tall is a landscape clip.
2. **Run the pipeline** from the repo root:
   ```bash
   bash tools/media.sh <name>
   ```
   For a portrait clip this writes the 9:16 frame sequence, the MP4/WebM product loops, poster, 3 s crop and
   stills. For a landscape clip it writes only the 16:9 frame sequence. The frame count is printed (default: every frame); set
   `FRAME_COUNT=<n>` to use fewer.
   Frame folders:
   - portrait: `assets/frames/9x16/1080/` and `assets/frames/9x16/720/` for `rider-hero`;
     `assets/frames/<name>/9x16/1080/` and `assets/frames/<name>/9x16/720/` for any other clip
   - landscape: `assets/frames/16x9/1920/` and `assets/frames/16x9/1280/` for `rider-hero-16x9`;
     `assets/frames/<name>/16x9/1920/` and `assets/frames/<name>/16x9/1280/` for any other clip
3. **Set the backdrop** in `js/site.config.js`, under `backdrop.sequences.landscape` or
   `backdrop.sequences.portrait` (whichever matches the clip's orientation). Each entry takes `path`,
   `pathSmall`, `count` (and `focalPoint`). The current values are:
   ```js
   backdrop: { sequences: {
     landscape: { path: "assets/frames/16x9/1920/frame_%04d.webp", pathSmall: "assets/frames/16x9/1280/frame_%04d.webp", count: 240 },
     portrait:  { path: "assets/frames/9x16/1080/frame_%04d.webp", pathSmall: "assets/frames/9x16/720/frame_%04d.webp", count: 188 },
   } }
   ```
   For a new clip, point `path` and `pathSmall` at its folders and set `count` to the number of frames it produced.
4. **Add an entry** to `videos` in `js/site.config.js` pointing at the new files.
5. **Assign it** in `videoSlots` in `js/site.config.js`.

Category stills (`assets/img/categories/*.webp`) and About stills (`assets/img/stills/rider-{1,2,3}-*`)
are written by the same run for portrait clips. They are **fixed to the rider-hero crop timestamps**, so for a
new clip either edit the `still` lines in `tools/media.sh` first or copy the old files aside, since they will
be overwritten.

## Video and still outputs (portrait clips)

Target specs:

| Output | Size | Encode |
|---|---|---|
| `<name>-1080.mp4` | 1080x1920 | H.264, CRF 23, preset veryfast, `-an`, yuv420p, faststart |
| `<name>-720.mp4` | 720x1280 | same |
| `<name>-1080.webm` / `-720.webm` | as above | VP9 `-crf 33 -b:v 0 -an` |
| `<name>-poster.webp` / `.jpg` | 1080x1920, first frame | WebP q80 / JPG `-q:v 3` |
| `<name>-crop.mp4` | 540x960, 3 s from t=2 s | H.264 CRF 26, `-an`, faststart |
| category and About stills | 800 wide (1600 for About) | WebP q78 / JPG `-q:v 3` |

Any portrait source is fitted to 9:16 for the MP4s and posters (scale to cover, then crop keeping the **top**
area, where the helmet is). For the 1080x1920 rider-hero source this is a no-op.

Commands for the still outputs of rider-hero (the script builds these):

```bash
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

## Photos (not yet supplied)

No photos exist yet. When they arrive, drop the original in `assets/source/` and run:

```bash
tools/media.sh photos assets/source/<photo>.jpg <name>
```

This writes `assets/img/photos/<name>-2400.webp/.jpg`, `-1600.webp/.jpg` and `-800.webp/.jpg`
(WebP q80, JPG `-q:v 3`). Widths are capped at the source width, so small photos are never upscaled.
The originals are not modified.

## Size budget (video)

- The 720 H.264 MP4 should be under 3 MB. Current build (rider-hero, 7.85 s): `rider-hero-720.mp4` = 1.84 MB.
  If it grows over budget, raise `-crf` by 1 or 2 in `tools/media.sh` and re-run.
