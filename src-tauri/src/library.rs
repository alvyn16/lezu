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
                        last_observed_at INTEGER,
                        store_id TEXT
                    );
                    CREATE INDEX installations_game_id ON installations(game_id);
                    CREATE TABLE preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                    CREATE TABLE artwork (
                        game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                        kind TEXT NOT NULL,
                        mime TEXT NOT NULL,
                        image BLOB NOT NULL,
                        PRIMARY KEY(game_id, kind)
                    );
                    CREATE TABLE owned_games (
                        provider TEXT NOT NULL,
                        provider_id TEXT NOT NULL,
                        game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                        installed INTEGER NOT NULL DEFAULT 0,
                        PRIMARY KEY(provider, provider_id)
                    );
                    PRAGMA user_version = 3;",
                )?;
                migration.commit()?;
            }
            1 => {
                let migration = connection.transaction()?;
                migration.execute_batch(
                    "ALTER TABLE installations ADD COLUMN store_id TEXT;
                     CREATE TABLE artwork (
                         game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                         kind TEXT NOT NULL,
                         mime TEXT NOT NULL,
                         image BLOB NOT NULL,
                         PRIMARY KEY(game_id, kind)
                     );
                     CREATE TABLE owned_games (
                         provider TEXT NOT NULL,
                         provider_id TEXT NOT NULL,
                         game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                         installed INTEGER NOT NULL DEFAULT 0,
                         PRIMARY KEY(provider, provider_id)
                     );
                     PRAGMA user_version = 3;",
                )?;
                migration.commit()?;
            }
            2 => {
                connection.execute_batch(
                    "CREATE TABLE owned_games (
                         provider TEXT NOT NULL,
                         provider_id TEXT NOT NULL,
                         game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                         installed INTEGER NOT NULL DEFAULT 0,
                         PRIMARY KEY(provider, provider_id)
                     );
                     PRAGMA user_version = 3;",
                )?;
            }
            3 => {}
            future => {
                return Err(
                    format!("Library schema version {future} is newer than this app").into(),
                )
            }
        }
        Ok(Self(Mutex::new(connection)))
    }
}
