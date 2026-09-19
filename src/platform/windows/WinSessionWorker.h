#pragma once

#include <QObject>
#include <QThread>
#include <QTimer>
#include <QSqlDatabase>

#include "tracking/ProcessMatcher.h"
#include "tracking/SessionRecorder.h"

// In-process session tracking thread for Windows.
// Eliminates the need for a separate LEZU-sessiond background daemon.
// Periodically snapshots running processes, matches against emulator profiles,
// and records active play sessions directly into the SQLite database.
class WinSessionWorker final : public QObject {
  Q_OBJECT

public:
  explicit WinSessionWorker(const QString& databasePath,
                            const QString& profilesPath,
                            QObject* parent = nullptr);
  ~WinSessionWorker() override;

  // Starts the background worker thread and periodic scanning.
  void start();

  // Stops the worker thread and flushes any active sessions.
  void stop();

public slots:
  void poll();

signals:
  void sessionStarted(const QString& gamePath, const QString& emulator);
  void sessionEnded(const QString& gamePath, int elapsedSeconds);

private:
  QString m_databasePath;
  QString m_profilesPath;
  QString m_connectionName;
  QSqlDatabase m_database;
  ProcessProfileSet m_profiles;
  SessionRecorder* m_recorder = nullptr;
  QThread* m_thread = nullptr;
  QTimer* m_pollTimer = nullptr;
};
