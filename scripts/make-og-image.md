# Regenerating the social share image (`public/og-image.png`, 1200×630)

The card is authored as HTML (`scripts/og-image.html`) so it uses the real brand — the
same navy, accent blue, football mark, and team logos as the app. It is rendered to a PNG
rather than committed by hand.

Recipe:

1. Serve the repo root so the HTML can load `/public/logos/*`:
   ```bash
   python3 -m http.server 4177
   ```
2. Open `http://localhost:4177/scripts/og-image.html` in a browser whose **viewport** is
   exactly 1200×630 (the card is a fixed 1200×630 box) and screenshot it.
3. Normalise to PNG at exact dimensions:
   ```bash
   sips -s format png <screenshot>.jpg --out public/og-image.png
   ```
4. Confirm `sips -g pixelWidth -g pixelHeight public/og-image.png` reports 1200×630.

`index.html` points `og:image` / `twitter:image` at the absolute Netlify URL so the card
resolves when the page is shared from either deploy target.
