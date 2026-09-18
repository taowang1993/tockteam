// Read-only Windows SDK ABI probe; no process, job, or other native API calls.
// In an MSVC x64 Native Tools Command Prompt, first enter a new disposable
// directory outside the checkout (the compiler writes both .obj and .exe):
// cl /nologo /std:c++17 /EHsc /W4 /D_WIN32_WINNT=0x0A00 "<checkout>\scripts\owned-process-windows-sdk.cpp" /Fe:owned-process-windows-sdk.exe
#if !defined(_WIN32)
#error "This probe requires the Windows 10 SDK."
#endif
#if !defined(_WIN64)
#error "This probe requires a 64-bit Windows target."
#endif

#ifndef _WIN32_WINNT
#define _WIN32_WINNT 0x0A00
#endif
#include <windows.h>

#include <cstddef>
#include <cstdio>
#include <type_traits>

#if defined(_M_X64)
#define OWNED_PROCESS_ARCHITECTURE "x64"
#elif defined(_M_ARM64)
#define OWNED_PROCESS_ARCHITECTURE "arm64"
#elif defined(_M_IA64)
#define OWNED_PROCESS_ARCHITECTURE "ia64"
#else
#define OWNED_PROCESS_ARCHITECTURE "unknown-64"
#endif

static_assert(sizeof(void*) == 8, "pointer size");
static_assert(sizeof(ULONG_PTR) == 8 && sizeof(DWORD) == 4, "completion output widths");
static_assert(sizeof(JOBOBJECT_ASSOCIATE_COMPLETION_PORT) == 16, "completion association size");
static_assert(offsetof(JOBOBJECT_ASSOCIATE_COMPLETION_PORT, CompletionKey) == 0, "completion key offset");
static_assert(offsetof(JOBOBJECT_ASSOCIATE_COMPLETION_PORT, CompletionPort) == 8, "completion port offset");
static_assert(offsetof(JOBOBJECT_BASIC_ACCOUNTING_INFORMATION, TotalProcesses) == 36, "total process offset");
static_assert(JobObjectAssociateCompletionPortInformation == 7 && JOB_OBJECT_MSG_NEW_PROCESS == 6, "completion constants");
static_assert(SYNCHRONIZE == 0x100000, "observation-only access");
static_assert(std::is_same_v<decltype(&CreateIoCompletionPort), HANDLE(WINAPI*)(HANDLE, HANDLE, ULONG_PTR, DWORD)>, "CreateIoCompletionPort ABI");
static_assert(std::is_same_v<decltype(&GetQueuedCompletionStatus), BOOL(WINAPI*)(HANDLE, LPDWORD, PULONG_PTR, LPOVERLAPPED*, DWORD)>, "GetQueuedCompletionStatus ABI");
static_assert(std::is_same_v<decltype(&OpenProcess), HANDLE(WINAPI*)(DWORD, BOOL, DWORD)>, "OpenProcess ABI");

static_assert(sizeof(STARTUPINFOEXW) == 112, "STARTUPINFOEXW size");
static_assert(offsetof(STARTUPINFOEXW, lpAttributeList) == 104,
              "STARTUPINFOEXW lpAttributeList offset");

static_assert(sizeof(STARTUPINFOW) == 104, "STARTUPINFOW size");
static_assert(offsetof(STARTUPINFOW, cb) == 0, "STARTUPINFOW cb offset");
static_assert(offsetof(STARTUPINFOW, dwFlags) == 60,
              "STARTUPINFOW dwFlags offset");
static_assert(offsetof(STARTUPINFOW, hStdInput) == 80,
              "STARTUPINFOW hStdInput offset");
static_assert(offsetof(STARTUPINFOW, hStdOutput) == 88,
              "STARTUPINFOW hStdOutput offset");
static_assert(offsetof(STARTUPINFOW, hStdError) == 96,
              "STARTUPINFOW hStdError offset");

static_assert(sizeof(PROCESS_INFORMATION) == 24, "PROCESS_INFORMATION size");
static_assert(offsetof(PROCESS_INFORMATION, hProcess) == 0,
              "PROCESS_INFORMATION hProcess offset");
