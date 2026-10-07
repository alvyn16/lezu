# UI design contract: first prototype

## Objective

Make the Home and game-details screens follow the user's reference pictures in layout, density, typography, icons, and game-dependent color. This is the first capability to build. Library discovery and launching are separate later work.

## References

- Home: [home.png](references/home.png), copied from the user's `IMG_6473.PNG`.
- Details: [details.png](references/details.png), copied from the user's `IMG_6474.PNG`.

The reference application occupies roughly 980 × 760 pixels in the supplied images. Compare the application area, excluding the desktop wallpaper. Measurements below are initial estimates to be verified against rendered previews, not claims about the original application's source dimensions.

## Shared shell

- Sidebar roughly 204 px at the reference window size. Compact rows, small monochrome navigation icons, genuine provider marks, and counts aligned to the right.
- White selected navigation row with dark text and icon. Other rows have transparent backgrounds.
- Navigation order: Home; Library heading; All Games; Installed; Stores heading; Steam; Epic Games; GOG; Activity heading; Downloads.
- Keep the Activity position. Downloads is unavailable in the first prototype, with an explanation when activated. Do not imply the application already downloads games.
- Search pill in the upper-right corner of the content pane. Left-aligned magnifier and input text.
- Home label or Back and game name in the upper-left of the content pane.
- Settings accessed through a small sidebar control; no extra toolbar of large buttons.
- Black Windows title bar in the desktop application, with functional minimize, maximize/restore, close, system dragging, and snapping. Do not reproduce macOS traffic-light window controls.

## Home

- Cinematic artwork fills the top of the content pane and fades into its background color.
- Continue Playing label, game logo/title, compact white Play pill, and circular information button occupy the reference's hero region.
- Ready to Play heading below the hero, with See All at the right.
- A single horizontal shelf of rounded portrait covers, not a wrapping Home grid. At the reference size, covers are approximately 114 × 174 px.
- Titles and source/storage captions sit below covers. Long titles elide, with their full names accessible.
- Hover reveals a small Play control. Keyboard focus must offer the same action and reveal offscreen cards.
- Stores section contains three equal translucent cards with a provider icon, name, short description, and small switch in the upper-right corner.

## Details

- Preserve the sidebar and top search. Back stays at the upper-left beside the game name.
- Large artwork and game logo dominate the top. Short identifying metadata appears above the action row.
- Action row: white Play pill, circular folder control, circular More control.
- Below it, a thin divider and compact statistics columns with subtle vertical separators. Show only available facts. Unknown values must not be fabricated.
- About label in a narrow left column, with a larger readable description to its right. Tags/genres sit below it.
- Screenshots follow in a horizontal strip. Keep additional organization tools out of this primary reference layout.

## Typography and icons

- Use one sans-serif family throughout; prototype fallback stack: `Segoe UI Variable Text`, `Segoe UI`, system sans-serif.
- Starting logical sizes: navigation/body 13 px; small captions 11 px; section headings 18 px; stats values 18 px; description 22 px. Validate optical size against the reference crop before freezing tokens.
- Use a consistent weight hierarchy: regular body, semibold selected rows and headings. Avoid all-caps action labels; uppercase only small section metadata where the reference does so.
- Navigation icons 16 px; small caption icons 12 px; provider card icons about 36–40 px. SVG strokes should have consistent weight. No Unicode symbols used as primary UI icons.
- Keep measured design tokens in one place. Components consume them rather than introducing arbitrary local font sizes and spacing.

## Color

- The active/featured game's artwork determines the page tint, sidebar tint, translucent controls, and fade.
- Home uses the featured game's theme; Details uses the opened game's theme.
- At least two distinctly colored fixture games must demonstrate the change across the whole shell.
- Artwork has contrast overlays where text is placed. Validate normal text contrast at 4.5:1 and large text at 3:1.
- Missing artwork uses a neutral fallback. Do not use one permanent purple or red background for every game.

## Responsive rules

- Layout dimensions use logical pixels; display density is handled by the platform, not multiplied into page layout twice.
- Baseline visual comparison at 980 × 760, followed by 1024 × 768, 1366 × 768, 1920 × 1080, and 3840 × 2160.
- Check 100%, 125%, 150%, and 200% display scale. Repeat checks at 800 × 600 logical size for a compact window.
- Sidebar and search must remain usable as the content narrows. Home shelf scrolls horizontally; store cards wrap when three cards cannot fit.
- Detail stats wrap into fewer columns. About moves to a single column when the side label would squeeze the text.
- Vertical scrolling reveals content below the viewport. No page-width overflow, overlapping headings, clipped controls, distorted covers, or blurred upscaled icons.

## Interaction and states

- Prototype navigation, search, filtering, game selection, theme changes, and store switches operate on fixture data.
- Play and folder actions explain that native integrations are pending; they must not claim a game was launched.
- Empty search results, unavailable artwork, disabled sources, loading, and long text have explicit states.
- Every control is keyboard-accessible and named for assistive technology. Focus remains on a store switch after toggling it.
- Animations are restrained and respect reduced-motion preferences.

## Technical boundary

The first prototype uses plain HTML, CSS, and JavaScript with no framework dependency. This lets the layout be reviewed before choosing a Windows desktop host. Selecting and implementing that host is a later explicit architecture decision. No backend or native scanning capability is promised by a browser preview.

Planned preview command after implementation:

```powershell
python -m http.server 4173 --bind 127.0.0.1 --directory ui
```

Planned focused fixture/state checks after implementation:

```powershell
node --test tests/*.test.mjs
```

## Completion criterion

Deliver a working local preview plus Home/details screenshots at the reference size and a larger Windows size, with a concise comparison of remaining differences. Obtain the user's visual approval before integrating real scanners and launchers.
