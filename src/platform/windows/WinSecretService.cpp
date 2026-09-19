// Windows Credential Manager implementation.
// Wraps CredWriteW / CredReadW / CredDeleteW from wincred.h.
// Credentials are stored as CRED_TYPE_GENERIC with a target name of
// "Lezu/<service>/<account>" so they appear clearly in the Windows
// Credential Manager UI (Control Panel → Credential Manager → Windows Credentials).

#include "platform/windows/WinSecretService.h"

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <wincred.h>

#include <QMutexLocker>

namespace {

// Build the target name used as the credential key.
static std::wstring targetName(const QString& service, const QString& account) {
    const QString name = QStringLiteral("Lezu/%1/%2").arg(service, account);
    return name.toStdWString();
}

} // namespace

namespace WinSecretService {

bool store(const QString& service, const QString& account, const QString& secret) {
    QMutexLocker locker(&winSecretMutex());

    const std::wstring target = targetName(service, account);
    const std::wstring secretW = secret.toStdWString();

    CREDENTIALW cred{};
    cred.Type               = CRED_TYPE_GENERIC;
    cred.TargetName         = const_cast<LPWSTR>(target.c_str());
    cred.CredentialBlobSize = static_cast<DWORD>(secretW.size() * sizeof(wchar_t));
    cred.CredentialBlob     = reinterpret_cast<LPBYTE>(
                                  const_cast<wchar_t*>(secretW.c_str()));
    cred.Persist            = CRED_PERSIST_LOCAL_MACHINE;
    cred.UserName           = const_cast<LPWSTR>(L"lezu");

    return CredWriteW(&cred, 0) == TRUE;
}

QString load(const QString& service, const QString& account) {
    QMutexLocker locker(&winSecretMutex());

    const std::wstring target = targetName(service, account);

    PCREDENTIALW pCred = nullptr;
    if (!CredReadW(target.c_str(), CRED_TYPE_GENERIC, 0, &pCred) || !pCred) {
        return {};
    }

    const QString result = QString::fromWCharArray(
        reinterpret_cast<const wchar_t*>(pCred->CredentialBlob),
        static_cast<int>(pCred->CredentialBlobSize / sizeof(wchar_t)));

    CredFree(pCred);
    return result;
}

void remove(const QString& service, const QString& account) {
    QMutexLocker locker(&winSecretMutex());
    const std::wstring target = targetName(service, account);
    CredDeleteW(target.c_str(), CRED_TYPE_GENERIC, 0);
}

} // namespace WinSecretService
