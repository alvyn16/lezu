#include "platform/windows/WinPaths.h"

#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QRegularExpression>
#include <QSettings>
#include <QStandardPaths>

namespace WinPaths {

QString steamInstallPath() {
#ifdef Q_OS_WIN
  QSettings steamReg(QStringLiteral("HKEY_CURRENT_USER\\Software\\Valve\\Steam"),
                     QSettings::NativeFormat);
  QString path = steamReg.value(QStringLiteral("SteamPath")).toString();
  if (!path.isEmpty()) {
    path = QDir::fromNativeSeparators(path);
    if (QDir(path).exists()) {
      return path;
    }
  }

  // Fallback to standard Program Files locations
  const QString default64 = QStringLiteral("C:/Program Files (x86)/Steam");
  if (QDir(default64).exists()) {
    return default64;
  }
  const QString default32 = QStringLiteral("C:/Program Files/Steam");
  if (QDir(default32).exists()) {
    return default32;
  }
#endif
  return {};
}

QStringList steamLibraryFolders() {
  QStringList results;
  const QString root = steamInstallPath();
  if (root.isEmpty()) {
    return results;
  }

  results.append(root);

  const QString vdfPath = root + QStringLiteral("/steamapps/libraryfolders.vdf");
  QFile file(vdfPath);
  if (file.open(QIODevice::ReadOnly | QIODevice::Text)) {
    const QString content = QString::fromUtf8(file.readAll());
    // Match "path" "\s*"([^"]+)"
    static const QRegularExpression pathRegex(
        QStringLiteral("\"path\"\\s+\"([^\"]+)\""),
        QRegularExpression::CaseInsensitiveOption);
    auto matches = pathRegex.globalMatch(content);
    while (matches.hasNext()) {
      auto match = matches.next();
      QString p = QDir::fromNativeSeparators(match.captured(1));
      if (!p.isEmpty() && QDir(p).exists() && !results.contains(p, Qt::CaseInsensitive)) {
        results.append(p);
      }
    }
  }

  return results;
}

QString epicManifestsDirectory() {
  const QString progData = qEnvironmentVariable("ProgramData", QStringLiteral("C:/ProgramData"));
  const QString manifests = QDir::fromNativeSeparators(progData) +
                            QStringLiteral("/Epic/EpicGamesLauncher/Data/Manifests");
  return manifests;
}

QString gogGalaxyDirectory() {
#ifdef Q_OS_WIN
  QSettings gogReg(QStringLiteral("HKEY_LOCAL_MACHINE\\SOFTWARE\\GOG.com\\GalaxyClient\\paths"),
                   QSettings::NativeFormat);
  QString path = gogReg.value(QStringLiteral("client")).toString();
  if (!path.isEmpty()) {
    path = QDir::fromNativeSeparators(path);
    if (QDir(path).exists()) {
      return path;
    }
  }
  const QString defaultGog = QStringLiteral("C:/Program Files (x86)/GOG Galaxy");
  if (QDir(defaultGog).exists()) {
    return defaultGog;
  }
#endif
  return {};
}

QStringList commonGameRoots() {
  QStringList roots;
  const QStringList candidates = {
      QStringLiteral("C:/Games"),
      QStringLiteral("C:/GOG Games"),
      QStringLiteral("D:/Games"),
      QStringLiteral("D:/GOG Games"),
      QStringLiteral("E:/Games"),
      QStringLiteral("E:/GOG Games"),
  };
  for (const QString& candidate : candidates) {
    if (QDir(candidate).exists()) {
      roots.append(candidate);
    }
  }
  return roots;
}

static QString appDataRoot() {
  const QString appData = qEnvironmentVariable("APPDATA");
  if (!appData.isEmpty()) {
    return QDir::fromNativeSeparators(appData);
  }
  return QStandardPaths::writableLocation(QStandardPaths::AppDataLocation);
}

QString duckstationConfigDir() {
  return appDataRoot() + QStringLiteral("/DuckStation");
}

QString pcsx2ConfigDir() {
  const QString appData = appDataRoot() + QStringLiteral("/PCSX2");
  if (QDir(appData).exists()) {
    return appData;
  }
  const QString docs =
      QStandardPaths::writableLocation(QStandardPaths::DocumentsLocation) +
      QStringLiteral("/PCSX2");
  if (QDir(docs).exists()) {
    return docs;
  }
  return appData;
}

QString rpcs3ConfigDir() {
  const QString appData = appDataRoot() + QStringLiteral("/rpcs3");
  if (QDir(appData).exists()) {
    return appData;
  }
  return appData;
}

QString retroarchConfigDir() {
  const QString appData = appDataRoot() + QStringLiteral("/RetroArch");
  if (QDir(appData).exists()) {
    return appData;
  }
  return appData;
}

QString ppssppConfigDir() {
  const QString appData = appDataRoot() + QStringLiteral("/PPSSPP");
  if (QDir(appData).exists()) {
    return appData;
  }
  return appData;
}

QString project64ConfigDir() {
  return appDataRoot() + QStringLiteral("/Project64");
}

QString melondsConfigDir() {
  return appDataRoot() + QStringLiteral("/melonDS");
}

QString azaharConfigDir() {
  return appDataRoot() + QStringLiteral("/Azahar");
}

QString appDataDir() {
  const QString localAppData = qEnvironmentVariable("LOCALAPPDATA");
  if (!localAppData.isEmpty()) {
    return QDir::fromNativeSeparators(localAppData) + QStringLiteral("/lezu");
  }
  return QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation) +
         QStringLiteral("/lezu");
}

QString appConfigDir() {
  return appDataRoot() + QStringLiteral("/lezu");
}

} // namespace WinPaths
