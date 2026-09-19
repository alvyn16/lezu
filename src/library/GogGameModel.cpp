#include "library/GogGameModel.h"

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

GogGameModel::GogGameModel(const QString& databasePath, QObject* parent)
    : QAbstractListModel(parent),
      m_connectionName(QStringLiteral("lezu-gog-%1").arg(reinterpret_cast<quintptr>(this))) {
  connect(&m_scanWatcher, &QFutureWatcher<GogWindowsScanResult>::finished, this, [this] {
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

GogGameModel::~GogGameModel() {
  if (m_scanWatcher.isRunning()) {
    m_scanWatcher.cancel();
    m_scanWatcher.waitForFinished();
  }
  if (m_database.isOpen()) {
    m_database.close();
  }
  QSqlDatabase::removeDatabase(m_connectionName);
}

bool GogGameModel::openDatabase(const QString& path) {
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

bool GogGameModel::ensureSchema() {
  if (!m_database.isOpen()) {
    return false;
  }
  QSqlQuery query(m_database);
  return query.exec(QStringLiteral(
      "CREATE TABLE IF NOT EXISTS gog_games ("
      "  game_id TEXT PRIMARY KEY,"
      "  title TEXT NOT NULL,"
      "  install_directory TEXT NOT NULL,"
      "  executable_path TEXT,"
      "  arguments TEXT,"
      "  icon_path TEXT,"
      "  galaxy_launch_command TEXT,"
      "  favorite INTEGER NOT NULL DEFAULT 0,"
      "  hidden INTEGER NOT NULL DEFAULT 0,"
      "  observed_at INTEGER NOT NULL DEFAULT 0"
      ")"));
}

void GogGameModel::loadDatabase() {
  if (!m_database.isOpen()) {
    return;
  }
  QSqlQuery query(m_database);
  if (!query.exec(QStringLiteral(
          "SELECT game_id, title, install_directory, executable_path, arguments, "
          "       icon_path, galaxy_launch_command, favorite, hidden, observed_at "
          "FROM gog_games WHERE observed_at > 0 ORDER BY title COLLATE NOCASE ASC"))) {
    setStatus(QStringLiteral("Could not read cached GOG games"), query.lastError().text());
    return;
  }

  beginResetModel();
  m_games.clear();
  m_lastScan = 0;
  while (query.next()) {
    GogWindowsGameRecord record;
    record.gameId = query.value(0).toString();
    record.title = query.value(1).toString();
    record.installDirectory = query.value(2).toString();
    record.executablePath = query.value(3).toString();
    record.arguments = query.value(4).toString();
    record.icon_path = query.value(5).toString();
    record.galaxyLaunchCommand = query.value(6).toString();

    Game game;
    game.gog = record;
    game.favorite = query.value(7).toBool();
    game.hidden = query.value(8).toBool();
    game.accentStart = colorFor(record.gameId, 0);
    game.accentEnd = colorFor(record.gameId, 8);
    m_games.append(game);

    const qint64 observedAt = query.value(9).toLongLong();
    if (observedAt > m_lastScan) {
      m_lastScan = observedAt;
    }
  }
  endResetModel();

  m_gogDetected = !m_games.isEmpty();
  if (m_lastScan > 0) {
    m_statusText = QStringLiteral("Loaded cached GOG library");
  }
}

void GogGameModel::applyScan(const GogWindowsScanResult& result) {
  if (!m_database.isOpen() || !m_database.transaction()) {
    setStatus(QStringLiteral("Could not update GOG games"), m_database.lastError().text());
    return;
  }

  const qint64 scanTimestamp = QDateTime::currentSecsSinceEpoch();
  QSqlQuery query(m_database);
  bool okay = query.exec(QStringLiteral("UPDATE gog_games SET observed_at = 0"));

  query.prepare(QStringLiteral(
      "INSERT INTO gog_games (game_id, title, install_directory, executable_path, "
      "                       arguments, icon_path, galaxy_launch_command, observed_at) "
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?) "
      "ON CONFLICT(game_id) DO UPDATE SET "
      "  title = excluded.title, "
      "  install_directory = excluded.install_directory, "
      "  executable_path = excluded.executable_path, "
      "  arguments = excluded.arguments, "
      "  icon_path = excluded.icon_path, "
      "  galaxy_launch_command = excluded.galaxy_launch_command, "
      "  observed_at = excluded.observed_at"));

  for (const GogWindowsGameRecord& game : result.games) {
    query.bindValue(0, game.gameId);
    query.bindValue(1, game.title);
    query.bindValue(2, game.installDirectory);
    query.bindValue(3, game.executablePath);
    query.bindValue(4, game.arguments);
    query.bindValue(5, game.icon_path);
    query.bindValue(6, game.galaxyLaunchCommand);
    query.bindValue(7, scanTimestamp);
    okay = okay && query.exec();
  }

  if (!okay || !m_database.commit()) {
    m_database.rollback();
    setStatus(QStringLiteral("Could not save GOG games"), m_database.lastError().text());
    return;
  }

  loadDatabase();
  m_detectedPaths = result.scannedRoots;
  m_lastScan = scanTimestamp;
  m_gogDetected = !result.games.isEmpty();
  setStatus(!result.games.isEmpty()
                ? QStringLiteral("Imported %1 GOG title(s)").arg(result.games.size())
                : QStringLiteral("GOG was not found"),
            result.warnings.join(QLatin1Char('\n')));
}

int GogGameModel::rowCount(const QModelIndex& parent) const {
  return parent.isValid() ? 0 : m_games.size();
}

QVariant GogGameModel::data(const QModelIndex& index, int role) const {
  if (!index.isValid() || index.row() < 0 || index.row() >= m_games.size()) {
    return {};
  }
  return valueForRole(m_games.at(index.row()), role);
}

QHash<int, QByteArray> GogGameModel::roleNames() const {
  return GameRoles::names();
}

bool GogGameModel::gogDetected() const { return m_gogDetected; }
QString GogGameModel::statusText() const { return m_statusText; }
QString GogGameModel::errorText() const { return m_errorText; }
QStringList GogGameModel::detectedPaths() const { return m_detectedPaths; }
qint64 GogGameModel::lastScan() const { return m_lastScan; }

void GogGameModel::setLibraryPaths(const QStringList& paths) {
  m_customRoots = paths;
}

void GogGameModel::toggleFavorite(int row) {
  if (row < 0 || row >= m_games.size() || !m_database.isOpen()) {
    return;
  }
  Game& game = m_games[row];
  game.favorite = !game.favorite;
  QSqlQuery query(m_database);
  query.prepare(QStringLiteral("UPDATE gog_games SET favorite = ? WHERE game_id = ?"));
  query.addBindValue(game.favorite);
  query.addBindValue(game.gog.gameId);
  if (!query.exec()) {
    game.favorite = !game.favorite;
    setStatus(m_statusText, query.lastError().text());
    return;
  }
  emit dataChanged(index(row), index(row), {GameRoles::Favorite});
}

void GogGameModel::toggleHidden(int row) {
  if (row < 0 || row >= m_games.size() || !m_database.isOpen()) {
    return;
  }
  Game& game = m_games[row];
  game.hidden = !game.hidden;
  QSqlQuery query(m_database);
  query.prepare(QStringLiteral("UPDATE gog_games SET hidden = ? WHERE game_id = ?"));
  query.addBindValue(game.hidden);
  query.addBindValue(game.gog.gameId);
  if (!query.exec()) {
    game.hidden = !game.hidden;
    setStatus(m_statusText, query.lastError().text());
    return;
  }
  emit dataChanged(index(row), index(row), {GameRoles::Hidden});
}

void GogGameModel::refresh() {
  if (m_scanWatcher.isRunning()) {
    m_refreshPending = true;
    return;
  }
  m_scanning = true;
  setStatus(QStringLiteral("Scanning GOG library"));
  const QStringList extra = m_customRoots;
  m_scanWatcher.setFuture(QtConcurrent::run([extra] {
    return GogWindowsScanner::scan(extra);
  }));
}

QVariant GogGameModel::valueForRole(const Game& game, int role) const {
  switch (role) {
  case GameRoles::Title:
    return game.gog.title;
  case GameRoles::Subtitle:
    return QStringLiteral("GOG");
  case GameRoles::Description:
    return QStringLiteral("Installed GOG title.");
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
    return game.gog.title.left(1).toUpper();
  case GameRoles::AppId:
    return game.gog.gameId;
  case GameRoles::CoverPath:
    return localUrl(game.gog.icon_path);
  case GameRoles::HeroPath:
  case GameRoles::LogoPath:
    return QString{};
  case GameRoles::InstallPath:
    return game.gog.installDirectory;
  case GameRoles::LaunchTarget:
    return game.gog.executablePath;
  case GameRoles::Installed:
    return true;
  case GameRoles::Source:
    return QStringLiteral("GOG");
  case GameRoles::Runner:
    return QStringLiteral("gog");
  case GameRoles::Flatpak:
    return false;
  case GameRoles::Hidden:
    return game.hidden;
  default:
    return {};
  }
}

void GogGameModel::setStatus(const QString& status, const QString& error) {
  m_statusText = status;
  m_errorText = error;
  emit statusChanged();
}
