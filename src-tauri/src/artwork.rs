use crate::{
    commands::{database_error, error, CommandError},
    library::LibraryStore,
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

const MAX_IMAGE_BYTES: usize = 2_000_000;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtworkReport {
    updated: usize,
    unavailable: usize,
}

#[derive(Deserialize)]
struct IgdbGame {
    name: String,
    cover: Option<IgdbCover>,
    screenshots: Option<Vec<IgdbCover>>,
}

#[derive(Deserialize)]
struct IgdbCover {
    image_id: String,
}

#[derive(Deserialize)]
struct TwitchToken {
    access_token: String,
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

fn epic_image_url<'a>(images: &'a [EpicImage], kind: &str) -> Option<&'a str> {
    let priorities = if kind == "cover" {
        &[
            "DieselGameBoxTall",
            "OfferImageTall",
            "DieselStoreFrontTall",
            "DieselGameBox",
        ][..]
    } else {
        &["DieselStoreFrontWide", "OfferImageWide", "DieselGameBox"][..]
    };
    priorities.iter().find_map(|priority| {
        images
            .iter()
            .find(|image| image.kind == *priority)
            .map(|image| image.url.as_str())
    })
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

fn image_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        Some("image/jpeg")
    } else if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        Some("image/webp")
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
        &["cover", "poster", "boxart", "folder", "library_600x900"][..]
    } else {
        &["hero", "background", "banner", "library_hero"][..]
    };
    for directory in [
        folder.to_path_buf(),
        folder.join("artwork"),
        folder.join("images"),
    ] {
        for stem in stems {
            for extension in ["jpg", "jpeg", "png", "webp"] {
                if let Some(image) = read_local_image(directory.join(format!("{stem}.{extension}")))
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
    for root in &roots.steam {
        let cache = root.join("appcache").join("librarycache");
        let suffixes = if kind == "cover" {
            ["_library_600x900.jpg", "_library_600x900.png"]
        } else {
            ["_library_hero.jpg", "_library_hero.png"]
        };
        for suffix in suffixes {
            if let Some(image) = read_local_image(cache.join(format!("{app_id}{suffix}"))) {
                return Some(image);
            }
        }
    }
    let name = if kind == "cover" {
        "library_600x900.jpg"
    } else {
        "library_hero.jpg"
    };
    download_image(
        client,
        &format!("https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/{name}"),
    )
}

fn igdb_token(client: &Client, client_id: &str, secret: &str) -> Option<String> {
    let response = client
        .post("https://id.twitch.tv/oauth2/token")
        .query(&[
            ("client_id", client_id),
            ("client_secret", secret),
            ("grant_type", "client_credentials"),
        ])
        .send()
        .ok()?
        .error_for_status()
        .ok()?;
    response
        .json::<TwitchToken>()
        .ok()
        .map(|token| token.access_token)
}

fn igdb_artwork(
    client: &Client,
    client_id: &str,
    token: &str,
    title: &str,
    kind: &str,
) -> Option<(String, Vec<u8>)> {
    let safe_title = title.replace(['"', '\\', '\n', '\r'], " ");
    let query = format!(
        "fields name,cover.image_id,screenshots.image_id; search \"{safe_title}\"; limit 10;"
    );
    let results = client
        .post("https://api.igdb.com/v4/games")
        .header("Client-ID", client_id)
        .header("Authorization", format!("Bearer {token}"))
        .body(query)
        .send()
        .ok()?
        .error_for_status()
        .ok()?
        .json::<Vec<IgdbGame>>()
        .ok()?;
    let game = results
        .into_iter()
        .find(|game| game.name.eq_ignore_ascii_case(title))?;
    let image_id = if kind == "cover" {
        game.cover?.image_id
    } else {
        game.screenshots?.into_iter().next()?.image_id
    };
    if !image_id.bytes().all(|byte| byte.is_ascii_alphanumeric()) {
        return None;
    }
    let size = if kind == "cover" {
        "cover_big"
    } else {
        "screenshot_big"
    };
    download_image(
        client,
        &format!("https://images.igdb.com/igdb/image/upload/t_{size}/{image_id}.jpg"),
    )
}

#[tauri::command]
pub async fn refresh_artwork(
    app: tauri::AppHandle,
    store: State<'_, LibraryStore>,
    client_id: Option<String>,
    client_secret: Option<String>,
) -> Result<ArtworkReport, CommandError> {
    let targets = {
        let connection = store.0.lock().map_err(|_| database_error())?;
        let mut statement = connection
            .prepare(
                "SELECT g.id, g.title, g.source, COALESCE(i.store_id,o.provider_id), i.working_dir,
                    cover.game_id IS NULL, hero.game_id IS NULL FROM games g
             LEFT JOIN installations i ON i.id = (
                 SELECT candidate.id FROM installations candidate WHERE candidate.game_id = g.id
                 ORDER BY candidate.rowid LIMIT 1
             )
             LEFT JOIN owned_games o ON o.game_id = g.id AND o.provider = g.source
             LEFT JOIN artwork cover ON cover.game_id = g.id AND cover.kind = 'cover'
             LEFT JOIN artwork hero ON hero.game_id = g.id AND hero.kind = 'hero'
             WHERE cover.game_id IS NULL OR hero.game_id IS NULL ORDER BY g.added_at LIMIT 100",
            )
            .map_err(|_| database_error())?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, bool>(5)?,
                    row.get::<_, bool>(6)?,
                ))
            })
            .map_err(|_| database_error())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|_| database_error())?;
        rows
    };
    let supplied = client_id
        .as_deref()
        .is_some_and(|text| !text.trim().is_empty())
        || client_secret
            .as_deref()
            .is_some_and(|text| !text.trim().is_empty());
    if supplied
        && (!client_id.as_deref().is_some_and(|text| !text.is_empty())
            || !client_secret
                .as_deref()
                .is_some_and(|text| !text.is_empty()))
    {
        return Err(error(
            "igdb_credentials",
            "Enter both IGDB Client ID and secret.",
        ));
    }
    let downloaded = tauri::async_runtime::spawn_blocking(move || {
        let client = Client::builder()
            .timeout(Duration::from_secs(12))
            .build()
            .map_err(|_| error("artwork_network", "Artwork networking is unavailable."))?;
        let roots = StoreRoots::windows_defaults();
        let base = app
            .path()
            .app_local_data_dir()
            .map_err(|_| error("artwork_storage", "Could not locate Lezu data."))?;
        let epic = epic_images(&base);
        let token = match (client_id.as_deref(), client_secret.as_deref()) {
            (Some(id), Some(secret)) if !id.is_empty() && !secret.is_empty() => {
                Some(igdb_token(&client, id, secret).ok_or_else(|| {
                    error("igdb_credentials", "IGDB did not accept these credentials.")
                })?)
            }
            _ => None,
        };
        let mut images = Vec::new();
        let mut total = 0;
        for (id, title, source, store_id, working_dir, need_cover, need_hero) in targets {
            for (kind, needed) in [("cover", need_cover), ("hero", need_hero)] {
                if !needed {
                    continue;
                }
                total += 1;
                let image = working_dir
                    .as_deref()
                    .and_then(|folder| local_game_artwork(Path::new(folder), kind))
                    .or_else(|| {
                        if source == "steam" {
                            store_id
                                .as_deref()
                                .and_then(|app_id| steam_artwork(&client, app_id, &roots, kind))
                        } else if source == "epic" {
                            store_id
                                .as_deref()
                                .and_then(|id| epic.get(id))
                                .and_then(|images| epic_image_url(images, kind))
                                .filter(|url| trusted_store_url(url, "epic"))
                                .and_then(|url| download_image(&client, url))
                        } else {
                            None
                        }
                    })
                    .or_else(|| match (client_id.as_deref(), token.as_deref()) {
                        (Some(client_id), Some(token)) => {
                            igdb_artwork(&client, client_id, token, &title, kind)
                        }
                        _ => None,
                    });
                if let Some((mime, bytes)) = image {
                    images.push((id.clone(), kind, mime, bytes));
                }
            }
        }
        Ok::<_, CommandError>((images, total))
    })
    .await
    .map_err(|_| error("artwork_failed", "Artwork refresh stopped unexpectedly."))??;
    let (images, total) = downloaded;
    let updated = images.len();
    let mut connection = store.0.lock().map_err(|_| database_error())?;
    let transaction = connection.transaction().map_err(|_| database_error())?;
    for (id, kind, mime, bytes) in images {
        transaction
            .execute(
                "INSERT OR IGNORE INTO artwork(game_id,kind,mime,image) VALUES(?1,?2,?3,?4)",
                params![id, kind, mime, bytes],
            )
            .map_err(|_| database_error())?;
    }
    transaction.commit().map_err(|_| database_error())?;
    Ok(ArtworkReport {
        updated,
        unavailable: total - updated,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_only_supported_image_data() {
        assert_eq!(image_mime(b"\xff\xd8\xffimage"), Some("image/jpeg"));
        assert_eq!(image_mime(b"\x89PNG\r\n\x1a\nimage"), Some("image/png"));
        assert_eq!(image_mime(b"not an image"), None);
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
    fn epic_cached_metadata_supplies_owned_game_artwork() {
        let base = std::env::temp_dir().join(format!("lezu-epic-art-{}", uuid::Uuid::new_v4()));
        let folder = base.join("legendary-config").join("metadata");
        fs::create_dir_all(&folder).unwrap();
        fs::write(folder.join("game.json"), r#"{"app_name":"owned-game","metadata":{"keyImages":[{"type":"DieselGameBox","url":"https://cdn1.epicgames.com/wide.jpg"},{"type":"DieselGameBoxTall","url":"https://cdn1.epicgames.com/tall.jpg"}]}}"#).unwrap();
        let games = epic_images(&base);
        let images = games.get("owned-game").unwrap();
        assert_eq!(
            epic_image_url(images, "cover"),
            Some("https://cdn1.epicgames.com/tall.jpg")
        );
        assert_eq!(
            epic_image_url(images, "hero"),
            Some("https://cdn1.epicgames.com/wide.jpg")
        );
        assert!(!trusted_store_url(
            "http://cdn1.epicgames.com/tall.jpg",
            "epic"
        ));
        assert!(!trusted_store_url("https://evil.example/tall.jpg", "epic"));
        fs::remove_dir_all(base).unwrap();
    }
}
