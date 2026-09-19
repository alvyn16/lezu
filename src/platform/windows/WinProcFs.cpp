// Windows implementation of the ProcFs interface.
// Uses the Win32 Toolhelp32 snapshot API to enumerate running processes and
// NtQueryInformationProcess (via documented workaround) to read command lines.
//
// The exported namespace and types match ProcFs.h exactly, so ProcessMatcher
// and SessionRecorder compile unchanged.

#include "tracking/ProcFs.h"

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <tlhelp32.h>
#include <psapi.h>
#include <shellapi.h>

#include <QFileInfo>

using NtStatus = LONG;

// ── helpers ──────────────────────────────────────────────────────────────────

static qint64 processCreationTime(HANDLE hProcess) {
    FILETIME creation, exit, kernel, user;
    if (!GetProcessTimes(hProcess, &creation, &exit, &kernel, &user)) {
        return -1;
    }
    // Convert FILETIME (100-ns intervals since 1601-01-01) to a plain qint64.
    ULARGE_INTEGER uli;
    uli.LowPart  = creation.dwLowDateTime;
    uli.HighPart = creation.dwHighDateTime;
    return static_cast<qint64>(uli.QuadPart);
}

// Reads the full command line of a process by opening its handle and calling
// QueryFullProcessImageNameW for the image path, then GetCommandLine is not
// accessible from outside the process — we use the Toolhelp entry for the
// module name and ask the process for its own command line via the PEB.
// The simplest cross-version approach: QueryFullProcessImageNameW + NtQueryInformationProcess.
// We fall back gracefully if access is denied.
static bool readProcessInfo(DWORD pid,
                            QString& outComm,
                            QStringList& outArgs,
                            qint64& outStart) {
    HANDLE hProcess = OpenProcess(
        PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_VM_READ,
        FALSE, pid);
    if (!hProcess) {
        return false;
    }

    outStart = processCreationTime(hProcess);

    // Image path → comm (base name without extension)
    wchar_t imagePath[MAX_PATH] = {};
    DWORD pathSize = MAX_PATH;
    if (QueryFullProcessImageNameW(hProcess, 0, imagePath, &pathSize)) {
        outComm = QFileInfo(QString::fromWCharArray(imagePath)).completeBaseName();
    }

    // Command line via NtQueryInformationProcess → PROCESS_BASIC_INFORMATION → PEB
    // We use ReadProcessMemory because NtQueryInformationProcess is undocumented for
    // this purpose but stable; QueryFullProcessImageNameW handles the exe name already.
    // For arguments we attempt to read the RTL_USER_PROCESS_PARAMETERS.CommandLine.
    // If access is denied we accept the partial info (comm + start) — enough for matching.
    using NtQueryInformationProcessFn = NtStatus(WINAPI*)(
        HANDLE, UINT, PVOID, ULONG, PULONG);
    static auto NtQueryInformationProcess =
        reinterpret_cast<NtQueryInformationProcessFn>(
            GetProcAddress(GetModuleHandleW(L"ntdll.dll"),
                           "NtQueryInformationProcess"));

    if (NtQueryInformationProcess) {
        // PROCESS_BASIC_INFORMATION
        struct PBI {
            PVOID Reserved1;
            PVOID PebBaseAddress;
            PVOID Reserved2[2];
            ULONG_PTR UniqueProcessId;
            PVOID Reserved3;
        } pbi{};
        ULONG returnLength = 0;
        NtStatus status = NtQueryInformationProcess(
            hProcess, 0 /*ProcessBasicInformation*/, &pbi, sizeof(pbi), &returnLength);
        if (status == 0 && pbi.PebBaseAddress) {
            // Read PEB.ProcessParameters offset (0x20 on x64, 0x10 on x86)
#ifdef _WIN64
            constexpr SIZE_T kParamsOffset = 0x20;
#else
            constexpr SIZE_T kParamsOffset = 0x10;
#endif
            PVOID paramsPtr = nullptr;
            SIZE_T bytesRead = 0;
            if (ReadProcessMemory(hProcess,
                                  static_cast<PBYTE>(pbi.PebBaseAddress) + kParamsOffset,
                                  &paramsPtr, sizeof(paramsPtr), &bytesRead) && paramsPtr) {
                // RTL_USER_PROCESS_PARAMETERS.CommandLine is a UNICODE_STRING at offset
                // 0x70 (x64) or 0x40 (x86).
#ifdef _WIN64
                constexpr SIZE_T kCmdLineOffset = 0x70;
#else
                constexpr SIZE_T kCmdLineOffset = 0x40;
#endif
                struct UnicodeString {
                    USHORT Length;
                    USHORT MaximumLength;
                    PWSTR  Buffer;
                } cmdLine{};
                if (ReadProcessMemory(hProcess,
                                      static_cast<PBYTE>(paramsPtr) + kCmdLineOffset,
                                      &cmdLine, sizeof(cmdLine), &bytesRead) && cmdLine.Buffer) {
                    QByteArray buf(cmdLine.Length, '\0');
                    if (ReadProcessMemory(hProcess, cmdLine.Buffer,
                                         buf.data(), cmdLine.Length, &bytesRead)) {
                        QString fullCmd = QString::fromWCharArray(
                            reinterpret_cast<const wchar_t*>(buf.constData()),
                            cmdLine.Length / sizeof(wchar_t));
                        // Split using the Windows shell command-line parser
                        int argc = 0;
                        LPWSTR* argv = CommandLineToArgvW(
                            reinterpret_cast<LPCWSTR>(fullCmd.utf16()), &argc);
                        if (argv) {
                            for (int i = 0; i < argc; ++i) {
                                outArgs << QString::fromWCharArray(argv[i]);
                            }
                            LocalFree(argv);
                        }
                    }
                }
            }
        }
    }

    CloseHandle(hProcess);
    return !outComm.isEmpty();
}

