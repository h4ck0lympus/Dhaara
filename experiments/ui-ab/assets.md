# Asset inventory

- `frontend/public/assets/cat.png`: byte-for-byte copy of the supplied approved
  `cat-reference.png`. User-authorized use for this experiment; no independent
  redistribution license supplied. Original is not modified.
- Inter Regular/Medium: local distribution, Inter Project Authors, SIL OFL 1.1 /
  Apache 2.0; source https://github.com/rsms/inter. Full notices in `licenses/Inter.txt`.
- TeX Gyre Termes Regular/Italic: local distribution, GUST Font License;
  full notice in `licenses/TeXGyre.txt`. Used for document titles, not dashboard UI.
- Liberation Serif Regular: local distribution, Google/Red Hat, SIL OFL 1.1;
  source https://github.com/liberationfonts. Full notice in `licenses/Liberation.txt`.
- Particle ribbon, action-card contours, note diagram and line icons: original
  SVG/code drawn for this experiment, including `chevron.svg` for consistent selects. No reference wallpaper or third-party icon set.
- `frontend/public/assets/grain.svg`: original static, seeded SVG grain tile.

## Transparent kitten refinement

`frontend/public/assets/cat-transparent.png` is a new transparent derivative made
with the built-in **imagegen** tool, using the supplied kitten as the edit target.
The original `cat.png` is preserved byte-for-byte. The derivative has an RGBA alpha
range of 0–255; CSS adds no rectangular container. The silhouette and small details
are an illustrated interpretation rather than a deterministic pixel cutout.

Full generation prompt:

> Use case: background-extraction. Edit target: supplied small black cartoon kitten. Remove the entire off-white background and the pink baseline/footer, replacing only those background areas with true alpha transparency. Preserve the same kitten identity, seated pose, curled raised tail, pointed ears, big round cream eyes, cream whiskers, tiny cream nose/mouth, black charcoal fur, and flat hand-drawn illustration style. A single isolated kitten, centered, tightly framed with a small transparent margin, entire ears, whiskers, feet and tail visible. Clean crisp silhouette suitable for a 72px UI companion on charcoal. Do not add a container, tile, glow, scene, text, additional objects, or checkerboard pattern. Preserve white eye and whisker details; those are not background. Output a transparent PNG cutout.

All assets are bundled and identical in A/B. No runtime external asset requests.
