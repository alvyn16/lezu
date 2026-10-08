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
        assert_eq!(version, 1);
    }
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
