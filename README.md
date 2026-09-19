# Lezu

[![Windows Build](https://github.com/alvyn16/lezu/actions/workflows/ci-windows.yml/badge.svg)](https://github.com/alvyn16/lezu/actions/workflows/ci-windows.yml)
[![License: GPL-3.0-or-later](https://img.shields.io/badge/license-GPL--3.0--or--later-8cd3cb.svg)](COPYRIGHT)

**Your games, beautifully together — on Windows.**

Lezu is a Windows game library that brings your installed Steam, Epic Games, GOG, RetroArch, and emulator games into one clean, cover-focused home.

---

## Features

- **Steam** — Native installation discovery including non-Steam shortcuts
- **Epic Games Store** — Manifest-based game scanning
- **GOG** — Registry and Galaxy manifest scanning with direct launch support
- **RetroArch** — Core and ROM discovery for emulated console systems
- **Emulator support** — Auto-discovery of PCSX2, Dolphin, Cemu, Ryujinx, shadPS4, Xenia, RPCS3, and DuckStation
- **Session tracking** — Local play-time recording per game
- **Windows Credential Manager** — Secure credential storage using the native Windows API
- **Cover art** — Local, downloaded, and user-selected cover, hero, and logo artwork
- **Search, filters & sorting** — Genre, platform, favorites, hidden games, and source filters that combine
- **Collections & tags** — Custom organization with completion states and smart filters
- **Keyboard, mouse, and controller** navigation

---

## Download

Download the latest `lezu-windows-x64` 

Extract the ZIP and run **`lezu.exe`**.

> **Requirements:** Windows 10/11 x64. No separate runtime installation needed — all dependencies are bundled.

---

## Building from Source

### Prerequisites

- [Qt 6.8+](https://www.qt.io/download) (MSVC 2022 64-bit)
- [Visual Studio 2022](https://visualstudio.microsoft.com/) with C++ workload
- [CMake 3.25+](https://cmake.org/)
- [vcpkg](https://vcpkg.io/) with packages: `sdl3`, `zstd`, `libzip`, `openssl`

### Steps

```powershell
# Clone the repo
git clone https://github.com/alvyn16/lezu.git
cd lezu

# Configure
cmake -B build -G "Visual Studio 17 2022" -A x64 `
  -DCMAKE_BUILD_TYPE=Release `
  -DCMAKE_PREFIX_PATH="<path-to-Qt>/6.8.0/msvc2022_64" `
  -DCMAKE_TOOLCHAIN_FILE="<path-to-vcpkg>/scripts/buildsystems/vcpkg.cmake" `
  -DBUILD_TESTING=OFF

# Build
cmake --build build --config Release
```

The executable will be at `build\Release\lezu.exe`.

---

## License

GPL-3.0-or-later — see [COPYRIGHT](COPYRIGHT) for details.
