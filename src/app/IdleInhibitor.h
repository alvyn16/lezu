#pragma once

#include <QObject>
#include <QPointer>

class QWindow;

#ifndef Q_OS_WIN
struct wl_registry;
struct zwp_idle_inhibit_manager_v1;
struct zwp_idle_inhibitor_v1;
#endif

// Prevents the screensaver / display-off from firing while an emulator is running.
//
// On Linux/Wayland: holds a zwp_idle_inhibitor_v1 on the Lezu window surface.
// On Windows: calls SetThreadExecutionState(ES_DISPLAY_REQUIRED | ES_SYSTEM_REQUIRED)
//   to signal that the system should not sleep or turn off the display.
//
// The public API is identical on both platforms.
class IdleInhibitor final : public QObject {
  Q_OBJECT

public:
  explicit IdleInhibitor(QWindow* window, QObject* parent = nullptr);
  ~IdleInhibitor() override;

  [[nodiscard]] bool isSupported() const;
  [[nodiscard]] bool isInhibiting() const;
  void setInhibited(bool inhibited);

private:
  void initialize();
  void apply();
  void release();

  QPointer<QWindow> m_window;
  bool m_wanted = false;
  bool m_initialized = false;

#ifndef Q_OS_WIN
  wl_registry* m_registry = nullptr;
  zwp_idle_inhibit_manager_v1* m_manager = nullptr;
  zwp_idle_inhibitor_v1* m_inhibitor = nullptr;
#else
  bool m_inhibiting = false;
#endif
};
