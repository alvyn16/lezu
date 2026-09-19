#include "sources/epic/EpicScanner.h"

#include <QDesktopServices>
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonDocument>
#include <QJsonObject>
#include <QProcess>
#include <QUrl>

#ifdef Q_OS_WIN
#include "platform/windows/WinPaths.h"
#endif

EpicScanResult EpicScanner::scan(const QString& customManifestsDir) {
  EpicScanResult result;
  QString manifestsDir = customManifestsDir;
  if (manifestsDir.isEmpty()) {
#ifdef Q_OS_WIN
    manifestsDir = WinPaths::epicManifestsDirectory();
#else
    manifestsDir = QStringLiteral("/ProgramData/Epic/EpicGamesLauncher/Data/Manifests");
#endif
  }
  result.manifestsPath = manifestsDir;

  const QDir dir(manifestsDir);
  if (!dir.exists()) {
    return result;
  }

  const QStringList itemFiles = dir.entryList({QStringLiteral("*.item")}, QDir::Files, QDir::Name);
  for (const QString& filename : itemFiles) {
    const QString filePath = dir.absoluteFilePath(filename);
    QFile file(filePath);
    if (!file.open(QIODevice::ReadOnly | QIODevice::Text)) {
      result.warnings.append(QStringLiteral("Could not read Epic manifest: %1").arg(filename));
      continue;
    }

    const QJsonDocument doc = QJsonDocument::fromJson(file.readAll());
    if (!doc.isObject()) {
      continue;
    }

    const QJsonObject obj = doc.object();
    const bool isIncomplete = obj.value(QStringLiteral("bIsIncompleteInstall")).toBool(false);
    if (isIncomplete) {
      continue;
    }

    const QString appName = obj.value(QStringLiteral("AppName")).toString();
    const QString displayName = obj.value(QStringLiteral("DisplayName")).toString();
    const QString installLoc = QDir::fromNativeSeparators(obj.value(QStringLiteral("InstallLocation")).toString());
    const QString launchExe = obj.value(QStringLiteral("LaunchExecutable")).toString();
    const QString catalogId = obj.value(QStringLiteral("CatalogItemId")).toString();

    // Skip Unreal Engine installations or empty app names
    if (appName.isEmpty() || displayName.isEmpty() || appName.startsWith(QStringLiteral("UE_"))) {
      continue;
    }

    EpicGameRecord record;
    record.appName = appName;
    record.title = displayName;
    record.installLocation = installLoc;
    record.launchExecutable = launchExe;
    record.catalogItemId = catalogId;
    record.manifestPath = filePath;
    record.launchUrl = QStringLiteral("com.epicgames.launcher://apps/%1?action=launch&silent=true")
                           .arg(appName);

    result.games.append(record);
  }

  return result;
}

bool EpicScanner::launch(const EpicGameRecord& game) {
  // First attempt: launch via Epic Games Launcher protocol
  if (!game.launchUrl.isEmpty()) {
    if (QDesktopServices::openUrl(QUrl(game.launchUrl))) {
      return true;
    }
  }

  // Second attempt: launch direct executable if available
  if (!game.installLocation.isEmpty() && !game.launchExecutable.isEmpty()) {
    const QString fullExe = QDir(game.installLocation).absoluteFilePath(game.launchExecutable);
    if (QFileInfo::exists(fullExe)) {
      return QProcess::startDetached(fullExe, {}, game.installLocation);
    }
  }

  return false;
}