static_assert(offsetof(PROCESS_INFORMATION, hThread) == 8,
              "PROCESS_INFORMATION hThread offset");
static_assert(offsetof(PROCESS_INFORMATION, dwProcessId) == 16,
              "PROCESS_INFORMATION dwProcessId offset");
static_assert(offsetof(PROCESS_INFORMATION, dwThreadId) == 20,
              "PROCESS_INFORMATION dwThreadId offset");

static_assert(sizeof(JOBOBJECT_BASIC_ACCOUNTING_INFORMATION) == 48,
              "JOBOBJECT_BASIC_ACCOUNTING_INFORMATION size");
static_assert(offsetof(JOBOBJECT_BASIC_ACCOUNTING_INFORMATION, ActiveProcesses) == 40,
              "JOBOBJECT_BASIC_ACCOUNTING_INFORMATION ActiveProcesses offset");

static_assert(sizeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION) == 144,
              "JOBOBJECT_EXTENDED_LIMIT_INFORMATION size");
static_assert(
    offsetof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION, BasicLimitInformation) +
        offsetof(JOBOBJECT_BASIC_LIMIT_INFORMATION, LimitFlags) == 16,
    "JOBOBJECT_EXTENDED_LIMIT_INFORMATION BasicLimitInformation.LimitFlags offset");

static_assert(PROC_THREAD_ATTRIBUTE_JOB_LIST == 0x2000d,
              "PROC_THREAD_ATTRIBUTE_JOB_LIST");
static_assert(PROC_THREAD_ATTRIBUTE_HANDLE_LIST == 0x20002,
              "PROC_THREAD_ATTRIBUTE_HANDLE_LIST");
static_assert(EXTENDED_STARTUPINFO_PRESENT == 0x80000,
              "EXTENDED_STARTUPINFO_PRESENT");
static_assert(CREATE_UNICODE_ENVIRONMENT == 0x400,
              "CREATE_UNICODE_ENVIRONMENT");
static_assert(CREATE_NO_WINDOW == 0x08000000, "CREATE_NO_WINDOW");
static_assert(STARTF_USESTDHANDLES == 0x100, "STARTF_USESTDHANDLES");
static_assert(JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE == 0x2000,
              "JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE");
static_assert(JobObjectBasicAccountingInformation == 1,
              "JobObjectBasicAccountingInformation");
static_assert(JobObjectExtendedLimitInformation == 9,
              "JobObjectExtendedLimitInformation");
static_assert(HANDLE_FLAG_INHERIT == 1, "HANDLE_FLAG_INHERIT");
static_assert(ERROR_INSUFFICIENT_BUFFER == 122, "ERROR_INSUFFICIENT_BUFFER");
static_assert(ERROR_BROKEN_PIPE == 109, "ERROR_BROKEN_PIPE");
static_assert(WAIT_OBJECT_0 == 0, "WAIT_OBJECT_0");
static_assert(WAIT_TIMEOUT == 258, "WAIT_TIMEOUT");
static_assert(static_cast<unsigned long long>(WAIT_FAILED) == 0xffffffffULL,
              "WAIT_FAILED");

