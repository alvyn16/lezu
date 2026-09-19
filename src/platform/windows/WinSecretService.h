#pragma once

// Windows implementation of the SecretService abstraction.
// On Linux, LEZU uses libsecret (GNOME Keyring / KWallet via Secret Service).
// On Windows we use the Windows Credential Manager (wincred) which persists
// credentials in the user's encrypted vault (DPAPI-backed storage).
//
// Usage pattern is identical to the Linux SecretService:
//   WinSecretService::store("steam", "web-api-key", key);
//   QString key = WinSecretService::load("steam", "web-api-key");
//   WinSecretService::remove("steam", "web-api-key");
//
// Thread safety: callers are responsible for serialisation. In AppSettings.cpp
// a QRecursiveMutex (matching SecretService.h) guards all credential calls.

#include <QRecursiveMutex>
#include <QString>

// One mutex for the whole process — multiple services (Steam, IGDB,
// RetroAchievements, SteamGridDB) read credentials concurrently on startup.
// Windows Credential Manager API is not thread-safe for concurrent schema
// initialisation, so we serialise all calls through this lock.
inline QRecursiveMutex& winSecretMutex() {
    static QRecursiveMutex mutex;
    return mutex;
}

namespace WinSecretService {

// Store a plaintext secret in the Windows Credential Manager.
// The credential is keyed by "<service>/<account>" and stored as a
// CRED_TYPE_GENERIC credential in the current user's vault.
// Returns true on success.
bool store(const QString& service, const QString& account, const QString& secret);

// Load a previously stored secret. Returns a null QString if not found.
QString load(const QString& service, const QString& account);

// Remove a stored credential. No-op if it does not exist.
void remove(const QString& service, const QString& account);

} // namespace WinSecretService
