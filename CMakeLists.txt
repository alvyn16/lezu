cmake_minimum_required(VERSION 3.24)

project(Lezu VERSION 1.10.0 LANGUAGES C CXX)

find_package(OpenSSL REQUIRED COMPONENTS Crypto)

if(NOT WIN32)
  find_package(PkgConfig REQUIRED)
  pkg_check_modules(SDL3 REQUIRED IMPORTED_TARGET sdl3)
  pkg_check_modules(LIBZSTD REQUIRED IMPORTED_TARGET libzstd)
  pkg_check_modules(LIBSECRET REQUIRED IMPORTED_TARGET libsecret-1)
  pkg_check_modules(LIBZIP REQUIRED IMPORTED_TARGET libzip)
else()
  find_package(SDL3 QUIET CONFIG)
  if(NOT TARGET SDL3::SDL3 AND NOT TARGET SDL3::SDL3-shared)
    find_package(PkgConfig QUIET)
    if(PkgConfig_FOUND)
      pkg_check_modules(SDL3 IMPORTED_TARGET sdl3)
    endif()
  endif()
  find_package(zstd QUIET CONFIG)
  if(NOT TARGET zstd::libzstd_shared AND NOT TARGET zstd::libzstd_static)
    find_package(PkgConfig QUIET)
    if(PkgConfig_FOUND)
      pkg_check_modules(LIBZSTD IMPORTED_TARGET libzstd)
    endif()
  endif()
  find_package(libzip QUIET CONFIG)
  if(NOT TARGET libzip::zip)
    find_package(PkgConfig QUIET)
    if(PkgConfig_FOUND)
      pkg_check_modules(LIBZIP IMPORTED_TARGET libzip)
    endif()
  endif()
endif()

# Wayland idle-inhibit keeps the screensaver away while a launched game runs. Optional so the
# build still works without Wayland headers; the inhibitor becomes a no-op in that case.
set(LEZU_IDLE_INHIBIT OFF)
if(NOT WIN32)
  pkg_check_modules(WAYLAND_CLIENT IMPORTED_TARGET wayland-client)
  pkg_check_modules(WAYLAND_PROTOCOLS wayland-protocols)
  find_program(WAYLAND_SCANNER wayland-scanner)
  if(WAYLAND_CLIENT_FOUND AND WAYLAND_PROTOCOLS_FOUND AND WAYLAND_SCANNER)
    pkg_get_variable(WAYLAND_PROTOCOLS_DIR wayland-protocols pkgdatadir)
    set(LEZU_IDLE_INHIBIT_XML
      "${WAYLAND_PROTOCOLS_DIR}/unstable/idle-inhibit/idle-inhibit-unstable-v1.xml")
    if(EXISTS "${LEZU_IDLE_INHIBIT_XML}")
      set(LEZU_IDLE_INHIBIT ON)
      set(LEZU_PROTOCOL_DIR "${CMAKE_CURRENT_BINARY_DIR}/wayland-protocols")
      file(MAKE_DIRECTORY "${LEZU_PROTOCOL_DIR}")
      set(LEZU_IDLE_INHIBIT_HEADER
        "${LEZU_PROTOCOL_DIR}/idle-inhibit-unstable-v1-client-protocol.h")
      set(LEZU_IDLE_INHIBIT_SOURCE "${LEZU_PROTOCOL_DIR}/idle-inhibit-unstable-v1-protocol.c")
      add_custom_command(
        OUTPUT "${LEZU_IDLE_INHIBIT_HEADER}"
        COMMAND "${WAYLAND_SCANNER}" client-header "${LEZU_IDLE_INHIBIT_XML}"
                "${LEZU_IDLE_INHIBIT_HEADER}"
        DEPENDS "${LEZU_IDLE_INHIBIT_XML}"
        VERBATIM)
      add_custom_command(
        OUTPUT "${LEZU_IDLE_INHIBIT_SOURCE}"
        COMMAND "${WAYLAND_SCANNER}" private-code "${LEZU_IDLE_INHIBIT_XML}"
                "${LEZU_IDLE_INHIBIT_SOURCE}"
        DEPENDS "${LEZU_IDLE_INHIBIT_XML}"
        VERBATIM)
    endif()
  endif()
endif()
message(STATUS "Wayland idle-inhibit: ${LEZU_IDLE_INHIBIT}")

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_AUTOMOC ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

