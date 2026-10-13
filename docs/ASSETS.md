# Asset provenance

- `tools/assets/cat.png`: the kitten sprite used by the Python Sway helper
  (`tools/sway_companion.py:271`); `tests/test_companion.py:15` reads it from there and
  the test pins its sha256.
  Moved unchanged from `public/cat.png` at the React + Electron cutover. Adapted
  from the small black-cat image supplied by the user in this conversation. The
  white exterior was removed, preserving the eyes; no generative image call is
  needed at runtime. Rights for redistribution outside the user's own project
  have not been independently established. Replace it with an owned/licensed
  sprite before public distribution.
- `web/public/icon.svg` and its hashed copy `web/src/assets/icon.svg`: the
  application icon, copied unchanged from the former `public/icon.svg`; created
  for this implementation.
- Fonts in `web/src/assets/fonts/`, bundled locally and content-hashed by Vite;
  the app makes no remote font requests:
  - Inter Regular and Medium (`Inter-Regular.otf`, `Inter-Medium.otf`): The
    Inter Project Authors, SIL OFL 1.1 / Apache 2.0; source
    https://github.com/rsms/inter. Full notice: `experiments/ui-ab/licenses/Inter.txt`.
  - TeX Gyre Termes Regular and Italic (`TeXGyreTermes-Regular.otf`,
    `TeXGyreTermes-Italic.otf`): GUST e-foundry, GUST Font License. Full notice:
    `experiments/ui-ab/licenses/TeXGyre.txt`. Used for document titles.
- The application layout, styles, line icons (`web/src/ui/Icon.tsx`) and the
  WebGL terrain were created for this implementation (variant B of
  `experiments/ui-ab`). No third-party icon set, image or wallpaper is used.
- `qa/*.png` are screenshots of the actual implemented interface using explicitly synthetic example data. They are not evidence of current user activity or deployed agents.
