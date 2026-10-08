# Native library verification

On October 7–8, 2026, the local Windows release executable was opened with an empty per-user library. The browser preview's eight sample entries did not appear. A harmless temporary `.exe` was selected through the native file picker and displayed as one installed manual game in All Games and Details. Play created a marker containing the executable's expected working directory. The game was still present after closing and reopening Lezu. A second native run saved a custom Unicode working folder, launched from that folder, and opened it in File Explorer. The test entries and temporary files were removed afterward; the library returned to zero games.

The native window was tested at 1120×740 on a 1920×1080 desktop. The separate [window checklist](windows-window-checklist.md) records caption and placement checks.

## Still to verify

- [ ] Add a real game with a title containing spaces or Unicode; confirm the saved title and launch behavior.
- [x] Open the game's folder from Details.
- [ ] Test missing executable, duplicate import, and a declined file picker in the native UI.
- [ ] Have the maintainer launch one chosen game on their own machine.
- [ ] Confirm native UI behavior at smaller windows and high DPI settings.

No automatic store or nested-folder scanning is present yet. Unknown details and absent artwork use explicit placeholders.