// ── public API ────────────────────────────────────────────────────────────────

namespace ProcFs {

QVector<ProcessSnapshot> listProcesses() {
    QVector<ProcessSnapshot> result;

    HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snapshot == INVALID_HANDLE_VALUE) {
        return result;
    }

    PROCESSENTRY32W entry{};
    entry.dwSize = sizeof(entry);

    if (!Process32FirstW(snapshot, &entry)) {
        CloseHandle(snapshot);
        return result;
    }

    do {
        // Skip the idle process and system process
        if (entry.th32ProcessID == 0 || entry.th32ProcessID == 4) {
            continue;
        }

        ProcessSnapshot snap;
        snap.pid = static_cast<qint64>(entry.th32ProcessID);

        QString comm;
        QStringList args;
        qint64 startTime = -1;

        if (readProcessInfo(entry.th32ProcessID, comm, args, startTime)) {
            snap.comm = comm;
            snap.arguments = args;
            snap.procStart = startTime;
            result.append(snap);
        }
        // If we can't read the process (access denied, system process), skip it.

    } while (Process32NextW(snapshot, &entry));

    CloseHandle(snapshot);
    return result;
}

bool processAlive(qint64 pid, qint64 procStart) {
    HANDLE hProcess = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE,
                                  static_cast<DWORD>(pid));
    if (!hProcess) {
        // Process does not exist or we have no access → treat as gone
        return false;
    }

    // Verify it hasn't exited (still running)
    DWORD exitCode = 0;
    if (GetExitCodeProcess(hProcess, &exitCode) && exitCode != STILL_ACTIVE) {
        CloseHandle(hProcess);
        return false;
    }

    // Verify PID has not been recycled by checking creation time
    const qint64 creationTime = processCreationTime(hProcess);
    CloseHandle(hProcess);

    return creationTime == procStart;
}

} // namespace ProcFs
