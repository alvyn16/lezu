pub fn configure(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    window.set_theme(Some(tauri::Theme::Dark))?;
    #[cfg(windows)]
    {
        use std::{ffi::c_void, mem::size_of};
        use windows::Win32::Graphics::Dwm::{
            DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_CAPTION_COLOR, DWMWA_TEXT_COLOR,
        };
        let hwnd = window.hwnd()?;
        for (attribute, color) in [
            (DWMWA_CAPTION_COLOR, 0x00080808_u32),
            (DWMWA_TEXT_COLOR, 0x00ffffff_u32),
            (DWMWA_BORDER_COLOR, 0x00202020_u32),
        ] {
            // SAFETY: hwnd belongs to this live Tauri window. Each call copies a
            // COLORREF from a valid u32 pointer; no pointer escapes this call.
            // Older Windows versions may reject these optional colors, leaving
            // the native dark frame functional.
            let result = unsafe {
                DwmSetWindowAttribute(
                    hwnd,
                    attribute,
                    &color as *const u32 as *const c_void,
                    size_of::<u32>() as u32,
                )
            };
            if let Err(error) = result {
                eprintln!("Native caption color unavailable: {error}");
            }
        }
    }
    Ok(())
}
