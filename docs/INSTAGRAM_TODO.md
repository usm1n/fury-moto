# Instagram media: what to download

The site already shows these posts as **official Instagram embeds**: the home "On Instagram" strip, the Gear Doctor page, and the guides based on a reel. To also use them as **images and video across the site** (category tiles, About page, guide covers, reels in the video pipeline), drop the original files into the folders below. Then ask Claude to "process the Instagram files".

The browser tool can't download Instagram media, so this step is manual.

## Easiest way: Instagram's own export
Instagram app → **Settings → Accounts Center → Your information and permissions → Download your information** → choose the account → **media only**, format **JSON**, quality **High**. Do this for both accounts. Unzip each export into its folder:

- `assets/instagram/fury__moto/`
- `assets/instagram/fury_the_gear_doc/`

The export already contains dates and captions, so loose file names are fine.

## Or save posts one by one
Save each post's video (or every image of a carousel), and the profile picture, into the folder for its account. Name them like `<account>_<YYYY-MM-DD>_<shortcode>_<slide>.<ext>` if you can, e.g. `fury_the_gear_doc_2026-11-09_DfhP8xDth6A_1.mp4`.

## Posts the site uses

### @fury__moto
| Post | Notes |
|---|---|
| https://www.instagram.com/reel/Dfzk7X9x-ll/ | riding |
| https://www.instagram.com/reel/DfrdLg9R37w/ | R6 Turbo vs GSX-R1000 test ride |
| https://www.instagram.com/reel/DfUlgkcRfGo/ | throttle timing in a corner (riding skills) |
| https://www.instagram.com/reel/DfR5GvAx_fx/ | POV ride |
| https://www.instagram.com/reel/DfPbQZmRLe9/ | night POV |
| https://www.instagram.com/p/DfHVRRaEQuC/ | rider on bike |
| https://www.instagram.com/reel/Dey98XiIHPE/ | "Attempt 2" |

Left out on purpose (collabs with other creators; the brief says own posts only): `p/DTyGbAXE-Gb`, `reel/Df7itwqxl80`.
The account has 363 posts and only the latest grid was reviewed. Add more to `config.instagramPosts` any time.

### @fury_the_gear_doc (all 7 reels)
| Date | Post | Topic → guide |
|---|---|---|
| 2026-11-09 | https://www.instagram.com/reel/DfhP8xDth6A/ | DOT vs FIM → `dot-vs-fim` |
| 2026-11-05 | https://www.instagram.com/reel/DfXGz1ANrQI/ | Cowhide vs kangaroo → `kangaroo-vs-cowhide` |
| 2026-10-18 | https://www.instagram.com/reel/Deo2hpMNL9h/ | Seam strength → `seam-strength` |
| 2026-10-16 | https://www.instagram.com/reel/Dejg9DNth0X/ | CE Level 2 armour → `ce-level-2-armour` |
| 2026-10-15 | https://www.instagram.com/reel/Deg4RHotNXf/ | Riding jacket for 1 lakh |
| 2026-10-13 | https://www.instagram.com/reel/DebWdnaNZ-S/ | Hard-knuckle gloves → `hard-knuckle-gloves` |
| 2026-10-12 | https://www.instagram.com/reel/DeY06pItxph/ | Certified jacket vs armour |

Years after the first post were assumed to be 2026. The export will confirm them.

## What happens after you add the files
1. Claude builds `assets/instagram/manifest.json` (account, file, type, size, date, post URL, caption, tags: helmet / suit / gloves / boots / bike / garage / riding / portrait / guide).
2. Photos get the WebP/JPG sizes from `tools/media.sh photos`. Reels get web MP4s and posters.
3. `config.instagramPosts[].image` is filled in, so the strip switches from embeds to fast image tiles. Category tiles, the About photo and guide covers use the matching real photos instead of video stills.
