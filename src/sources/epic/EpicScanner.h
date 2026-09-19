#pragma once

#include <QString>
#include <QStringList>
#include <QVector>

struct EpicGameRecord {
  QString appName;            // Unique Epic AppName / identifier
  QString catalogItemId;      // Catalog Item ID
  QString title;              // DisplayName
  QString installLocation;    // Root install directory
  QString launchExecutable;   // Main executable relative to installLocation
  QString manifestPath;       // Path to the .item file
  QString launchUrl;          // com.epicgames.launcher://apps/<AppName>?action=launch&silent=true
  bool isIncomplete = false;

  bool operator==(const EpicGameRecord&) const = default;
};

struct EpicScanResult {
  QVector<EpicGameRecord> games;
  QString manifestsPath;
  QStringList warnings;

  bool operator==(const EpicScanResult&) const = default;
};

class EpicScanner final {
public:
  // Discovers installed Epic Games on Windows by parsing %ProgramData%/Epic/EpicGamesLauncher/Data/Manifests/*.item
  [[nodiscard]] static EpicScanResult scan(const QString& manifestsDir = {});

  // Launches an Epic game via protocol or direct executable
  [[nodiscard]] static bool launch(const EpicGameRecord& game);
};
