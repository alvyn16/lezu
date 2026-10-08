# Windows desktop window verification

The application uses a decorated Windows window with its native caption buttons. The DWM caption, text and border colors are set explicitly when supported. The window-state plugin saves position, size and maximization. These checks cover the local Windows host; browser viewport emulation is separate.

## Automated checks completed on the development machine

- [x] A production Rust build opens the packaged frontend with no preview server dependency.
- [x] The actual window has caption, resize, minimize and maximize styles.
- [x] Native maximize and restore commands change the window state correctly.
- [x] At 1920×1080, the maximized caption and all three controls remain visible.
- [x] The frontend received the typed `runtime_info` response and opened the separate local desktop library.

## Still requiring hands-on Windows checks

- [ ] Drag the caption to move the window, then drag it to the top to maximize.
- [ ] Drag downward from maximized to restore; double-click the caption to toggle maximization.
- [ ] Hover the maximize button for Windows 11 Snap layouts; use Win+Arrow and Alt+Space.
- [ ] Resize from each edge/corner, minimize/restore from the taskbar and close/reopen.
- [ ] Restart at 100%, 125%, 150% and 200% scale; check multiple monitors and disconnect/reconnect one.
- [ ] Check a fresh/offline machine where WebView2 may need installation.

The production screenshot from this machine is in `docs/screenshots/native-maximized.png` (ignored locally). The 1920×1080 screenshot showed no bright native frame at the top.
