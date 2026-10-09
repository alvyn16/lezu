use crate::commands::{error, CommandError};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    time::Duration,
};

pub(crate) struct EngineSpec {
    pub name: &'static str,
    pub url: &'static str,
    pub sha256: &'static str,
}

pub(crate) fn verified_engine(base: &Path, spec: &EngineSpec) -> Result<PathBuf, CommandError> {
    let folder = base.join("engines");
    fs::create_dir_all(&folder).map_err(|_| {
        error(
            "engine_storage",
            "Could not prepare the account engine folder.",
        )
    })?;
    let target = folder.join(spec.name);
    if target.is_file() {
        return if has_expected_hash(&target, spec.sha256)? {
            Ok(target)
        } else {
            Err(error(
                "engine_hash",
                "An account engine failed its integrity check.",
            ))
        };
    }
    let staged = folder.join(format!("{}.download-{}", spec.name, uuid::Uuid::new_v4()));
    let result = (|| {
        let response = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(120))
            .build()
            .map_err(|_| {
                error(
                    "engine_download",
                    "Could not start the account engine download.",
                )
            })?
            .get(spec.url)
            .send()
            .and_then(|response| response.error_for_status())
            .map_err(|_| {
                error(
                    "engine_download",
                    "Could not download the account engine from its release page.",
                )
            })?;
        let mut file = fs::File::create(&staged)
            .map_err(|_| error("engine_storage", "Could not save the account engine."))?;
        std::io::copy(&mut response.take(40_000_000), &mut file).map_err(|_| {
            error(
                "engine_download",
                "The account engine download was interrupted.",
            )
        })?;
        if !has_expected_hash(&staged, spec.sha256)? {
            return Err(error(
                "engine_hash",
                "The account engine download failed its integrity check.",
            ));
        }
        fs::rename(&staged, &target)
            .map_err(|_| error("engine_storage", "Could not activate the account engine."))?;
        Ok(target)
    })();
    if result.is_err() {
        let _ = fs::remove_file(staged);
    }
    result
}

fn has_expected_hash(path: &Path, expected: &str) -> Result<bool, CommandError> {
    let mut file = fs::File::open(path)
        .map_err(|_| error("engine_storage", "Could not read the account engine."))?;
    let mut hasher = Sha256::new();
    std::io::copy(&mut file, &mut hasher)
        .map_err(|_| error("engine_storage", "Could not verify the account engine."))?;
    Ok(format!("{:x}", hasher.finalize()) == expected)
}
