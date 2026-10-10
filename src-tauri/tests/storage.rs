#[path = "../src/library.rs"]
mod library;

use rusqlite::Connection;

#[test]
fn creates_and_reopens_library_without_losing_records() {
    let path = std::env::temp_dir().join(format!("lezu-storage-{}.db", uuid::Uuid::new_v4()));
    {
        let store = library::LibraryStore::open(&path).unwrap();
        let db = store.0.lock().unwrap();
        db.execute("INSERT INTO preferences VALUES ('selected', 'sifu')", [])
            .unwrap();
    }
    {
        let store = library::LibraryStore::open(&path).unwrap();
        let db = store.0.lock().unwrap();
        let value: String = db
            .query_row(
                "SELECT value FROM preferences WHERE key = 'selected'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(value, "sifu");
        let version: i64 = db
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        assert_eq!(version, 5);
    }
    std::fs::remove_file(path).unwrap();
}

#[test]
fn upgrades_existing_v1_library_without_losing_games() {
    let path = std::env::temp_dir().join(format!("lezu-storage-{}.db", uuid::Uuid::new_v4()));
    let db = Connection::open(&path).unwrap();
    db.execute_batch(
        "CREATE TABLE games (id TEXT PRIMARY KEY, title TEXT NOT NULL, source TEXT NOT NULL, added_at INTEGER NOT NULL);
         CREATE TABLE installations (
             id TEXT PRIMARY KEY, game_id TEXT NOT NULL, source TEXT NOT NULL,
             executable_path TEXT NOT NULL, normalized_path TEXT NOT NULL UNIQUE,
             working_dir TEXT NOT NULL, install_state TEXT NOT NULL,
             last_observed_at INTEGER
         );
         INSERT INTO games VALUES ('old', 'Existing Game', 'manual', 0);
         PRAGMA user_version = 1;",
    ).unwrap();
    drop(db);
    let store = library::LibraryStore::open(&path).unwrap();
    let db = store.0.lock().unwrap();
    let title: String = db
        .query_row("SELECT title FROM games WHERE id = 'old'", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(title, "Existing Game");
    assert_eq!(
        db.pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
            .unwrap(),
        5
    );
    assert!(db.prepare("SELECT store_id FROM installations").is_ok());
    drop(db);
    drop(store);
    std::fs::remove_file(path).unwrap();
}

#[test]
fn upgrades_v2_library_with_owned_game_table() {
    let path = std::env::temp_dir().join(format!("lezu-storage-{}.db", uuid::Uuid::new_v4()));
    let db = Connection::open(&path).unwrap();
    db.execute_batch(
        "CREATE TABLE games (id TEXT PRIMARY KEY, title TEXT NOT NULL, source TEXT NOT NULL, added_at INTEGER NOT NULL);
         INSERT INTO games VALUES ('old', 'Existing Game', 'steam', 0);
         PRAGMA user_version = 2;",
    ).unwrap();
    drop(db);
    let store = library::LibraryStore::open(&path).unwrap();
    let db = store.0.lock().unwrap();
    db.execute(
        "INSERT INTO owned_games(provider,provider_id,game_id) VALUES('steam','123','old')",
        [],
    )
    .unwrap();
    let installed: i64 = db
        .query_row(
            "SELECT installed FROM owned_games WHERE provider_id='123'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(installed, 0);
    let title: String = db
        .query_row("SELECT title FROM games WHERE id='old'", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(title, "Existing Game");
    drop(db);
    drop(store);
    std::fs::remove_file(path).unwrap();
}

#[test]
fn upgrades_v3_artwork_without_losing_images() {
    let path = std::env::temp_dir().join(format!("lezu-storage-{}.db", uuid::Uuid::new_v4()));
    let db = Connection::open(&path).unwrap();
    db.execute_batch(
        "CREATE TABLE artwork (game_id TEXT NOT NULL, kind TEXT NOT NULL, mime TEXT NOT NULL,
          image BLOB NOT NULL, PRIMARY KEY(game_id, kind));
         INSERT INTO artwork VALUES ('game', 'cover', 'image/png', X'89504E47');
         PRAGMA user_version = 3;",
    )
    .unwrap();
    drop(db);
    let store = library::LibraryStore::open(&path).unwrap();
    let db = store.0.lock().unwrap();
    let (source, image): (String, Vec<u8>) = db
        .query_row(
            "SELECT source_type, image FROM artwork WHERE game_id='game' AND kind='cover'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    assert_eq!(source, "legacy");
    assert_eq!(image, [0x89, 0x50, 0x4e, 0x47]);
    drop(db);
    drop(store);
    std::fs::remove_file(path).unwrap();
}

#[test]
fn refuses_unknown_schema_without_modifying_it() {
    let path = std::env::temp_dir().join(format!("lezu-storage-{}.db", uuid::Uuid::new_v4()));
    let db = Connection::open(&path).unwrap();
    db.execute_batch("PRAGMA user_version = 42; CREATE TABLE preserve_me (id INTEGER);")
        .unwrap();
    drop(db);
    let message = library::LibraryStore::open(&path)
        .err()
        .unwrap()
        .to_string();
    assert!(message.contains("newer"));
    let db = Connection::open(&path).unwrap();
    let version: i64 = db
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap();
    assert_eq!(version, 42);
    drop(db);
    std::fs::remove_file(path).unwrap();
}

#[test]
fn reopening_marks_active_download_interrupted_and_keeps_history() {
    let path = std::env::temp_dir().join(format!("lezu-storage-{}.db", uuid::Uuid::new_v4()));
    {
        let store = library::LibraryStore::open(&path).unwrap();
        let db = store.0.lock().unwrap();
        db.execute(
            "INSERT INTO download_history(id,game_id,title,provider,destination,status,started_at)
                    VALUES('job','game','Example','gog','C:\\Games','downloading',1)",
            [],
        )
        .unwrap();
    }
    {
        let store = library::LibraryStore::open(&path).unwrap();
        let db = store.0.lock().unwrap();
        let status: String = db
            .query_row(
                "SELECT status FROM download_history WHERE id='job'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(status, "interrupted");
    }
    std::fs::remove_file(path).unwrap();
}
