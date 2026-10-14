# Dashboard reference and measurements

The user's later review explicitly calls for Current focus, What can I do next?,
and Tasks with colored dots, and a kitten outside the application. These match
`reference-images/Noema Productivity Dashboard with Cat Companion.png`. The
working assumption is its blue dashboard throughout, as stated during review.
The original sage `desktop-target.png` remains preserved as the earlier target.

Blue reference: 1672 × 941. App bounds approximately x=107..1265, y=62..878:
**1158 × 816**. Exclude wallpaper, traffic lights and native window borders.

- Sidebar 190 px; main inset 54 px; reading column 866 px maximum.
- Top bar 64 px. Greeting approximately 37 px, subtitle 18 px. Bundled Inter is
  a licensed approximation; exact reference font is not known.
- Focus starts near y=239, height 78 px. Next-actions card near y=329, height
  158 px. Tasks near y=499, height 208 px before additional saved tasks.
- Three next-action rows; four fixture task rows. Task priorities red/yellow/
  blue/gray for High/Normal/Low/Automatic. These have accessible text labels.
- Charcoal blue background #101419; text #e9edf1; muted #939daa; blue #83b5fa.
  Surfaces #14191f, border #2b323b, radius 16 px. Static seeded SVG particle
  strands; original artwork, approximate curves rather than copied wallpaper.
- Quick capture 61 px, 24 px below Tasks. Tasks heading includes a small Add
  control. Adding a task moves it to the visible task list and keeps the pin.
- Add task is an on-demand 440 px panel on wide screens, modal below 1380 px.
  A single focused multiline input; optional Details; Enter inserts a newline.
- Phone uses bottom navigation, 20 px inset, 29 px greeting and modal task entry.
  Tablet uses a 176 px sidebar. No permanent task-entry panel.
- Transparent kitten is a separate 96 px desktop window, with on-demand controls
  in a separate 300 × 360 px window. No kitten is rendered inside the dashboard.

Estimates and invented dates are omitted. Example tasks are demo fixtures, not the
reference image's personal task data. Font rasterization, icons and particle curves
remain approximate. Screenshot validation establishes implementation evidence,
not user visual acceptance.
