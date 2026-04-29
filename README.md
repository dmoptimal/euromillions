# EuroMillions PWA

A dead-simple Progressive Web App that shows the latest EuroMillions results. Designed to be saved to an iPhone home screen and tapped once to check the numbers.

## Architecture

- **Static frontend**: a single `index.html` (HTML/CSS/JS inline) plus `manifest.json` and `sw.js` for PWA / offline behaviour.
- **Serverless proxy**: `api/draws.js` (Vercel function) fetches from `https://euromillions.api.pedromealha.dev/v1/draws` and adds a `cache_until` ISO timestamp.
- **Three-layer caching**:
  1. Vercel Edge CDN (`s-maxage`) caches the API response until the next draw.
  2. Client-side `localStorage` caches parsed draws for instant open.
  3. `cache_until` keeps both layers expiring at the same moment.

## Draw schedule

- Draws are every Tuesday and Friday at ~20:15 UTC.
- Results are reliably available by ~20:30 UTC.
- Both caches expire on the next Tuesday or Friday at 20:30 UTC.

## Draw-window warning

While the app is open, it watches for the draw window (Tue/Fri 20:15-20:45 UTC).
If the cached "latest draw" is not from today, it shows an amber banner:

> Tonight's draw is happening now -- these results may not be the latest yet.

The moment the cache expires, the app auto-refreshes in place; the user does not have to close and reopen anything. Outside the draw window the watcher disarms itself and schedules a one-shot timer to wake up at the start of the next window.

## File layout

```
euromillions/
  index.html        Main PWA page (HTML/CSS/JS inline, includes draw-window watcher)
  manifest.json     PWA manifest
  sw.js             Service worker (app shell only)
  vercel.json       Vercel headers config
  icon-192.png      PWA icon (192x192)
  icon-512.png      PWA icon (512x512)
  api/
    draws.js        Vercel serverless proxy
  README.md         This file
```

## Deploying to Vercel

1. Install the Vercel CLI if you do not have it: `npm i -g vercel`.
2. From inside this `euromillions/` folder, run `vercel`. Accept the defaults; Vercel auto-detects the static + serverless setup.
3. For production: `vercel --prod`.
4. Open the deployed URL on the iPhone in Safari, tap the Share icon, then `Add to Home Screen`.

## Generating the icons

The two PNG icons are not committed -- generate or replace them with whatever artwork you want:

```bash
# Quick placeholder icons via ImageMagick
magick -size 192x192 xc:'#0d1117' \
  -fill '#ffd700' -gravity center -pointsize 120 -annotate 0 '*' icon-192.png
magick -size 512x512 xc:'#0d1117' \
  -fill '#ffd700' -gravity center -pointsize 320 -annotate 0 '*' icon-512.png
```

Or drop in a designed pair at the same filenames.

## Local development

```bash
npx vercel dev
```

This boots the static site and the `/api/draws` function together on `http://localhost:3000`.
