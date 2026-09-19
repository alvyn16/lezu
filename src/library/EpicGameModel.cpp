#include "library/EpicGameModel.h"

#include "library/DatabaseTuning.h"
#include "library/GameRoles.h"

#include <QCryptographicHash>
#include <QDateTime>
#include <QDir>
#include <QFileInfo>
#include <QSqlError>
#include <QSqlQuery>
#include <QUrl>
#include <QtConcurrent>

namespace {
QColor colorFor(const QString& key, int offset) {
  const QByteArray hash = QCryptographicHash::hash(key.toUtf8(), QCryptographicHash::Sha256);
  return QColor::fromHsl((static_cast<unsigned char>(hash.at(offset)) * 359) / 255, 115,
                         offset == 0 ? 105 : 72);
}

QString localUrl(const QString& path) {
  return path.isEmpty() ? QString{} : QUrl::fromLocalFile(path).toString();
}
} // namespace

EpicGameModel::EpicGameModel(const QString& databasePath, QObject* parent)
    : QAbstractListModel(parent),
      m_connectionName(QStringLiteral("lezu-epic-%1").arg(reinterpret_cast<quintptr>(this))) {
  connect(&m_scanWatcher, &QFutureWatcher<EpicScanResult>::finished, this, [this] {
    m_scanning = false;
    applyScan(m_scanWatcher.result());
    emit statusChanged();
    if (m_refreshPending) {
      m_refreshPending = false;
      refresh();
    }
  });

  if (openDatabase(databasePath)) {
    ensureSchema();
    loadDatabase();
  }
}

EpicGameModel::~EpicGameModel() {
  if (m_scanWatcher.isRunning()) {
    m_scanWatcher.cancel();
    m_scanWatcher.waitForFinished();
  }
  if (m_database.isOpen()) {
    m_database.close();
  }
  QSqlDatabase::removeDatabase(m_connectionName);
}

bool EpicGameModel::openDatabase(const QString& path) {
  if (path.isEmpty()) {
    return false;
  }
  m_database = QSqlDatabase::addDatabase(QStringLiteral("QSQLITE"), m_connectionName);
  m_database.setDatabaseName(path);
  if (!m_database.open()) {
    setStatus(QStringLiteral("Could not open database"), m_database.lastError().text());
    return false;
  }
  DatabaseTuning::tune(m_database);
  return true;
}

bool EpicGameModel::ensureSchema() {
  if (!m_database.isOpen()) {
    return false;
  }
  QSqlQuery query(m_database);
  return query.exec(QStringLiteral(
      "CREATE TABLE IF NOT EXISTS epic_games ("
      "  app_id TEXT PRIMARY KEY,"
      "  title TEXT NOT NULL,"
      "  install_location TEXT NOT NULL,"
      "  launch_executable TEXT,"
      "  catalog_item_id TEXT,"
      "  manifest_path TEXT,"
      "  launch_url TEXT,"
      "  favorite INTEGER NOT NULL DEFAULT 0,"
      "  hidden INTEGER NOT NULL DEFAULT 0,"
      "  observed_at INTEGER NOT NULL DEFAULT 0"
      ")"));
}

void EpicGameModel::loadDatabase() {
  if (!m_database.isOpen()) {
    return;
  }
  QSqlQuery query(m_database);
  if (!query.exec(QStringLiteral(
          "SELECT app_id, title, install_location, launch_executable, catalog_item_id, "
          "       manifest_path, launch_url, favorite, hidden, observed_at "
          "FROM epic_games WHERE observed_at > 0 ORDER BY title COLLATE NOCASE ASC"))) {
    setStatus(QStringLiteral("Could not read cached Epic games"), query.lastError().text());
    return;
  }

  beginResetModel();
  m_games.clear();
  m_lastScan = 0;
  while (query.next()) {
    EpicGameRecord record;
    record.appName = query.value(0).toString();
    record.title = query.value(1).toString();
    record.installLocation = query.value(2).toString();
    record.launchExecutable = query.value(3).toString();
    record.catalogItemId = query.value(4).toString();
    record.manifestPath = query.value(5).toString();
    record.launchUrl = query.value(6).toString();

    Game game;
    game.epic = record;
    game.favorite = query.value(7).toBool();
    game.hidden = query.value(8).toBool();
    game.accentStart = colorFor(record.appName, 0);
    game.accentEnd = colorFor(record.appName, 8);
    m_games.append(game);

    const qint64 observedAt = query.value(9).toLongLong();
    if (observedAt > m_lastScan) {
      m_lastScan = observedAt;
    }
  }
  endResetModel();

  m_epicDetected = !m_games.isEmpty();
  if (m_lastScan > 0) {
    m_statusText = QStringLiteral("Loaded cached Epic Games library");
  }
}