find_package(Qt6 6.8 REQUIRED COMPONENTS Concurrent Core Gui Network Qml Quick QuickControls2 Sql Test)
if(NOT WIN32)
  find_package(Qt6 6.8 OPTIONAL_COMPONENTS GuiPrivate)
  if(LEZU_IDLE_INHIBIT AND NOT TARGET Qt6::GuiPrivate)
    message(STATUS "Qt6::GuiPrivate is unavailable; disabling Wayland idle-inhibit")
    set(LEZU_IDLE_INHIBIT OFF)
  endif()
endif()
qt_standard_project_setup(REQUIRES 6.8)

# Play session tracking, shared by the Lezu window and the session recorder.
set(LEZU_TRACKING_SOURCES
  src/tracking/AppNotify.cpp
  src/tracking/AppNotify.h
  src/tracking/PlaySessionStore.cpp
  src/tracking/PlaySessionStore.h
  src/tracking/ProcessMatcher.cpp
  src/tracking/ProcessMatcher.h
  src/tracking/SessionDatabase.cpp
  src/tracking/SessionDatabase.h
  src/tracking/SessionRecorder.cpp
  src/tracking/SessionRecorder.h
)
if(WIN32)
  list(APPEND LEZU_TRACKING_SOURCES
    src/platform/windows/WinProcFs.cpp
  )
else()
  list(APPEND LEZU_TRACKING_SOURCES
    src/tracking/ProcFs.cpp
    src/tracking/ProcFs.h
  )
endif()

add_library(LEZU_tracking STATIC ${LEZU_TRACKING_SOURCES})

target_include_directories(LEZU_tracking PUBLIC src)
target_link_libraries(LEZU_tracking PUBLIC
  Qt6::Core
  Qt6::Network
  Qt6::Sql
)

if(CMAKE_CXX_COMPILER_ID MATCHES "Clang|GNU")
  target_compile_options(LEZU_tracking PRIVATE -Wall -Wextra -Wpedantic)
endif()



