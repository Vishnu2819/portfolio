# Vishnu Vulli: portfolio

An interactive, minimalist portfolio. A single ink line threads through the career story (Clemson → Capital One → JPMorgan Chase), and each chapter gets its own small Three.js sculpture.

- **No build step.** Plain HTML, CSS and JS. Three.js (r170) loads from the jsDelivr CDN through an import map.
- **Small.** Our own code is about 20 KB gzipped, with no images, models or textures.
- **Resilient.** If WebGL or the CDN isn't available, the page falls back to a clean, readable résumé layout.
- **Accessible.** All content is real HTML. The site respects `prefers-reduced-motion`, supports keyboard shortcuts (`J` / `K` to move between chapters), and follows the system light/dark setting (with a manual toggle).

## Files
| File | Purpose |
|---|---|
| `index.html` | All content, meta tags and the import map |
| `style.css` | Theme tokens (light/dark), layout, responsive rules and fallback styles |
| `ui.js` | Scroll → chapter progress, chapter rail, reveal animations, theme toggle, skill filter, cursor, loader |
| `scene.js` | Three.js scene: camera path, journey line, six chapter sculptures, hover tooltips, drag-to-spin |
| `resume.pdf` | The downloadable résumé |

## Run locally
```bash
cd portfolio
python3 -m http.server 8080   # open http://localhost:8080
```
(ES modules need a server; opening the file directly with `file://` won't work.)

## Deploy
Live at **https://vishnuvulli.netlify.app**. Netlify is linked to this repo, so every push to `main` deploys automatically (the settings are in `netlify.toml`, with no build step).

Other free static hosts work too, since there's nothing to build: GitHub Pages, Cloudflare Pages or Vercel (leave the build command empty and publish the repo root).

## Editing content
Text lives in `index.html`. The 3D details (tooltip text, skill list) are near the top of each `build*` function in `scene.js`. If you rename a skill category, keep the `data-cat` values in the HTML chips in sync with the `SKILLS` keys.
