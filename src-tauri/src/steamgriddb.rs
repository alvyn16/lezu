use reqwest::blocking::Client;
use serde_json::Value;
use std::io::Read;

const API: &str = "https://www.steamgriddb.com/api/v2";
const MAX_RESPONSE_BYTES: u64 = 1_000_000;

fn request(client: &Client, key: &str, segments: &[&str]) -> Option<Value> {
    let mut url = reqwest::Url::parse(API).ok()?;
    url.path_segments_mut().ok()?.extend(segments);
    let response = client
        .get(url)
        .bearer_auth(key)
        .send()
        .ok()?
        .error_for_status()
        .ok()?;
    let mut bytes = Vec::new();
    response
        .take(MAX_RESPONSE_BYTES + 1)
        .read_to_end(&mut bytes)
        .ok()?;
    if bytes.len() as u64 > MAX_RESPONSE_BYTES {
        return None;
    }
    let result: Value = serde_json::from_slice(&bytes).ok()?;
    result
        .get("success")?
        .as_bool()?
        .then_some(result.get("data")?.clone())
}

fn normalized_title(title: &str) -> String {
    title
        .chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn matching_game(data: &Value, title: &str) -> Option<u64> {
    let query = normalized_title(title);
    let matches = data.as_array()?;
    matches
        .iter()
        .find(|game| {
            game.get("name")
                .and_then(Value::as_str)
                .is_some_and(|name| normalized_title(name) == query)
        })
        .and_then(|game| game.get("id")?.as_u64())
}

fn grid_urls(data: &Value, kind: &str) -> Vec<String> {
    let Some(images) = data.as_array() else {
        return Vec::new();
    };
    let mut ranked: Vec<_> = images
        .iter()
        .filter_map(|image| {
            let url = image.get("url")?.as_str()?;
            if !trusted_image_url(url) {
                return None;
            }
            let width = image.get("width")?.as_i64()?;
            let height = image.get("height")?.as_i64()?;
            if !(1..=10_000).contains(&width) || !(1..=10_000).contains(&height) {
                return None;
            }
            let score = image
                .get("score")
                .and_then(Value::as_i64)
                .unwrap_or_default();
            if kind == "cover" && height <= width {
                return None;
            }
            if kind == "hero" && width <= height {
                return None;
            }
            let distance = if kind == "cover" {
                (width - 600).abs() + (height - 900).abs() + (height * 2 - width * 3).abs()
            } else {
                (width * 9 - height * 16).abs()
            };
            Some((distance, -score, url.to_owned()))
        })
        .collect();
    ranked.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)));
    ranked.into_iter().take(8).map(|(_, _, url)| url).collect()
}

pub fn trusted_image_url(url: &str) -> bool {
    reqwest::Url::parse(url).ok().is_some_and(|parsed| {
        if parsed.scheme() != "https" {
            return false;
        }
        match parsed.host_str() {
            Some(host) if host == "steamgriddb.com" || host.ends_with(".steamgriddb.com") => true,
            Some("s3.amazonaws.com") => parsed.path().starts_with("/steamgriddb/"),
            _ => false,
        }
    })
}

pub fn artwork_urls(
    client: &Client,
    key: &str,
    source: &str,
    store_id: Option<&str>,
    title: &str,
    kind: &str,
) -> Vec<String> {
    if key.is_empty() {
        return Vec::new();
    }
    let category = if kind == "cover" { "grids" } else { "heroes" };
    if let Some(id) = store_id.filter(|id| !id.is_empty() && id.len() <= 128) {
        if source == "steam" && id.bytes().all(|byte| byte.is_ascii_digit()) {
            let direct = request(client, key, &[category, "steam", id])
                .map(|data| grid_urls(&data, kind))
                .unwrap_or_default();
            if !direct.is_empty() {
                return direct;
            }
        } else if source == "epic" {
            if let Some(game_id) = request(client, key, &["games", "egs", id])
                .and_then(|game| game.get("id")?.as_u64())
            {
                let found = request(client, key, &[category, "game", &game_id.to_string()])
                    .map(|data| grid_urls(&data, kind))
                    .unwrap_or_default();
                if !found.is_empty() {
                    return found;
                }
            }
        }
    }
    if title.trim().is_empty() || title.len() > 200 {
        return Vec::new();
    }
    let Some(game_id) = request(client, key, &["search", "autocomplete", title.trim()])
        .and_then(|games| matching_game(&games, title))
    else {
        return Vec::new();
    };
    request(client, key, &[category, "game", &game_id.to_string()])
        .map(|data| grid_urls(&data, kind))
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_only_the_requested_title() {
        let data = serde_json::json!([{"id": 1, "name": "Portal 2"}, {"id": 2, "name": "Portal"}]);
        assert_eq!(matching_game(&data, "Portal 2"), Some(1));
        assert_eq!(matching_game(&data, "Portal 3"), None);
    }

    #[test]
    fn ranks_portrait_grids_and_rejects_untrusted_urls() {
        let data = serde_json::json!([
            {"url":"https://cdn2.steamgriddb.com/grid/large.jpg","width":1200,"height":1800,"score":100},
            {"url":"https://cdn2.steamgriddb.com/grid/ideal.jpg","width":600,"height":900,"score":1},
            {"url":"https://evil.example/art.jpg","width":600,"height":900,"score":1000},
            {"url":"https://cdn2.steamgriddb.com/grid/wide.jpg","width":920,"height":430,"score":50}
        ]);
        assert_eq!(
            grid_urls(&data, "cover"),
            [
                "https://cdn2.steamgriddb.com/grid/ideal.jpg",
                "https://cdn2.steamgriddb.com/grid/large.jpg",
            ]
        );
        assert!(!trusted_image_url(
            "https://s3.amazonaws.com/other/grid.jpg"
        ));
    }
}