void EpicGameModel::applyScan(const EpicScanResult& result) {
  if (!m_database.isOpen() || !m_database.transaction()) {
    setStatus(QStringLiteral("Could not update Epic games"), m_database.lastError().text());
    return;
  }

  const qint64 scanTimestamp = QDateTime::currentSecsSinceEpoch();
  QSqlQuery query(m_database);
  bool okay = query.exec(QStringLiteral("UPDATE epic_games SET observed_at = 0"));

  query.prepare(QStringLiteral(
      "INSERT INTO epic_games (app_id, title, install_location, launch_executable, "
      "                        catalog_item_id, manifest_path, launch_url, observed_at) "
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?) "
      "ON CONFLICT(app_id) DO UPDATE SET "
      "  title = excluded.title, "
      "  install_location = excluded.install_location, "
      "  launch_executable = excluded.launch_executable, "
      "  catalog_item_id = excluded.catalog_item_id, "
      "  manifest_path = excluded.manifest_path, "
      "  launch_url = excluded.launch_url, "
      "  observed_at = excluded.observed_at"));

  for (const EpicGameRecord& game : result.games) {
    query.bindValue(0, game.appName);
    query.bindValue(1, game.title);
    query.bindValue(2, game.installLocation);
    query.bindValue(3, game.launchExecutable);
    query.bindValue(4, game.catalogItemId);
    query.bindValue(5, game.manifestPath);
    query.bindValue(6, game.launchUrl);
    query.bindValue(7, scanTimestamp);
    okay = okay && query.exec();
  }

  if (!okay || !m_database.commit()) {
    m_database.rollback();
    setStatus(QStringLiteral("Could not save Epic games"), m_database.lastError().text());
    return;
  }

  loadDatabase();
  m_detectedPaths = {result.manifestsPath};
  m_lastScan = scanTimestamp;
  m_epicDetected = !result.games.isEmpty();
  setStatus(!result.games.isEmpty()
                ? QStringLiteral("Imported %1 Epic Games title(s)").arg(result.games.size())
                : QStringLiteral("Epic Games Launcher was not found"),
            result.warnings.join(QLatin1Char('\n')));
}

int EpicGameModel::rowCount(const QModelIndex& parent) const {
  return parent.isValid() ? 0 : m_games.size();
}

QVariant EpicGameModel::data(const QModelIndex& index, int role) const {
  if (!index.isValid() || index.row() < 0 || index.row() >= m_games.size()) {
    return {};
  }
  return valueForRole(m_games.at(index.row()), role);
}

QHash<int, QByteArray> EpicGameModel::roleNames() const {
  return GameRoles::names();
}

bool EpicGameModel::epicDetected() const { return m_epicDetected; }
QString EpicGameModel::statusText() const { return m_statusText; }
QString EpicGameModel::errorText() const { return m_errorText; }
QStringList EpicGameModel::detectedPaths() const { return m_detectedPaths; }
qint64 EpicGameModel::lastScan() const { return m_lastScan; }

void EpicGameModel::toggleFavorite(int row) {
  if (row < 0 || row >= m_games.size() || !m_database.isOpen()) {
    return;
  }
  Game& game = m_games[row];
  game.favorite = !game.favorite;
  QSqlQuery query(m_database);
  query.prepare(QStringLiteral("UPDATE epic_games SET favorite = ? WHERE app_id = ?"));
  query.addBindValue(game.favorite);
  query.addBindValue(game.epic.appName);
  if (!query.exec()) {
    game.favorite = !game.favorite;
    setStatus(m_statusText, query.lastError().text());
    return;
  }
  emit dataChanged(index(row), index(row), {GameRoles::Favorite});
}

void EpicGameModel::toggleHidden(int row) {
  if (row < 0 || row >= m_games.size() || !m_database.isOpen()) {
    return;
  }
  Game& game = m_games[row];
  game.hidden = !game.hidden;
  QSqlQuery query(m_database);
  query.prepare(QStringLiteral("UPDATE epic_games SET hidden = ? WHERE app_id = ?"));
  query.addBindValue(game.hidden);
  query.addBindValue(game.epic.appName);
  if (!query.exec()) {
    game.hidden = !game.hidden;
    setStatus(m_statusText, query.lastError().text());
    return;
  }
  emit dataChanged(index(row), index(row), {GameRoles::Hidden});
}

void EpicGameModel::refresh() {
  if (m_scanWatcher.isRunning()) {
    m_refreshPending = true;
    return;
  }
  m_scanning = true;
  setStatus(QStringLiteral("Scanning Epic Games library"));
  m_scanWatcher.setFuture(QtConcurrent::run([] {
    return EpicScanner::scan();
  }));
}

QVariant EpicGameModel::valueForRole(const Game& game, int role) const {
  switch (role) {
  case GameRoles::Title:
    return game.epic.title;
  case GameRoles::Subtitle:
    return QStringLiteral("Epic Games");
  case GameRoles::Description:
    return QStringLiteral("Installed Epic Games title.");
  case GameRoles::Hours:
  case GameRoles::PlaytimeSeconds:
  case GameRoles::Progress:
  case GameRoles::AchievementsUnlocked:
  case GameRoles::AchievementsTotal:
  case GameRoles::Year:
    return 0;
  case GameRoles::Favorite:
    return game.favorite;
  case GameRoles::Recent:
    return false;
  case GameRoles::LastPlayed:
    return 0;
  case GameRoles::AccentStart:
    return game.accentStart;
  case GameRoles::AccentEnd:
    return game.accentEnd;
  case GameRoles::CoverMark:
    return game.epic.title.left(1).toUpper();
  case GameRoles::AppId:
    return game.epic.appName;
  case GameRoles::CoverPath:
  case GameRoles::HeroPath:
  case GameRoles::LogoPath:
    return QString{};
  case GameRoles::InstallPath:
    return game.epic.installLocation;
  case GameRoles::LaunchTarget:
    return game.epic.launchExecutable;
  case GameRoles::Installed:
    return true;
  case GameRoles::Source:
    return QStringLiteral("Epic");
  case GameRoles::Runner:
    return QStringLiteral("epic");
  case GameRoles::Flatpak:
    return false;
  case GameRoles::Hidden:
    return game.hidden;
  default:
    return {};
  }
}

void EpicGameModel::setStatus(const QString& status, const QString& error) {
  m_statusText = status;
  m_errorText = error;
  emit statusChanged();
}
