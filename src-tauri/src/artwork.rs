use crate::{
    commands::{database_error, error, CommandError},
    library::LibraryStore,
    steamgriddb,
    store_discovery::StoreRoots,
};
use reqwest::blocking::Client;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    io::Read,
    path::{Path, PathBuf},
    time::Duration,
};
use tauri::{Manager, State};

const MAX_IMAGE_BYTES: usize = 5_000_000;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtworkReport {
    updated: usize,
    unavailable: usize,
}

#[tauri::command]
pub fn steamgriddb_key_status(store: State<'_, LibraryStore>) -> Result<bool, CommandError> {
    let connection = store.0.lock().map_err(|_| database_error())?;
    let configured: i64 = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM preferences WHERE key='steamgriddb-api-key' AND value<>'')",
        [], |row| row.get(0),
    ).map_err(|_| database_error())?;
    Ok(configured != 0)
}

#[tauri::command]
pub fn set_steamgriddb_key(
    store: State<'_, LibraryStore>,
    key: String,
) -> Result<bool, CommandError> {
    let key = key.trim();
    if key.len() > 256 || !key.bytes().all(|byte| byte.is_ascii_graphic()) {
        return Err(error(
            "steamgriddb_key",
            "Enter a valid SteamGridDB API key.",
        ));
    }
    let connection = store.0.lock().map_err(|_| database_error())?;
    if key.is_empty() {
        connection
            .execute(
                "DELETE FROM preferences WHERE key='steamgriddb-api-key'",
                [],
            )
            .map_err(|_| database_error())?;
    } else {
        connection
            .execute(
                "INSERT INTO preferences(key,value) VALUES('steamgriddb-api-key',?1)
             ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                [key],
            )
            .map_err(|_| database_error())?;
    }
    Ok(!key.is_empty())
}

#[derive(Deserialize)]
struct EpicMetadata {
    app_name: String,
    metadata: EpicCatalog,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EpicCatalog {
    key_images: Vec<EpicImage>,
}

#[derive(Deserialize)]
struct EpicImage {
    #[serde(rename = "type")]
    kind: String,
    url: String,
}

fn epic_images(base: &Path) -> HashMap<String, Vec<EpicImage>> {
    let mut games = HashMap::new();
    let folder = base.join("legendary-config").join("metadata");
    let Ok(files) = fs::read_dir(folder) else {
        return games;
    };
    for entry in files.flatten().take(5000) {
        let path = entry.path();
        if path.extension().is_none_or(|extension| extension != "json")
            || !fs::metadata(&path).is_ok_and(|metadata| metadata.len() <= 1_000_000)
        {
            continue;
        }
        if let Some(game) = fs::read(&path)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<EpicMetadata>(&bytes).ok())
        {
            games.insert(game.app_name, game.metadata.key_images);
        }
    }
    games
}

fn epic_image_urls<'a>(images: &'a [EpicImage], kind: &str) -> Vec<&'a str> {
    let priorities = if kind == "cover" {
        &[
            "DieselGameBoxTall",
            "OfferImageTall",
            "DieselGameBox",
            "Thumbnail",
            "DieselStoreFrontTall",
        ][..]
    } else {
        &["DieselStoreFrontWide", "OfferImageWide", "DieselGameBox"][..]
    };
    priorities
        .iter()
        .filter_map(|priority| {
            images
                .iter()
                .find(|image| image.kind == *priority)
                .map(|image| image.url.as_str())
        })
        .collect()
}

fn epic_artwork(client: &Client, images: &[EpicImage], kind: &str) -> Option<(String, Vec<u8>)> {
    epic_image_urls(images, kind)
        .into_iter()
        .filter(|url| trusted_store_url(url, "epic"))
        .find_map(|url| download_image(client, url))
}

fn trusted_store_url(url: &str, source: &str) -> bool {
    reqwest::Url::parse(url).ok().is_some_and(|parsed| {
        if parsed.scheme() != "https" {
            return false;
        }
        let Some(host) = parsed.host_str() else {
            return false;
        };
        match source {
            "epic" => host == "epicgames.com" || host.ends_with(".epicgames.com"),
            "gog" => {
                host == "gog.com"
                    || host.ends_with(".gog.com")
                    || host.ends_with(".gog-statics.com")
            }
            _ => false,
        }
    })
}

