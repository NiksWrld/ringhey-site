# Ringhey website

Static site (HTML/CSS, minimal JS) for Ringhey, custom AI voice agents.

## Custom domain (later)
When ringhey.com is registered:
1. Add a file `CNAME` containing `ringhey.com` (not added yet on purpose).
2. DNS: apex A records to GitHub Pages (185.199.108.153, .109.153, .110.153, .111.153), `www` CNAME to `nikswrld.github.io`.
3. Repo Settings → Pages → Custom domain `ringhey.com`, enable Enforce HTTPS.

Client portal later at `portal.ringhey.com` (CNAME per VoiceAIPortal instructions).

## Placeholders to replace
- hello@ringhey.com (mailto)
- https://calendly.com/ringhey
- impressum.html, datenschutz.html

## Brand assets
- `assets/ringhey-logo-original.png` — unmodified source logo from Jan
- `assets/ringhey-logo.png` / `.webp` / `@2x.png` — transparent wordmark for the site
- Favicons are cropped from the speech-bubble icon (`favicon-32.png`, `favicon-180.png`, `favicon-512.png`, `apple-touch-icon.png`)
