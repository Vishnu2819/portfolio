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

## Deploy for free
Any static host works, and there's nothing to build.

- **GitHub Pages:** push this folder to a repo, then go to Settings → Pages → Deploy from branch → `main` / root.
- **Netlify:** drag the folder onto https://app.netlify.com/drop.
- **Cloudflare Pages / Vercel:** import the repo, leave the build command empty, and set the output directory to `/`.

## Editing content
Text lives in `index.html`. The 3D details (tooltip text, skill list) are near the top of each `build*` function in `scene.js`. If you rename a skill category, keep the `data-cat` values in the HTML chips in sync with the `SKILLS` keys.