fn gog_image_url(raw: &str) -> Option<reqwest::Url> {
    let full = if raw.starts_with("//") {
        format!("https:{raw}")
    } else {
        raw.to_owned()
    };
    if !trusted_store_url(&full, "gog") {
        return None;
    }
    reqwest::Url::parse(&full).ok()
}

fn gog_cover_url(raw: &str) -> Option<String> {
    let mut url = gog_image_url(raw)?;
    if ![".jpg", ".jpeg", ".png", ".webp"]
        .iter()
        .any(|suffix| url.path().ends_with(suffix))
    {
        let path = format!("{}_product_card_v2_mobile_slider_639.jpg", url.path());
        url.set_path(&path);
    }
    Some(url.to_string())
}

fn gog_vertical_url(raw: &str) -> Option<String> {
    let mut url = gog_image_url(raw)?;
    if ![".jpg", ".jpeg", ".png", ".webp", ".avif"]
        .iter()
        .any(|suffix| url.path().ends_with(suffix))
    {
        url.set_path(&format!("{}_glx_vertical_cover.webp", url.path()));
    }
    Some(url.to_string())
}

fn gog_product(client: &Client, product_id: &str) -> Option<serde_json::Value> {
    if product_id.is_empty() || !product_id.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    let response = client
        .get(format!(
            "https://api.gog.com/products/{product_id}?locale=en-US"
        ))
        .send()
        .ok()?
        .error_for_status()
        .ok()?;
    let mut bytes = Vec::new();
    response.take(1_000_001).read_to_end(&mut bytes).ok()?;
    if bytes.len() > 1_000_000 {
        return None;
    }
    serde_json::from_slice(&bytes).ok()
}

fn gog_artwork(
    client: &Client,
    product: Option<&serde_json::Value>,
    library_image: Option<&str>,
    kind: &str,
) -> Option<(String, Vec<u8>)> {
    let images = product.and_then(|value| value.get("images"));
    let mut urls = Vec::new();
    if kind == "cover" {
        if let Some(raw) = library_image {
            urls.extend(gog_vertical_url(raw));
        }
        for key in ["verticalCover", "logo2x", "logo"] {
            if let Some(url) = images
                .and_then(|value| value.get(key))
                .and_then(|value| value.as_str())
                .and_then(gog_image_url)
            {
                urls.push(url.to_string());
            }
        }
        if let Some(raw) = library_image {
            urls.extend(gog_cover_url(raw));
        }
    } else if let Some(url) = images
        .and_then(|value| value.get("background"))
        .and_then(|value| value.as_str())
        .and_then(gog_image_url)
    {
        urls.push(url.to_string());
    }
    urls.iter().find_map(|url| download_image(client, url))
}

fn image_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        Some("image/jpeg")
    } else if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        Some("image/webp")
    } else if bytes.get(4..12) == Some(b"ftypavif") || bytes.get(4..12) == Some(b"ftypavis") {
        Some("image/avif")
    } else {
        None
    }
}

fn read_local_image(path: PathBuf) -> Option<(String, Vec<u8>)> {
    let metadata = fs::metadata(&path).ok()?;
    if metadata.len() > MAX_IMAGE_BYTES as u64 {
        return None;
    }
    let bytes = fs::read(path).ok()?;
    let mime = image_mime(&bytes)?.to_owned();
    Some((mime, bytes))
}

