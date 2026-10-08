# Typography and wording review

Reviewed the local UI on 2026-10-07: Home, Library, source filters, search, game details, empty states, missing artwork/metadata, and dialog copy.

## Changes

| Area | Result |
|---|---|
| Font family | One Windows font stack: Segoe UI, Segoe UI Variable Text, system UI fallback. No downloaded fonts. |
| Sizes | Body, controls, and search: 14 px. Captions, counts, and labels: 12 px minimum. Main headings and stats: 18 px; Ready to Play: 20 px; descriptions: 18–22 px. |
| Weights | Regular 400 for text; semibold 600 for headings and important actions. Removed intermediate 500/650 weights. |
| Long game names | Two lines on cards, with full names in tooltips and accessible button labels. Caption baselines stay aligned. |
| Missing logos | Text titles use a responsive size and two-line limit. They no longer overlap metadata or Play, including after image-load failures. |
| Missing metadata | Dashes replace repeated “Not available” values. Full unavailable labels remain accessible and available on hover. |
| Empty descriptions | Normal 14 px text: “No description available.” Missing screenshots: “No screenshots available.” |
| Demo wording | Consistent “demo” terminology, shorter captions, and explicit demo-library identification. Dialogs describe the current capability without implementation plans. |
| Naming | Home, Library, All Games, Ready to Play, See All, and store names retain consistent navigation/control capitalization. Metadata and explanatory text use sentence case. |

## Verification

- Visible text checked for a 12 px minimum, regular/semibold weights, and unwanted clipping on Home, Library, Sifu details, missing metadata, and dialogs at 980 × 760.
- Visual review of Home, Sifu, dialog, Library, and missing-artwork renders.
- 56 Home/Details resolution checks passed across seven viewport sizes and four display densities.
- Nine missing-logo title checks passed: Home, Details, and failed-logo recovery at 320, 980, and 1920 px. See `tests/title-fallback-browser.cjs`.
- Home, Details, edge cases, wheel browsing, syntax, whitespace, and all 12 Node tests passed.

Artwork logos retain the games’ own typography. Very long titles may still truncate after two lines; their full names remain available. This review covers the browser prototype, not native Windows text rendering or a complete assistive-technology certification.