set(LEZU_CORE_SOURCES
  src/backup/BackupArchive.cpp
  src/backup/BackupArchive.h
  src/backup/BackupSnapshot.cpp
  src/backup/BackupSnapshot.h
  src/backup/BackupDatabase.cpp
  src/backup/BackupDatabase.h
  src/backup/BackupRecovery.cpp
  src/backup/BackupRecovery.h
  src/saves/SaveManagement.cpp
  src/saves/SaveProtection.cpp
  src/saves/SaveProtection.h
  src/saves/SaveBackups.cpp
  src/saves/SaveSetStore.cpp
  src/saves/SaveLayouts.cpp
  src/saves/SaveBackups.h
  src/backup/BackupManager.cpp
  src/backup/BackupManager.h
  src/backup/BackupStartup.cpp
  src/backup/BackupStartup.h
  src/achievements/AchievementModel.cpp
  src/achievements/AchievementModel.h
  src/achievements/RetroAchievementsApi.cpp
  src/achievements/RetroAchievementsApi.h
  src/achievements/RetroAchievementsHasher.cpp
  src/achievements/RetroAchievementsHasher.h
  src/achievements/RetroAchievementsService.cpp
  src/achievements/RetroAchievementsService.h
  src/achievements/SteamAchievementApi.cpp
  src/achievements/SteamAchievementApi.h
  src/achievements/SteamAccountService.cpp
  src/achievements/SteamAccountService.h
  src/app/AppSettings.cpp
  src/app/AppSettings.h
  src/app/SingleInstance.cpp
  src/app/SingleInstance.h
  src/input/ControllerFocusGuard.cpp
  src/input/ControllerFocusGuard.h
  src/input/ControllerInput.cpp
  src/input/ControllerInput.h
  src/input/CouchCursorManager.cpp
  src/input/CouchCursorManager.h
  src/library/HomeModel.cpp
  src/library/HomeModel.h
  src/library/LibraryFilterModel.cpp
  src/library/LibraryFilterModel.h
  src/library/DatabaseTuning.h
  src/library/GameRoles.h
  src/library/ConsoleCatalog.cpp
  src/library/ConsoleCatalog.h
  src/library/ConsolePortalModel.cpp
  src/library/ConsolePortalModel.h
  src/library/BattleNetGameModel.cpp
  src/library/BattleNetGameModel.h
  src/library/EpicGameModel.cpp
  src/library/EpicGameModel.h
  src/library/GogGameModel.cpp
  src/library/GogGameModel.h
  src/library/FaugusGameModel.cpp
  src/library/FaugusGameModel.h
  src/library/HeroicGameModel.cpp
  src/library/HeroicGameModel.h
  src/library/LutrisGameModel.cpp
  src/library/LutrisGameModel.h
  src/library/RetroArchGameModel.cpp
  src/library/RetroArchGameModel.h
  src/library/Pcsx2GameModel.cpp
  src/library/Pcsx2GameModel.h
  src/library/RyujinxGameModel.cpp
  src/library/RyujinxGameModel.h
  src/library/Shadps4GameModel.cpp
  src/library/Shadps4GameModel.h
  src/library/RommGameModel.cpp
  src/library/RommGameModel.h
  src/library/CemuGameModel.cpp
  src/library/CemuGameModel.h
  src/library/XeniaGameModel.cpp
  src/library/XeniaGameModel.h
  src/library/ManualGameModel.cpp
  src/library/ManualGameModel.h
  src/library/PersonalDataRules.h
  src/library/MockGameModel.cpp
  src/library/MockGameModel.h
  src/library/SteamGameModel.cpp
  src/library/SteamGameModel.h
  src/library/SteamOwnedGamesApi.cpp
  src/library/SteamOwnedGamesApi.h
  src/library/UnifiedGameModel.cpp
  src/library/LibraryRepair.cpp
  src/library/ReviewUndo.cpp
  src/library/UnifiedGameModel.h
  src/sources/romm/RommCredentials.cpp
  src/sources/romm/RommCredentials.h
  src/sources/romm/RommCatalog.cpp
  src/sources/romm/RommCatalog.h
  src/sources/romm/RommScanner.cpp
  src/sources/romm/RommScanner.h
  src/launch/GameLaunchSetup.cpp
  src/launch/GameLauncher.cpp
  src/launch/GameLauncher.h
  src/launch/LaunchCommand.h
  src/launch/PlayRequest.cpp
  src/launch/PlayRequest.h
  src/launch/SteamLauncher.cpp
  src/launch/SteamLauncher.h
  src/metadata/ProtonDbService.cpp
  src/metadata/ProtonDbService.h
  src/metadata/GameMetadata.cpp
  src/metadata/GameMetadata.h
  src/metadata/IgdbApi.cpp
  src/metadata/IgdbApi.h
  src/metadata/GameInsightsService.cpp
  src/metadata/GameInsightsService.h
  src/sources/FlatpakInstall.h
  src/sources/steam/SteamScanner.cpp
  src/sources/steam/SteamScanner.h
  src/sources/steam/ValveKeyValues.cpp
  src/sources/steam/ValveKeyValues.h
  src/sources/lutris/LutrisScanner.cpp
  src/sources/lutris/LutrisScanner.h
  src/sources/retroarch/RetroArchScanner.cpp
  src/sources/retroarch/RetroArchScanner.h
  src/sources/retro/RomFolderScanner.cpp
  src/sources/retro/RomFolderScanner.h
  src/sources/pcsx2/Pcsx2Scanner.cpp
  src/sources/pcsx2/Pcsx2Scanner.h
  src/sources/ryujinx/RyujinxScanner.cpp
  src/sources/ryujinx/RyujinxScanner.h
  src/sources/shadps4/Shadps4Scanner.cpp
  src/sources/shadps4/Shadps4Scanner.h
  src/sources/cemu/CemuScanner.cpp
  src/sources/cemu/CemuScanner.h
  src/sources/xenia/XeniaScanner.cpp
  src/sources/xenia/XeniaScanner.h
  src/sources/dolphin/DolphinScanner.cpp
  src/sources/dolphin/DolphinScanner.h
  src/library/DolphinGameModel.cpp
  src/library/DolphinGameModel.h
  src/artwork/SwitchTitleReader.cpp
  src/artwork/SwitchTitleReader.h
  src/artwork/ZArchiveReader.cpp
  src/artwork/ZArchiveReader.h
  src/artwork/TgaImage.cpp
  src/artwork/TgaImage.h
  src/artwork/CoverImageProvider.cpp
  src/artwork/CoverImageProvider.h
  src/sources/heroic/HeroicScanner.cpp
  src/sources/heroic/HeroicScanner.h
  src/sources/faugus/FaugusScanner.cpp
  src/sources/faugus/FaugusScanner.h
  src/sources/battlenet/BattleNetScanner.cpp
  src/sources/battlenet/BattleNetScanner.h
  src/sources/epic/EpicScanner.cpp
  src/sources/epic/EpicScanner.h
  src/sources/gog/GogWindowsScanner.cpp
  src/sources/gog/GogWindowsScanner.h
  src/streaming/SunshineIntegration.cpp
  src/streaming/SunshineIntegration.h
  src/theme/OmarchyTheme.cpp
  src/theme/OmarchyTheme.h
)

