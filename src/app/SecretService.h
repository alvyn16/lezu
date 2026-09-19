#pragma once

#include <QRecursiveMutex>

// One lock for every keyring call in the process.
inline QRecursiveMutex& secretServiceLock() {
  static QRecursiveMutex lock;
  return lock;
}

#ifdef Q_OS_WIN
#include <cstdlib>
#include <cstring>
#include <cstdarg>
#include <QString>
#include "platform/windows/WinSecretService.h"

struct SecretSchema {
  char* name = nullptr;
};

using gchar = char;
using gboolean = int;

struct GError {
  char* message = nullptr;
};

#define SECRET_SCHEMA_NONE 0
#define SECRET_SCHEMA_ATTRIBUTE_STRING 0
#define SECRET_COLLECTION_DEFAULT nullptr

inline SecretSchema* secret_schema_new(const char* name, int /*flags*/, ...) {
  auto* schema = new SecretSchema();
  schema->name = (name != nullptr) ? _strdup(name) : nullptr;
  return schema;
}

inline void secret_schema_unref(SecretSchema* schema) {
  if (schema != nullptr) {
    if (schema->name != nullptr) {
      free(schema->name);
    }
    delete schema;
  }
}

inline void g_error_free(GError* error) {
  if (error != nullptr) {
    if (error->message != nullptr) {
      free(error->message);
    }
    delete error;
  }
}

inline void secret_password_free(gchar* password) {
  if (password != nullptr) {
    free(password);
  }
}

inline gchar* secret_password_lookup_sync(const SecretSchema* schema, void* /*cancellable*/,
                                         GError** error, const char* /*attribute1*/,
                                         const char* value1, ...) {
  if (error != nullptr) {
    *error = nullptr;
  }
  const QString service = (schema != nullptr && schema->name != nullptr) ? QString::fromUtf8(schema->name) : QString();
  const QString account = (value1 != nullptr) ? QString::fromUtf8(value1) : QString();
  const QString secret = WinSecretService::load(service, account);
  if (secret.isNull()) {
    return nullptr;
  }
  const QByteArray utf8 = secret.toUtf8();
  return _strdup(utf8.constData());
}

inline gboolean secret_password_store_sync(const SecretSchema* schema, const char* /*collection*/,
                                          const char* /*label*/, const char* password,
                                          void* /*cancellable*/, GError** error,
                                          const char* /*attribute1*/, const char* value1, ...) {
  if (error != nullptr) {
    *error = nullptr;
  }
  const QString service = (schema != nullptr && schema->name != nullptr) ? QString::fromUtf8(schema->name) : QString();
  const QString account = (value1 != nullptr) ? QString::fromUtf8(value1) : QString();
  const QString secretStr = (password != nullptr) ? QString::fromUtf8(password) : QString();
  bool ok = WinSecretService::store(service, account, secretStr);
  if (!ok && error != nullptr) {
    *error = new GError{_strdup("Windows Credential Manager store failed")};
  }
  return ok ? 1 : 0;
}

inline gboolean secret_password_clear_sync(const SecretSchema* schema, void* /*cancellable*/,
                                          GError** error, const char* /*attribute1*/,
                                          const char* value1, ...) {
  if (error != nullptr) {
    *error = nullptr;
  }
  const QString service = (schema != nullptr && schema->name != nullptr) ? QString::fromUtf8(schema->name) : QString();
  const QString account = (value1 != nullptr) ? QString::fromUtf8(value1) : QString();
  WinSecretService::remove(service, account);
  return 1;
}
#endif
