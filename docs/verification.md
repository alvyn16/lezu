# UI prototype verification

Verified locally on 2026-10-07 using Node 22.18.0, Python 3.14, Chrome, and Playwright CLI 0.1.19. Application code has no third-party package dependency.

## Results

| Check | Result |
|---|---|
| State, filtering, counts, theme selection, text escaping, palette contrast | 12 Node tests passed. |
| Home browser flow | Search focus, empty search, disabled store filtering, switch focus, and keyboard shelf reveal passed. |
| Details browser flow | Open/Back focus, search from Details, whole-shell theme changes, and Feature on Home passed. |
| Edge browser flow | Missing art, disabled Play, all stores disabled, Reset, See All focus, Escape dismissal, screenshot dialog, and forced cover failure recovery passed. No unnamed buttons. |
| Mouse-wheel shelf browsing | Real wheel events moved Home and Library shelves in both directions without moving the page. Horizontal gestures, line/page wheel units, Ctrl+wheel preservation, end-of-shelf page scrolling, scrolling outside the shelf, filtering/rerendering, and keyboard reveal passed. A non-overflowing shelf releases the wheel. The native shelf scrollbar is hidden. |
| Resolution / density | 56 Home/Details layout checks passed: 7 sizes × 4 densities × 2 screens. No page-width overflow, header/search overlap, failed assets, or runtime errors in these normal scenarios. |
| Source review | Checked correctness, simplicity, module separation, fixture text escaping, and bounded local rendering. No old project code, remote integrations, or native action execution. |
| Syntax and whitespace | Module syntax checks and `git diff --check` passed. |

Sizes: 800×600, 980×760, 1024×768, 1366×768, 1920×1080, 3840×2160, and an additional 320×740 compact check. Densities: 1, 1.25, 1.5, and 2 device pixels per logical pixel. Resolution contexts use reduced motion.

These are browser density checks, not a claim that a native Windows executable has passed monitor DPI transitions, snapping, or title-bar tests. That host does not exist yet. Palette tests cover normal muted text against all fixture page/sidebar colors; full screen-reader and image-by-image WCAG certification was not performed.

## Reference comparison

| Element | Reference target and current implementation |
|---|---|
| Sidebar | 204 px at the 980 px reference width, compact 26 px flat rows, white selection, correct navigation order and right-aligned counts. |
| Search | 236 px pill at the upper-right, compact SVG magnifier, consistent left-aligned text. |
| Home hero | Matching Alan Wake II key art, centered 300 px logo, eyebrow at the left, white 106 px Play pill and circular info control. |
| Home shelf | Following the user's size revision: 168×252 px portrait covers at reference size, growing to 216 px wide on larger windows. Single horizontal shelf, rounded artwork, 14 px titles and 12 px captions, hover and keyboard Play. |
| Stores | Three equal translucent cards at reference size, 38 px marks, switches at the upper-right. Wraps for compact windows. |
| Details | Back/name and search in the same shell; Sifu hero/logo, Play/folder/More row; six stat columns; About label and 22 px description; horizontal screenshots below. |
| Type | Segoe UI throughout: 13 px navigation, 11 px captions, 18 px headings/stats, 22 px description. SVG navigation icons are 16 px. |
| Colors | Crimson Alan Wake, orange-red Sifu, teal Witcher, and distinct other palettes continue throughout the shell. No fixed purple sidebar or black content cutoff. |

Corrections made during rendered review: reduced sidebar spacing; made provider SVGs visible; recovered the Ready to Play heading from the hero overlay; fixed shelf scroll padding; enlarged the Sifu logo; added the rating position with an honest unavailable value; fixed the 320 px grid overflow; preserved See All focus; hid failed artwork; improved the 4K Sifu artwork crop.

## Intentional differences and limits

- Native Windows title bar will replace the reference's macOS controls in the later host. This preview does not draw pretend native buttons.
- Sample games/counts differ from the supplied images. Artwork on the shelf comes from independent local/official sources. Alan Wake's landscape key art is cropped for its sample cover.
- Segoe UI is used as the Windows system font instead of the reference's macOS font.
- Graphics translation, installation size, and review rating are not fabricated. The reference's D3DMetal label is not appropriate for the Windows target.
- A small sample-library notice explains the fixture boundary. No Couch mode, extra toolbar, or organization panel was added.
- Palettes are curated per game; automatic extraction is pending. In-session choices reset on reload; native browser history routing is not implemented.

## Saved renders

The larger Ready to Play revision passed the Home interaction checks and all 56 resolution/density checks again. Its refreshed screenshots are the current Home renders. Browser preview was refreshed for the user. No JavaScript or native behavior changed in this CSS revision.

Local QA PNGs are in `docs/screenshots/` (excluded from Git): Home and Details at 800, 980, and 1920 px; both at 980 px with 200% density; a 4K Details render. The supplied reference originals remain in `docs/references/`.

## Manual review

1. Open Home at the reference size and compare sidebar, logo, buttons, covers, type, and background fade.
2. Open Sifu Details; compare the action row, stats, About, and screenshot positions.
3. Open Witcher, choose More → Feature on Home, and check the teal theme across the shell.
4. Resize the preview, use Tab/Enter, search, and toggle stores.

The fresh project's `AGENTS.md` requires the user's visual approval before native hosting, scanning, or launching. Publication requires a separate approval after testing the exact candidate. No remote is configured and nothing has been pushed.