if(WIN32)
  list(APPEND LEZU_CORE_SOURCES
    src/platform/windows/WinSecretService.cpp
    src/platform/windows/WinSecretService.h
    src/platform/windows/WinPaths.cpp
    src/platform/windows/WinPaths.h
    src/platform/windows/WinSessionWorker.cpp
    src/platform/windows/WinSessionWorker.h
  )
endif()

add_library(LEZU_core STATIC ${LEZU_CORE_SOURCES})

target_include_directories(LEZU_core PUBLIC src)
target_link_libraries(LEZU_core PUBLIC
  LEZU_tracking
  Qt6::Quick
  OpenSSL::Crypto
  Qt6::Concurrent
  Qt6::Core
  Qt6::Gui
  Qt6::Network
  Qt6::Sql
)

if(TARGET PkgConfig::SDL3)
  target_link_libraries(LEZU_core PUBLIC PkgConfig::SDL3)
elseif(TARGET SDL3::SDL3)
  target_link_libraries(LEZU_core PUBLIC SDL3::SDL3)
elseif(TARGET SDL3::SDL3-shared)
  target_link_libraries(LEZU_core PUBLIC SDL3::SDL3-shared)
endif()

if(NOT WIN32)
  target_link_libraries(LEZU_core PUBLIC PkgConfig::LIBSECRET)
else()
  target_link_libraries(LEZU_core PUBLIC advapi32 crypt32 shell32 user32)
endif()

if(TARGET PkgConfig::LIBZIP)
  target_link_libraries(LEZU_core PUBLIC PkgConfig::LIBZIP)
elseif(TARGET libzip::zip)
  target_link_libraries(LEZU_core PUBLIC libzip::zip)
endif()

if(TARGET PkgConfig::LIBZSTD)
  target_link_libraries(LEZU_core PUBLIC PkgConfig::LIBZSTD)
elseif(TARGET zstd::libzstd_shared)
  target_link_libraries(LEZU_core PUBLIC zstd::libzstd_shared)
elseif(TARGET zstd::libzstd_static)
  target_link_libraries(LEZU_core PUBLIC zstd::libzstd_static)
endif()

if(CMAKE_CXX_COMPILER_ID MATCHES "Clang|GNU")
  target_compile_options(LEZU_core PRIVATE -Wall -Wextra -Wpedantic)
endif()

qt_add_executable(LEZU
  src/app/main.cpp
  src/app/IdleInhibitor.cpp
  src/app/IdleInhibitor.h
)
if(LEZU_IDLE_INHIBIT)
  target_sources(LEZU PRIVATE "${LEZU_IDLE_INHIBIT_HEADER}" "${LEZU_IDLE_INHIBIT_SOURCE}")
  set_source_files_properties("${LEZU_IDLE_INHIBIT_SOURCE}" PROPERTIES
    COMPILE_OPTIONS "-w")
  target_include_directories(LEZU PRIVATE "${LEZU_PROTOCOL_DIR}")
  target_compile_definitions(LEZU PRIVATE LEZU_IDLE_INHIBIT=1)
  target_link_libraries(LEZU PRIVATE PkgConfig::WAYLAND_CLIENT Qt6::GuiPrivate)
endif()

# A pragma Singleton file is only registered as one when CMake says so, and this has to be set
# before the module is declared. Without it the type resolves to nothing and every binding on it
# quietly evaluates to undefined.
set_source_files_properties(qml/components/TextEntry.qml PROPERTIES QT_QML_SINGLETON_TYPE TRUE)

