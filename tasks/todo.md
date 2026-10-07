# Fresh UI prototype tasks

## 1. Shared shell and design tokens

- [ ] Create the preview entry point, shell module, and shared token stylesheet.
- [ ] Sidebar rows, selected state, provider marks, and top search follow the reference layout.
- [ ] Keyboard focus and accessible control names work.
- Verify: run the local preview command and compare a 980 × 760 screenshot with the supplied Home image.
- Dependencies: approved plan.
- Likely files: `ui/index.html`, `ui/app.js`, `ui/shell.js`, `ui/tokens.css`, `ui/shell.css`.

## 2. Home screen

- [ ] Hero, game title/logo, Play/info controls, horizontal covers, and Stores follow the design contract.
- [ ] Two fixture games show different complete-shell themes.
- [ ] Search and source filtering have a meaningful empty state.
- Verify: inspect Home at 980 × 760 and 1920 × 1080; navigate the cover shelf with the keyboard.
- Dependencies: 1.
- Likely files: `ui/home.js`, `ui/home.css`, `ui/fixtures.js`, `ui/state.js`.

## Checkpoint: Home review

- [ ] Reference comparison records typography, icon, spacing, and position differences.
- [ ] Correct visible differences before proceeding to Details.

## 3. Details screen

- [ ] Back/search, game artwork, action row, stats, About, and screenshot strip follow the Details reference.
- [ ] Game selection updates the theme and facts; unknown facts have honest states.
- [ ] Stats and description reflow in narrow windows without overlap.
- Verify: open each fixture game, return to Home, and compare a screenshot with the supplied Details image.
- Dependencies: 2.
- Likely files: `ui/details.js`, `ui/details.css`, `ui/app.js`, `ui/fixtures.js`.

## 4. State and accessibility verification

- [ ] Focus survives navigation and source switching; offscreen covers become visible when focused.
- [ ] Empty results, missing artwork, disabled sources, and long names behave correctly.
- [ ] Fixture/state checks pass with `node --test tests/*.test.mjs`.
- Verify: focused state tests and a complete keyboard walkthrough.
- Dependencies: 3.
- Likely files: `tests/state.test.mjs`, `ui/state.js`, `ui/app.js`.

## 5. Resolution and visual finish

- [ ] Compare Home/details at the reference size, compact size, standard Windows sizes, and 4K.
- [ ] Check 100%, 125%, 150%, and 200% scaling, reduced motion, and text contrast.
- [ ] Deliver the preview and screenshots with an honest list of remaining differences and unavailable native actions.
- Verify: browser render/interaction checks and saved screenshots; no console errors or horizontal page overflow.
- Dependencies: 4.
- Likely files: shared/screen CSS files and `docs/verification.md`.

## Checkpoint: UI approval

- [ ] The user approves the visible UI before native hosting, real game discovery, launching, or publication.
