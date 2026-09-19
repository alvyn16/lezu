#include "platform/windows/WinSessionWorker.h"

#include <QDateTime>
#include <QDebug>
#include <QUuid>

#include "tracking/ProcFs.h"

WinSessionWorker::WinSessionWorker(const QString& databasePath,
                                   const QString& profilesPath,
                                   QObject* parent)
    : QObject(parent),
      m_databasePath(databasePath),
      m_profilesPath(profilesPath),
      m_connectionName(QStringLiteral("lezu-worker-%1").arg(QUuid::createUuid().toString())) {}

WinSessionWorker::~WinSessionWorker() {
  stop();
}

void WinSessionWorker::start() {
  if (m_thread != nullptr) {
    return;
  }

  // Load emulator profiles from JSON
  QString loadError;
  m_profiles = ProcessMatcher::load(m_profilesPath, &loadError);
  if (!loadError.isEmpty()) {
    qWarning() << "Could not load session tracking profiles:" << loadError;
  }

  m_thread = new QThread(this);
  this->moveToThread(m_thread);

  connect(m_thread, &QThread::started, this, [this] {
    // Open worker connection to SQLite database
    if (SessionDatabase::open(m_database, m_databasePath, m_connectionName)) {
      m_recorder = new SessionRecorder(m_database);
      const qint64 now = QDateTime::currentSecsSinceEpoch();
      const QVector<ProcessSnapshot> procs = ProcFs::listProcesses();
      m_recorder->recover(procs, m_profiles, now);
    }

    m_pollTimer = new QTimer();
    m_pollTimer->setInterval(15000); // 15-second polling interval
    connect(m_pollTimer, &QTimer::timeout, this, &WinSessionWorker::poll);
    m_pollTimer->start();
  });

  m_thread->start();
}

void WinSessionWorker::stop() {
  if (m_thread == nullptr) {
    return;
  }

  if (m_pollTimer != nullptr) {
    m_pollTimer->stop();
    delete m_pollTimer;
    m_pollTimer = nullptr;
  }

  if (m_recorder != nullptr) {
    const qint64 now = QDateTime::currentSecsSinceEpoch();
    m_recorder->endAll(now);
    delete m_recorder;
    m_recorder = nullptr;
  }

  if (m_database.isOpen()) {
    m_database.close();
  }
  QSqlDatabase::removeDatabase(m_connectionName);

  m_thread->quit();
  m_thread->wait();
  delete m_thread;
  m_thread = nullptr;
}

void WinSessionWorker::poll() {
  if (m_recorder == nullptr) {
    return;
  }

  const qint64 now = QDateTime::currentSecsSinceEpoch();
  const QVector<ProcessSnapshot> procs = ProcFs::listProcesses();
  const QVector<SessionMatch> matches = ProcessMatcher::match(procs, m_profiles);

  m_recorder->sync(matches, now);

  const QStringList rescans = m_recorder->takeRescanRequests();
  for (const QString& source : rescans) {
    emit sessionEnded(source, 0);
  }
}
