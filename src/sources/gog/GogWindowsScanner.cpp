#include "sources/gog/GogWindowsScanner.h"

#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QProcess>
#include <QSet>
#include <QSettings>

#ifdef Q_OS_WIN
#include "platform/windows/WinPaths.h"
#endif

namespace {

void parseInfoFile(const QString& infoFilePath, const QString& gameDir,
                   QVector<GogWindowsGameRecord>& outGames, QSet<QString>& seenIds) {
  QFile file(infoFilePath);
  if (!file.open(QIODevice::ReadOnly | QIODevice::Text)) {
    return;
  }

  const QJsonDocument doc = QJsonDocument::fromJson(file.readAll());
  if (!doc.isObject()) {
    return;
  }

  const QJsonObject obj = doc.object();
  const QString gameId = obj.value(QStringLiteral("gameId")).toString();
  if (gameId.isEmpty() || seenIds.contains(gameId)) {
    return;
  }

  const QString name = obj.value(QStringLiteral("name")).toString();
  QString primaryExe;
  QString primaryArgs;

  const QJsonArray playTasks = obj.value(QStringLiteral("playTasks")).toArray();
  for (const auto& taskVal : playTasks) {
    const QJsonObject task = taskVal.toObject();
    if (task.value(QStringLiteral("isPrimary")).toBool(false) ||
        (primaryExe.isEmpty() && task.value(QStringLiteral("type")).toString() == QStringLiteral("FileTask"))) {
      primaryExe = QDir::fromNativeSeparators(task.value(QStringLiteral("path")).toString());
      primaryArgs = task.value(QStringLiteral("arguments")).toString();
      if (task.value(QStringLiteral("isPrimary")).toBool(false)) {
        break;
      }
    }
  }

  if (primaryExe.isEmpty()) {
    return;
  }

  GogWindowsGameRecord record;
  record.gameId = gameId;
  record.title = name;
  record.installDirectory = QDir::cleanPath(gameDir);
  record.executablePath = QDir(gameDir).absoluteFilePath(primaryExe);
  record.arguments = primaryArgs;
  record.galaxyLaunchCommand = QStringLiteral("/command=runGame /gameId=%1").arg(gameId);

  seenIds.insert(gameId);
  outGames.append(record);
}

} // namespace

GogWindowsScanResult GogWindowsScanner::scan(const QStringList& extraRoots) {
  GogWindowsScanResult result;
  QSet<QString> seenIds;

#ifdef Q_OS_WIN
  // 1. Scan Windows Registry (both 64-bit and 32-bit views)
  const QStringList registryKeys = {
      QStringLiteral("HKEY_LOCAL_MACHINE\\SOFTWARE\\GOG.com\\Games"),
      QStringLiteral("HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\GOG.com\\Games"),
      QStringLiteral("HKEY_CURRENT_USER\\Software\\GOG.com\\Games"),
  };

  for (const QString& regKey : registryKeys) {
    QSettings settings(regKey, QSettings::NativeFormat);
    const QStringList gameKeys = settings.childGroups();
    for (const QString& key : gameKeys) {
      settings.beginGroup(key);
      const QString gameId = settings.value(QStringLiteral("gameID"), key).toString();
      const QString gameName = settings.value(QStringLiteral("gameName")).toString();
      const QString path = QDir::fromNativeSeparators(settings.value(QStringLiteral("path")).toString());
      QString exe = QDir::fromNativeSeparators(settings.value(QStringLiteral("exe")).toString());
      const QString launchCmd = QDir::fromNativeSeparators(settings.value(QStringLiteral("launchCommand")).toString());
      const QString launchParam = settings.value(QStringLiteral("launchParam")).toString();
      settings.endGroup();

      if (path.isEmpty() || !QDir(path).exists() || seenIds.contains(gameId)) {
        continue;
      }

      if (exe.isEmpty() && !launchCmd.isEmpty()) {
        exe = launchCmd;
      } else if (!exe.isEmpty() && !QDir::isAbsolutePath(exe)) {
        exe = QDir(path).absoluteFilePath(exe);
      }

      GogWindowsGameRecord record;
      record.gameId = gameId;
      record.title = gameName;
      record.installDirectory = path;
      record.executablePath = exe;
      record.arguments = launchParam;
      record.galaxyLaunchCommand = QStringLiteral("/command=runGame /gameId=%1").arg(gameId);

      seenIds.insert(gameId);
      result.games.append(record);
    }
  }
#endif

  // 2. Scan standard and extra game directories for goggame-*.info files
  QStringList searchRoots = extraRoots;
#ifdef Q_OS_WIN
  searchRoots.append(WinPaths::commonGameRoots());
#endif
  searchRoots.removeDuplicates();

  for (const QString& root : searchRoots) {
    if (!QDir(root).exists()) {
      continue;
    }
    result.scannedRoots.append(root);

    const QDir rootDir(root);
    const QStringList subdirs = rootDir.entryList(QDir::Dirs | QDir::NoDotAndDotDot);
    for (const QString& sub : subdirs) {
      const QString gameDir = rootDir.absoluteFilePath(sub);
      const QDir dir(gameDir);
      const QStringList infoFiles = dir.entryList({QStringLiteral("goggame-*.info")}, QDir::Files);
      for (const QString& infoFile : infoFiles) {
        parseInfoFile(dir.absoluteFilePath(infoFile), gameDir, result.games, seenIds);
      }
    }
  }

  return result;
}

bool GogWindowsScanner::launch(const GogWindowsGameRecord& game) {
#ifdef Q_OS_WIN
  // First attempt: launch through GOG Galaxy if installed
  const QString galaxyDir = WinPaths::gogGalaxyDirectory();
  if (!galaxyDir.isEmpty() && !game.gameId.isEmpty()) {
    const QString galaxyExe = galaxyDir + QStringLiteral("/GalaxyClient.exe");
    if (QFileInfo::exists(galaxyExe)) {
      QStringList args = {QStringLiteral("/command=runGame"), QStringLiteral("/gameId=%1").arg(game.gameId)};
      if (QProcess::startDetached(galaxyExe, args, galaxyDir)) {
        return true;
      }
    }
  }
#endif

  // Second attempt: launch direct game executable
  if (!game.executablePath.isEmpty() && QFileInfo::exists(game.executablePath)) {
    const QString workDir = game.installDirectory.isEmpty()
                                ? QFileInfo(game.executablePath).absolutePath()
                                : game.installDirectory;
    QStringList args;
    if (!game.arguments.isEmpty()) {
      args = game.arguments.split(QLatin1Char(' '), Qt::SkipEmptyParts);
    }
    return QProcess::startDetached(game.executablePath, args, workDir);
  }

  return false;
}