qt_add_qml_module(LEZU
  URI LEZU
  VERSION 1.0
  QML_FILES
    qml/Main.qml
    qml/components/TextEntry.qml
    qml/components/FieldClearButton.qml
    qml/components/CoverSizeControl.qml
    qml/components/CoverArtwork.qml
    qml/components/SaveProtectionPanel.qml
    qml/components/SaveBackupMenu.qml
    qml/components/LaunchSetupPanel.qml
    qml/components/LibraryRepairPanel.qml
    qml/components/RommSettings.qml
    qml/components/LaunchFeedback.qml
    qml/components/ProtonDbBadge.qml
    qml/components/GameCard.qml
    qml/components/CouchLibraryView.qml
    qml/components/CouchKeyboard.qml
    qml/components/CouchBrowsePanel.qml
    qml/components/GameMetadataEditor.qml
    qml/components/SettingsPanel.qml
    qml/components/GlassButton.qml
    qml/components/ActionMenu.qml
    qml/components/MenuAction.qml
    qml/components/LibraryView.qml
    qml/screens/ArtworkEditor.qml
    qml/screens/RestoreStartup.qml
    qml/screens/BackupEditor.qml
    qml/screens/SavedFiltersEditor.qml
    qml/screens/BulkOrganizationEditor.qml
    qml/screens/ManualGameEditor.qml
    qml/screens/HomeScreen.qml
    qml/screens/GameDetails.qml
)

qt_add_resources(LEZU "lezu_icons"
  PREFIX "/icons"
  FILES
    resources/icons/lezu.svg
    resources/icons/lezu.ico
)

# Console card art: any PNG, JPG, or SVG dropped into resources/consoles named
# after a ConsoleCatalog id (snes.png, n64.svg, ...) is bundled automatically.
file(GLOB LEZU_CONSOLE_ART CONFIGURE_DEPENDS
  "${CMAKE_CURRENT_SOURCE_DIR}/resources/consoles/*.png"
  "${CMAKE_CURRENT_SOURCE_DIR}/resources/consoles/*.jpg"
  "${CMAKE_CURRENT_SOURCE_DIR}/resources/consoles/*.svg")
qt_add_resources(LEZU "LEZU_consoles"
  PREFIX "/consoles"
  BASE "resources/consoles"
  FILES ${LEZU_CONSOLE_ART}
)

qt_add_resources(LEZU "lezu_profiles"
  PREFIX "/resources"
  FILES
    resources/sessiond-profiles.json
)

if(WIN32)
  set(LEZU_ICON_ESCAPED "${CMAKE_CURRENT_SOURCE_DIR}/resources/icons/lezu.ico")
  string(REPLACE "/" "\\\\" LEZU_ICON_ESCAPED "${LEZU_ICON_ESCAPED}")
  configure_file(
    "${CMAKE_CURRENT_SOURCE_DIR}/src/platform/windows/lezu.rc.in"
    "${CMAKE_CURRENT_BINARY_DIR}/lezu.rc"
    @ONLY
  )
  target_sources(LEZU PRIVATE
    "${CMAKE_CURRENT_BINARY_DIR}/lezu.rc"
  )
endif()

set_target_properties(LEZU PROPERTIES
  OUTPUT_NAME lezu
  MACOSX_BUNDLE_GUI_IDENTIFIER io.github.lezu.Lezu
  WIN32_EXECUTABLE TRUE
)

add_executable(lezu ALIAS LEZU)

target_compile_definitions(LEZU PRIVATE
  LEZU_VERSION="${PROJECT_VERSION}"
)

target_link_libraries(LEZU PRIVATE
  LEZU_core
  Qt6::Core
  Qt6::Gui
  Qt6::Qml
  Qt6::Quick
  Qt6::QuickControls2
)
if(CMAKE_CXX_COMPILER_ID MATCHES "Clang|GNU")
  target_compile_options(LEZU PRIVATE -Wall -Wextra -Wpedantic)
endif()

install(TARGETS LEZU
  RUNTIME DESTINATION bin
)
install(FILES resources/sessiond-profiles.json
  DESTINATION share/lezu
)
install(FILES LICENSE COPYRIGHT
  DESTINATION share/lezu/licenses
)

include(CTest)
if(BUILD_TESTING)
  add_subdirectory(tests)
endif()