int main() {
  std::printf(
      "{\"architecture\":\"%s\",\"pointerSize\":%llu,"
      "\"completionPort\":{\"associationSize\":16,\"keyOffset\":0,\"portOffset\":8,\"accountingTotalOffset\":36,\"associationClass\":7,\"newProcess\":6,\"synchronize\":1048576},"
      "\"layouts\":{\"STARTUPINFOEXW\":{\"size\":%llu,\"lpAttributeList\":%llu},"
      "\"STARTUPINFOW\":{\"size\":%llu,\"cb\":%llu,\"dwFlags\":%llu,\"hStdInput\":%llu,\"hStdOutput\":%llu,\"hStdError\":%llu},"
      "\"PROCESS_INFORMATION\":{\"size\":%llu,\"hProcess\":%llu,\"hThread\":%llu,\"dwProcessId\":%llu,\"dwThreadId\":%llu},"
      "\"JOBOBJECT_BASIC_ACCOUNTING_INFORMATION\":{\"size\":%llu,\"ActiveProcesses\":%llu},"
      "\"JOBOBJECT_EXTENDED_LIMIT_INFORMATION\":{\"size\":%llu,\"BasicLimitInformation.LimitFlags\":%llu}},"
      "\"constants\":{\"PROC_THREAD_ATTRIBUTE_JOB_LIST\":%llu,\"PROC_THREAD_ATTRIBUTE_HANDLE_LIST\":%llu,\"EXTENDED_STARTUPINFO_PRESENT\":%llu,\"CREATE_UNICODE_ENVIRONMENT\":%llu,\"CREATE_NO_WINDOW\":%llu,\"STARTF_USESTDHANDLES\":%llu,\"JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE\":%llu,\"JobObjectBasicAccountingInformation\":%llu,\"JobObjectExtendedLimitInformation\":%llu,\"HANDLE_FLAG_INHERIT\":%llu,\"ERROR_INSUFFICIENT_BUFFER\":%llu,\"ERROR_BROKEN_PIPE\":%llu,\"WAIT_OBJECT_0\":%llu,\"WAIT_TIMEOUT\":%llu,\"WAIT_FAILED\":%llu}}\n",
      OWNED_PROCESS_ARCHITECTURE,
      static_cast<unsigned long long>(sizeof(void*)),
      static_cast<unsigned long long>(sizeof(STARTUPINFOEXW)),
      static_cast<unsigned long long>(offsetof(STARTUPINFOEXW, lpAttributeList)),
      static_cast<unsigned long long>(sizeof(STARTUPINFOW)),
      static_cast<unsigned long long>(offsetof(STARTUPINFOW, cb)),
      static_cast<unsigned long long>(offsetof(STARTUPINFOW, dwFlags)),
      static_cast<unsigned long long>(offsetof(STARTUPINFOW, hStdInput)),
      static_cast<unsigned long long>(offsetof(STARTUPINFOW, hStdOutput)),
      static_cast<unsigned long long>(offsetof(STARTUPINFOW, hStdError)),
      static_cast<unsigned long long>(sizeof(PROCESS_INFORMATION)),
      static_cast<unsigned long long>(offsetof(PROCESS_INFORMATION, hProcess)),
      static_cast<unsigned long long>(offsetof(PROCESS_INFORMATION, hThread)),
      static_cast<unsigned long long>(offsetof(PROCESS_INFORMATION, dwProcessId)),
      static_cast<unsigned long long>(offsetof(PROCESS_INFORMATION, dwThreadId)),
      static_cast<unsigned long long>(sizeof(JOBOBJECT_BASIC_ACCOUNTING_INFORMATION)),
      static_cast<unsigned long long>(offsetof(JOBOBJECT_BASIC_ACCOUNTING_INFORMATION, ActiveProcesses)),
      static_cast<unsigned long long>(sizeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION)),
      static_cast<unsigned long long>(
          offsetof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION, BasicLimitInformation) +
          offsetof(JOBOBJECT_BASIC_LIMIT_INFORMATION, LimitFlags)),
      static_cast<unsigned long long>(PROC_THREAD_ATTRIBUTE_JOB_LIST),
      static_cast<unsigned long long>(PROC_THREAD_ATTRIBUTE_HANDLE_LIST),
      static_cast<unsigned long long>(EXTENDED_STARTUPINFO_PRESENT),
      static_cast<unsigned long long>(CREATE_UNICODE_ENVIRONMENT),
      static_cast<unsigned long long>(CREATE_NO_WINDOW),
      static_cast<unsigned long long>(STARTF_USESTDHANDLES),
      static_cast<unsigned long long>(JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE),
      static_cast<unsigned long long>(JobObjectBasicAccountingInformation),
      static_cast<unsigned long long>(JobObjectExtendedLimitInformation),
      static_cast<unsigned long long>(HANDLE_FLAG_INHERIT),
      static_cast<unsigned long long>(ERROR_INSUFFICIENT_BUFFER),
      static_cast<unsigned long long>(ERROR_BROKEN_PIPE),
      static_cast<unsigned long long>(WAIT_OBJECT_0),
      static_cast<unsigned long long>(WAIT_TIMEOUT),
      static_cast<unsigned long long>(WAIT_FAILED));
  return 0;
}