fn local_game_artwork(folder: &Path, kind: &str) -> Option<(String, Vec<u8>)> {
    let stems = if kind == "cover" {
        &[
            "cover",
            "poster",
            "boxart",
            "box_art",
            "vertical",
            "portrait",
            "library_600x900",
            "library",
            "capsule",
            "folder",
        ][..]
    } else {
        &[
            "hero",
            "background",
            "banner",
            "library_hero",
            "wide",
            "landscape",
        ][..]
    };
    let Ok(children) = fs::read_dir(folder) else {
        return None;
    };
    let child_folders: HashMap<String, PathBuf> = children
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().to_lowercase();
            entry
                .file_type()
                .ok()?
                .is_dir()
                .then_some((name, entry.path()))
        })
        .collect();
    let directories = std::iter::once(folder.to_path_buf()).chain(
        ["artwork", "images", "media", "covers", ".assets"]
            .iter()
            .filter_map(|name| child_folders.get(*name).cloned()),
    );
    for directory in directories {
        let Ok(files) = fs::read_dir(directory) else {
            continue;
        };
        let image_files: HashMap<String, PathBuf> = files
            .flatten()
            .filter_map(|entry| {
                let name = entry.file_name().to_string_lossy().to_lowercase();
                entry
                    .file_type()
                    .ok()?
                    .is_file()
                    .then_some((name, entry.path()))
            })
            .collect();
        for stem in stems {
            for extension in ["jpg", "jpeg", "png", "webp", "avif"] {
                if let Some(image) = image_files
                    .get(&format!("{stem}.{extension}"))
                    .and_then(|path| read_local_image(path.clone()))
                {
                    return Some(image);
                }
            }
        }
    }
    None
}

