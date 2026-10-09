use serde::Serialize;
use std::{
    collections::{HashSet, VecDeque},
    fs,
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};

const MAX_ENTRIES: usize = 20_000;
const MAX_DEPTH: usize = 10;
const MAX_CANDIDATES: usize = 250;

#[derive(Default)]
pub struct ScanCoordinator(Arc<Mutex<Option<Arc<AtomicBool>>>>);

impl ScanCoordinator {
    pub fn begin(&self) -> Option<ScanPermit> {
        let mut active = self.0.lock().ok()?;
        if active.is_some() {
            return None;
        }
        let cancelled = Arc::new(AtomicBool::new(false));
        *active = Some(Arc::clone(&cancelled));
        Some(ScanPermit {
            coordinator: Arc::clone(&self.0),
            cancelled,
        })
    }

    pub fn cancel(&self) {
        if let Ok(active) = self.0.lock() {
            if let Some(cancelled) = active.as_ref() {
                cancelled.store(true, Ordering::Release);
            }
        }
    }
}

pub struct ScanPermit {
    coordinator: Arc<Mutex<Option<Arc<AtomicBool>>>>,
    cancelled: Arc<AtomicBool>,
}

impl ScanPermit {
    pub fn cancelled(&self) -> &AtomicBool {
        &self.cancelled
    }
}

impl Drop for ScanPermit {
    fn drop(&mut self) {
        if let Ok(mut active) = self.coordinator.lock() {
            *active = None;
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    pub title: String,
    pub executable_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanReport {
    pub root: String,
    pub entries_checked: usize,
    pub candidates: Vec<Candidate>,
    pub warnings: usize,
    pub truncated: bool,
    pub cancelled: bool,
}

pub fn scan_folder(root: &Path, cancelled: &AtomicBool) -> std::io::Result<ScanReport> {
    scan_folder_with_progress(root, cancelled, |_| {})
}

pub fn scan_folder_with_progress(
    root: &Path,
    cancelled: &AtomicBool,
    mut progress: impl FnMut(usize),
) -> std::io::Result<ScanReport> {
    let root = fs::canonicalize(root)?;
    if !root.is_dir() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "Choose an existing folder",
        ));
    }
    let mut report = ScanReport {
        root: root.to_string_lossy().into_owned(),
        entries_checked: 0,
        candidates: Vec::new(),
        warnings: 0,
        truncated: false,
        cancelled: false,
    };
    let mut folders = VecDeque::from([(root, 0usize)]);
    let mut seen = HashSet::new();
    let mut next_progress = 256;
    while let Some((folder, depth)) = folders.pop_front() {
        if cancelled.load(Ordering::Relaxed) {
            report.cancelled = true;
            break;
        }
        let entries = match fs::read_dir(&folder) {
            Ok(entries) => entries,
            Err(_) => {
                report.warnings += 1;
                continue;
            }
        };
        for entry in entries {
            if cancelled.load(Ordering::Relaxed) {
                report.cancelled = true;
                break;
            }
            if report.entries_checked >= MAX_ENTRIES || report.candidates.len() >= MAX_CANDIDATES {
                report.truncated = true;
                break;
            }
            report.entries_checked += 1;
            if report.entries_checked >= next_progress {
                progress(report.entries_checked);
                next_progress += 256;
            }
            let entry = match entry {
                Ok(entry) => entry,
                Err(_) => {
                    report.warnings += 1;
                    continue;
                }
            };
            let file_type = match entry.file_type() {
                Ok(file_type) => file_type,
                Err(_) => {
                    report.warnings += 1;
                    continue;
                }
            };
            if file_type.is_symlink() {
                continue;
            }
            if file_type.is_dir() {
                let path = entry.path();
                match fs::symlink_metadata(&path) {
                    Ok(metadata) if is_reparse_point(&metadata) => continue,
                    Err(_) => {
                        report.warnings += 1;
                        continue;
                    }
                    _ => {}
                }
                if depth < MAX_DEPTH {
                    folders.push_back((path, depth + 1));
                } else {
                    report.truncated = true;
                }
            } else if file_type.is_file() && likely_game_executable(&entry.path()) {
                let path = entry.path();
                let normalized = path.to_string_lossy().to_lowercase();
                if seen.insert(normalized) {
                    let title = path
                        .file_stem()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .replace(['_', '-'], " ");
                    report.candidates.push(Candidate {
                        title,
                        executable_path: path.to_string_lossy().into_owned(),
                    });
                }
            }
        }
        if report.cancelled
            || report.truncated
                && (report.entries_checked >= MAX_ENTRIES
                    || report.candidates.len() >= MAX_CANDIDATES)
        {
            break;
        }
    }
    report
        .candidates
        .sort_by_key(|candidate| candidate.title.to_lowercase());
    progress(report.entries_checked);
    Ok(report)
}

fn likely_game_executable(path: &Path) -> bool {
    if !path
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("exe"))
    {
        return false;
    }
    let stem = path
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();
    let excluded = [
        "setup",
        "install",
        "unins",
        "uninstall",
        "updat",
        "patch",
        "crash",
        "unitycrash",
        "report",
        "redist",
        "dxsetup",
        "vc_redist",
        "vcredist",
        "bootstrap",
        "support",
    ];
    !excluded.iter().any(|prefix| stem.starts_with(prefix))
}

#[cfg(windows)]
fn is_reparse_point(metadata: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
    metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
}

#[cfg(not(windows))]
fn is_reparse_point(metadata: &fs::Metadata) -> bool {
    metadata.file_type().is_symlink()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicBool;

    #[test]
    fn finds_nested_executables_and_skips_installers() {
        let root = std::env::temp_dir().join(format!("lezu-scan-test-{}", uuid::Uuid::new_v4()));
        let nested = root.join("Games").join("Éxample 游戏");
        fs::create_dir_all(&nested).unwrap();
        for name in [
            "My_Game.exe",
            "setup.exe",
            "unins000.exe",
            "UnityCrashHandler64.exe",
        ] {
            fs::write(nested.join(name), b"fixture").unwrap();
        }
        let report = scan_folder(&root, &AtomicBool::new(false)).unwrap();
        assert_eq!(report.candidates.len(), 1);
        assert!(report
            .candidates
            .iter()
            .any(|candidate| candidate.title == "My Game"));
        assert!(!report.truncated);
        assert_eq!(report.warnings, 0);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn cancelled_scan_stops_without_candidates() {
        let root = std::env::temp_dir().join(format!("lezu-scan-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        fs::write(root.join("Game.exe"), b"fixture").unwrap();
        let report = scan_folder(&root, &AtomicBool::new(true)).unwrap();
        assert!(report.cancelled);
        assert!(report.candidates.is_empty());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn depth_limit_reports_partial_results() {
        let root = std::env::temp_dir().join(format!("lezu-scan-test-{}", uuid::Uuid::new_v4()));
        let mut nested = root.clone();
        for _ in 0..=MAX_DEPTH {
            nested = nested.join("deeper");
        }
        fs::create_dir_all(&nested).unwrap();
        fs::write(nested.join("TooDeep.exe"), b"fixture").unwrap();
        let report = scan_folder(&root, &AtomicBool::new(false)).unwrap();
        assert!(report.truncated);
        assert!(report.candidates.is_empty());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn only_one_scan_can_hold_the_permit() {
        let coordinator = ScanCoordinator::default();
        let first = coordinator.begin().expect("first scan starts");
        assert!(coordinator.begin().is_none());
        coordinator.cancel();
        assert!(first.cancelled().load(Ordering::Acquire));
        drop(first);
        assert!(coordinator.begin().is_some());
    }
}
