use rusqlite::Connection;
use std::{error::Error, fs, path::Path, sync::Mutex, time::Duration};

pub struct LibraryStore(pub Mutex<Connection>);

impl LibraryStore {
    pub fn open(path: &Path) -> Result<Self, Box<dyn Error>> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut connection = Connection::open(path)?;
        connection.busy_timeout(Duration::from_secs(3))?;
        connection.pragma_update(None, "foreign_keys", "ON")?;
        let version: i64 = connection.pragma_query_value(None, "user_version", |row| row.get(0))?;
        match version {
            0 => {
                let migration = connection.transaction()?;
                migration.execute_batch(
                    "CREATE TABLE games (
                        id TEXT PRIMARY KEY,
                        title TEXT NOT NULL,
                        source TEXT NOT NULL,
                        added_at INTEGER NOT NULL
                    );
                    CREATE TABLE installations (
                        id TEXT PRIMARY KEY,
                        game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                        source TEXT NOT NULL,
                        executable_path TEXT NOT NULL,
                        normalized_path TEXT NOT NULL UNIQUE,
                        working_dir TEXT NOT NULL,
                        install_state TEXT NOT NULL DEFAULT 'installed',
                        last_observed_at INTEGER
                    );
                    CREATE INDEX installations_game_id ON installations(game_id);
                    CREATE TABLE preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                    PRAGMA user_version = 1;",
                )?;
                migration.commit()?;
            }
            1 => {}
            future => {
                return Err(
                    format!("Library schema version {future} is newer than this app").into(),
                )
            }
        }
        Ok(Self(Mutex::new(connection)))
    }
}
