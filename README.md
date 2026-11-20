# ClipKit

Free tools for clippers (earnings calculator, hook & caption generator, pre-post check, posting times)
plus **ClipForge Pro**, a browser clip maker behind a $3/month Whop membership.

Hosted on Cloudflare Pages (free plan, commercial use allowed).

## Layout
- `public/` – the website (Cloudflare "Build output directory")
  - `index.html` – ClipKit toolkit (free)
  - `forge/` – ClipForge Pro (members only)
  - `assets/` – caption models and engine, split into <25 MB parts
- `functions/` – paywall: `/login`, `/callback`, `/logout`, and the `/forge/` guard
- `lib/auth.js` – shared sign-in helpers

## Cloudflare Pages settings
- Framework preset: **None**
- Build command: *(leave empty)*
- Build output directory: `public`

## Environment variables (Settings → Variables and Secrets)
| Name | What |
|---|---|
| `WHOP_CLIENT_ID` | Your Whop app id (`app_...`) |
| `WHOP_API_KEY` | Whop API key for the ClipKit business (secret) |
| `SESSION_SECRET` | Any long random string (secret) |
| `WHOP_CLIENT_SECRET` | Optional, if your Whop app shows one (secret) |

In the Whop app's OAuth settings, add the redirect URI `https://YOUR-SITE.pages.dev/callback`.
