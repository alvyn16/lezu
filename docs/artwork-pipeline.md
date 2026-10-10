# Artwork pipeline

Lezu stores each game's `cover` and `hero` as separate rows in `artwork`. Each row contains the image bytes, MIME type, and `source_type` (`local`, `steam`, `epic`, `gog`, `steamgriddb`, or `legacy`). Schema version 4 adds `source_type` without deleting existing images; migrated rows are marked `legacy` until refreshed.

## Resolution flow

For each missing image, Lezu tries the following sources in order:

1. Named files in the installed game folder or its `artwork`, `images`, `media`, `covers`, or `.assets` subfolder. Names and extensions are case insensitive. Covers accept `cover`, `poster`, `boxart`, `box_art`, `library`, `capsule`, `vertical`, `portrait`, and `library_600x900`; heroes use wide-art names. Supported formats are JPEG, PNG, WebP, and AVIF.
2. The game's native store. Steam checks local library caches and custom portrait grids before its public CDN, with an appdetails fallback for hashed URLs. Epic tries Legendary `keyImages` in portrait-first order. GOG checks portrait product images and its vertical library cover. Wide product-card images and logos are discarded as covers after their pixel dimensions are checked. The product background is used only for heroes.
3. SteamGridDB if a key is configured and native cover art is missing or below 550×750 pixels. Steam AppIDs are queried directly, Epic IDs use the EGS mapping, and an exact normalized title search is the fallback. SteamGridDB does not expose a GOG ID lookup, so GOG games use the title search. Portrait grids are ranked by distance to 600×900. A downloaded SteamGridDB image replaces the native cover only when its measured portrait resolution is higher. Heroes are selected separately.
4. If all sources fail, the UI displays “Artwork unavailable.” A failed explicit refresh leaves any cached image intact.

Automatic refresh only fetches missing rows. Settings → **Refresh artwork** forces a recheck of every game's cover and hero. A game's **More** menu provides **Refresh artwork** for that game alone. The free SteamGridDB key is optional and can be saved or removed in Settings; it is stored locally in the `preferences` table. IGDB is not used.

GOG's own vertical tiles can be only 342×482 pixels. Lezu cannot add detail that is absent from the source. At large card sizes or high display scaling those native images may still look soft; a larger local cover or a SteamGridDB key allows a sharper replacement. Existing cached covers keep their old resolution until explicitly refreshed.

Downloads have a 12-second timeout, a 5 MB image cap, a 1 MB metadata cap, HTTPS host checks for external artwork, and image format checks based on file bytes. Unavailable, malformed, oversized, or unsupported images fall through to the next candidate. A wrong SteamGridDB title match is skipped rather than attached to another game. If the API key is invalid or the service is rate limited, existing cached images remain available.
