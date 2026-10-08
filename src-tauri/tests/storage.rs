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
        assert_eq!(version, 2);
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
        2
    );
    assert!(db.prepare("SELECT store_id FROM installations").is_ok());
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