fn download_image(client: &Client, url: &str) -> Option<(String, Vec<u8>)> {
    let mut response = client.get(url).send().ok()?.error_for_status().ok()?;
    if response
        .content_length()
        .is_some_and(|len| len > MAX_IMAGE_BYTES as u64)
    {
        return None;
    }
    let mut bytes = Vec::new();
    response
        .by_ref()
        .take(MAX_IMAGE_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .ok()?;
    if bytes.len() > MAX_IMAGE_BYTES {
        return None;
    }
    Some((image_mime(&bytes)?.to_owned(), bytes))
}

fn steam_artwork(
    client: &Client,
    app_id: &str,
    roots: &StoreRoots,
    kind: &str,
) -> Option<(String, Vec<u8>)> {
    if app_id.is_empty() || !app_id.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    let names = if kind == "cover" {
        &[
            "library_600x900.jpg",
            "library_600x900_2x.jpg",
            "header.jpg",
            "capsule_616x353.jpg",
        ][..]
    } else {
        &["library_hero.jpg", "header.jpg", "capsule_616x353.jpg"][..]
    };
    for root in &roots.steam {
        let cache = root.join("appcache").join("librarycache");
        for name in names {
            let stem = name.trim_end_matches(".jpg");
            for ext in ["jpg", "png", "webp", "avif"] {
                if let Some(image) = read_local_image(cache.join(format!("{app_id}_{stem}.{ext}")))
                {
                    return Some(image);
                }
            }
        }
        if kind == "cover" {
            if let Ok(users) = fs::read_dir(root.join("userdata")) {
                for user in users.flatten().take(32) {
                    let grid = user.path().join("config").join("grid");
                    for ext in ["jpg", "png", "webp", "avif"] {
                        if let Some(image) = read_local_image(grid.join(format!("{app_id}p.{ext}")))
                        {
                            return Some(image);
                        }
                    }
                }
            }
        }
    }
    names
        .iter()
        .find_map(|name| {
            download_image(
                client,
                &format!("https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/{name}"),
            )
        })
        .or_else(|| steam_hashed_image(client, app_id))
}

fn steam_hashed_image(client: &Client, app_id: &str) -> Option<(String, Vec<u8>)> {
    let mut response = client
        .get("https://store.steampowered.com/api/appdetails")
        .query(&[("appids", app_id), ("filters", "basic")])
        .send()
        .ok()?
        .error_for_status()
        .ok()?;
    let mut bytes = Vec::new();
    response
        .by_ref()
        .take(1_000_001)
        .read_to_end(&mut bytes)
        .ok()?;
    if bytes.len() > 1_000_000 {
        return None;
    }
    let data: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
    let product = data.get(app_id)?.get("data")?;
    ["header_image", "capsule_image"].iter().find_map(|key| {
        let url = product.get(key)?.as_str()?;
        let parsed = reqwest::Url::parse(url).ok()?;
        let host = parsed.host_str()?;
        (parsed.scheme() == "https"
            && (host == "steamstatic.com" || host.ends_with(".steamstatic.com")))
        .then(|| download_image(client, url))
        .flatten()
    })
}

#[tauri::command]
pub async fn refresh_artwork(
    app: tauri::AppHandle,
    store: State<'_, LibraryStore>,
    game_id: Option<String>,
    force: Option<bool>,
) -> Result<ArtworkReport, CommandError> {
    let (targets, steamgriddb_key) = {
        let connection = store.0.lock().map_err(|_| database_error())?;
        let key = connection
            .query_row(
                "SELECT value FROM preferences WHERE key='steamgriddb-api-key'",
                [],
                |row| row.get::<_, String>(0),
            )
            .ok();
        let mut statement = connection
            .prepare(
                "SELECT g.id, g.title, g.source, COALESCE(NULLIF(i.store_id,''),o.provider_id), i.working_dir,
                    cover.game_id IS NULL, hero.game_id IS NULL, p.value FROM games g
             LEFT JOIN installations i ON i.id = (
                 SELECT candidate.id FROM installations candidate WHERE candidate.game_id = g.id
                 ORDER BY CASE WHEN candidate.install_state='installed' THEN 0 ELSE 1 END,
                          candidate.rowid LIMIT 1
             )
             LEFT JOIN owned_games o ON o.game_id = g.id AND o.provider = g.source
             LEFT JOIN preferences p ON p.key = 'gog-cover:' || o.provider_id
             LEFT JOIN artwork cover ON cover.game_id = g.id AND cover.kind = 'cover'
             LEFT JOIN artwork hero ON hero.game_id = g.id AND hero.kind = 'hero'
             WHERE (?1 IS NULL OR g.id = ?1)
               AND (?2 = 1 OR cover.game_id IS NULL OR hero.game_id IS NULL)
             ORDER BY g.added_at",
            )
            .map_err(|_| database_error())?;
        let rows = statement
            .query_map(params![game_id, i64::from(force.unwrap_or(false))], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, bool>(5)?,
                    row.get::<_, bool>(6)?,
                    row.get::<_, Option<String>>(7)?,
                ))
            })
            .map_err(|_| database_error())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| database_error())?;
        (rows, key)
    };
    tauri::async_runtime::spawn_blocking(move || {
        let client = Client::builder()
            .timeout(Duration::from_secs(12))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| error("artwork_network", "Artwork networking is unavailable."))?;
        let roots = StoreRoots::windows_defaults();
        let base = app
            .path()
            .app_local_data_dir()
            .map_err(|_| error("artwork_storage", "Could not locate Lezu data."))?;
        let epic = epic_images(&base);
        let mut updated = 0;
        let mut unavailable = 0;
        for (id, title, source, store_id, working_dir, need_cover, need_hero, gog_cover) in targets {
            let mut gog_metadata: Option<Option<serde_json::Value>> = None;
            for (kind, needed) in [("cover", need_cover), ("hero", need_hero)] {
                if !needed && !force.unwrap_or(false) {
                    continue;
                }
                let local = working_dir
                    .as_deref()
                    .and_then(|folder| local_game_artwork(Path::new(folder), kind));
                let native = if local.is_none() {
                    match source.as_str() {
                        "steam" => store_id.as_deref().and_then(|app_id| steam_artwork(&client, app_id, &roots, kind)),
                        "epic" => store_id.as_deref().and_then(|id| epic.get(id))
                            .and_then(|images| epic_artwork(&client, images, kind)),
                        "gog" => {
                            let metadata = gog_metadata.get_or_insert_with(|| store_id.as_deref()
                                .and_then(|id| gog_product(&client, id)));
                            gog_artwork(&client, metadata.as_ref(), gog_cover.as_deref(), kind)
                        }
                        _ => None,
                    }
                } else { None };
                let fallback = if local.is_none() && native.is_none() {
                    steamgriddb_key.as_deref().and_then(|key| {
                        steamgriddb::artwork_urls(&client, key, &source, store_id.as_deref(), &title, kind)
                            .iter().find_map(|url| download_image(&client, url))
                    })
                } else { None };
                let found = local.map(|image| ("local", image))
                    .or_else(|| native.map(|image| (source.as_str(), image)))
                    .or_else(|| fallback.map(|image| ("steamgriddb", image)));
                if let Some((source_type, (mime, bytes))) = found {
                    let store = app.state::<LibraryStore>();
                    let connection = store.0.lock().map_err(|_| database_error())?;
                    updated += connection
                        .execute(
                            "INSERT INTO artwork(game_id,kind,mime,image,source_type) VALUES(?1,?2,?3,?4,?5)
                             ON CONFLICT(game_id,kind) DO UPDATE SET mime=excluded.mime,
                             image=excluded.image, source_type=excluded.source_type",
                            params![id, kind, mime, bytes, source_type],
                        )
                        .map_err(|_| database_error())?;
                } else if needed {
                    unavailable += 1;
                }
            }
        }
        Ok::<_, CommandError>(ArtworkReport {
            updated,
            unavailable,
        })
    })
    .await
    .map_err(|_| error("artwork_failed", "Artwork refresh stopped unexpectedly."))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_only_supported_image_data() {
        assert_eq!(image_mime(b"\xff\xd8\xffimage"), Some("image/jpeg"));
        assert_eq!(image_mime(b"\x89PNG\r\n\x1a\nimage"), Some("image/png"));
        assert_eq!(image_mime(b"not an image"), None);
        assert_eq!(image_mime(b"\0\0\0\x18ftypavifmore"), Some("image/avif"));
    }

    #[test]
    fn finds_local_artwork_without_store_credentials() {
        let folder = std::env::temp_dir().join(format!("lezu-art-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&folder).unwrap();
        fs::write(folder.join("cover.png"), b"\x89PNG\r\n\x1a\nimage").unwrap();
        assert_eq!(local_game_artwork(&folder, "cover").unwrap().0, "image/png");
        assert!(local_game_artwork(&folder, "hero").is_none());
        fs::remove_dir_all(folder).unwrap();
    }

    #[test]
    fn finds_case_insensitive_portrait_in_new_subfolders() {
        let folder = std::env::temp_dir().join(format!("lezu-art-{}", uuid::Uuid::new_v4()));
        let media = folder.join("MeDiA");
        fs::create_dir_all(&media).unwrap();
        fs::write(media.join("PoRtRaIt.AvIf"), b"\0\0\0\x18ftypavifmore").unwrap();
        assert_eq!(
            local_game_artwork(&folder, "cover").unwrap().0,
            "image/avif"
        );
        fs::remove_dir_all(folder).unwrap();
    }

    #[test]
    fn epic_cached_metadata_supplies_owned_game_artwork() {
        let base = std::env::temp_dir().join(format!("lezu-epic-art-{}", uuid::Uuid::new_v4()));
        let folder = base.join("legendary-config").join("metadata");
        fs::create_dir_all(&folder).unwrap();
        fs::write(folder.join("game.json"), r#"{"app_name":"owned-game","metadata":{"keyImages":[{"type":"DieselGameBox","url":"https://cdn1.epicgames.com/wide.jpg"},{"type":"DieselGameBoxTall","url":"https://cdn1.epicgames.com/tall.jpg"}]}}"#).unwrap();
        let games = epic_images(&base);
        let images = games.get("owned-game").unwrap();
        assert_eq!(
            epic_image_urls(images, "cover").first().copied(),
            Some("https://cdn1.epicgames.com/tall.jpg")
        );
        assert_eq!(
            epic_image_urls(images, "hero").first().copied(),
            Some("https://cdn1.epicgames.com/wide.jpg")
        );
        assert!(!trusted_store_url(
            "http://cdn1.epicgames.com/tall.jpg",
            "epic"
        ));
        assert!(!trusted_store_url("https://evil.example/tall.jpg", "epic"));
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn gog_library_image_becomes_cover_without_a_key() {
        assert_eq!(
            gog_cover_url("//images-2.gog.com/abc123").as_deref(),
            Some("https://images-2.gog.com/abc123_product_card_v2_mobile_slider_639.jpg")
        );
        assert!(gog_cover_url("http://images-2.gog.com/abc123").is_none());
        assert!(gog_cover_url("//evil.example/abc123").is_none());
        assert_eq!(
            gog_vertical_url("//images-2.gog.com/abc123").as_deref(),
            Some("https://images-2.gog.com/abc123_glx_vertical_cover.webp")
        );
    }
}
