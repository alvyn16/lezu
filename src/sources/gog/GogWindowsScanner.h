#pragma once

#include <QString>
#include <QStringList>
#include <QVector>

struct GogWindowsGameRecord {
  QString gameId;
  QString title;
  QString installDirectory;
  QString executablePath;
  QString arguments;
  QString iconPath;
  QString galaxyLaunchCommand;

  bool operator==(const GogWindowsGameRecord&) const = default;
};

struct GogWindowsScanResult {
  QVector<GogWindowsGameRecord> games;
  QStringList scannedRoots;
  QStringList warnings;

  bool operator==(const GogWindowsScanResult&) const = default;
};

class GogWindowsScanner final {
public:
  // Discovers installed GOG games on Windows via:
  // 1. Registry (HKLM/HKCU \SOFTWARE\GOG.com\Games)
  // 2. Direct folder scanning (C:/GOG Games, C:/Games, extra user paths) for goggame-*.info files
  [[nodiscard]] static GogWindowsScanResult scan(const QStringList& extraRoots = {});

  // Launches a GOG game directly or delegated via GOG Galaxy
  [[nodiscard]] static bool launch(const GogWindowsGameRecord& game);
};
