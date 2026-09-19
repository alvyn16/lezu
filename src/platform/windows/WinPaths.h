#pragma once

#include <QString>
#include <QStringList>

namespace WinPaths {

// Returns the detected Steam installation root on Windows (e.g. "C:/Program Files (x86)/Steam").
// Checks the Windows Registry (HKCU\Software\Valve\Steam -> SteamPath) first, then common paths.
[[nodiscard]] QString steamInstallPath();

// Returns all configured Steam library paths on Windows (scanned from libraryfolders.vdf).
[[nodiscard]] QStringList steamLibraryFolders();

// Returns the directory where Epic Games Launcher stores its manifest .item files
// (typically "%ProgramData%/Epic/EpicGamesLauncher/Data/Manifests").
[[nodiscard]] QString epicManifestsDirectory();

// Returns the GOG Galaxy installation directory if installed.
[[nodiscard]] QString gogGalaxyDirectory();

// Returns common root directories where games are installed on Windows (e.g. C:/Games, C:/GOG Games).
[[nodiscard]] QStringList commonGameRoots();

// Emulator configuration / data paths on Windows:
[[nodiscard]] QString duckstationConfigDir();  // %APPDATA%/DuckStation
[[nodiscard]] QString pcsx2ConfigDir();        // %APPDATA%/PCSX2 or Documents/PCSX2
[[nodiscard]] QString rpcs3ConfigDir();        // %APPDATA%/rpcs3
[[nodiscard]] QString retroarchConfigDir();    // %APPDATA%/RetroArch
[[nodiscard]] QString ppssppConfigDir();       // %APPDATA%/PPSSPP
[[nodiscard]] QString project64ConfigDir();    // %APPDATA%/Project64
[[nodiscard]] QString melondsConfigDir();      // %APPDATA%/melonDS
[[nodiscard]] QString azaharConfigDir();       // %APPDATA%/Azahar

// App data and config locations for Lezu
[[nodiscard]] QString appDataDir();           // %LOCALAPPDATA%/lezu
[[nodiscard]] QString appConfigDir();         // %APPDATA%/lezu

} // namespace WinPaths
