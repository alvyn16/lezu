# Implementation plan: fresh UI prototype

## Scope

Build the first visual capability of the new Windows game-library app: shared shell, Home, and Details. Follow `docs/ui-design.md`. Use independently sourced fixture data and artwork, with no previous Lezu code.

## Assumptions

- Windows-only remains the target.
- The two supplied images remain the visual reference.
- Colors change with the featured/opened game.
- No Couch mode.
- The first deliverable is an interactive local UI preview. Real scanning and launching follow visual approval.

## Architecture

- One small HTML entry point and shared design tokens.
- Separate shell, Home, and Details modules.
- A fixture/data module owns sample games; state derives search, selected source, selected game, and palette.
- No desktop host, remote account integration, database, or package dependency in this first stage.
- Windows desktop hosting is decided after the UI is reviewed, with native dragging, snapping, and scaling treated as explicit acceptance criteria.

## Build order

1. Shared shell and tokens → 2. Home → 3. Details → 4. Interaction/state checks → 5. Visual/resolution review.

The task checklist is in `tasks/todo.md`.

## Verification checkpoints

- Shell: match sidebar and search placement at 980 × 760.
- Home: single horizontal cover shelf and matching store-card density.
- Details: reference action/stat/About placement with no text overlap.
- Completion: sample data navigation works, focused checks pass, and screenshots reviewed at the requested sizes and scales.

## Later capabilities

These are not part of this prototype. Each needs its own bounded spec before implementation:

1. Windows desktop host and packaging.
2. Persistent library model and manual game entry.
3. Steam discovery and launcher integration.
4. Epic discovery and launcher integration.
5. GOG discovery and launcher integration, including nested install directories.
6. Artwork/metadata refresh and recovery.

## Risks

| Risk | Mitigation |
|---|---|
| Another approximation of the reference | Measure the app area, compare fixed-size screenshots, and review the UI before native/backend work. |
| Repeatedly changing the design | Centralize tokens and keep a written visual contract. |
| Browser preview mistaken for a finished desktop app | Explicitly identify the preview, fixture data, and unavailable native actions. |
| Poor DPI behavior | Verify logical layout and physical render resolution separately; test the native host later on Windows. |
| Recreating the old tangled application | Separate capability boundaries and deliver one complete flow at a time. |

## Review

Approved by the user's “continue.” Implementing the first UI prototype; native integration follows visual approval.
