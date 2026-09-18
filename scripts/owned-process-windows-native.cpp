// Diagnostic only: two recorded failed creations via the Windows SDK, without
// Node or Koffi. Every sample is retained; the first call is NOT a warm-up.
#define _WIN32_WINNT 0x0A00
#include <windows.h>
#include <cstdio>
#include <cwchar>
#include <string>
#include <vector>

struct Failure { const char* operation; DWORD code; };
struct Sample { const char* phase; DWORD count; };
static void check(BOOL result, const char* operation) {
  if (!result) throw Failure{operation, GetLastError()};
}
static void sample(std::vector<Sample>& samples, const char* phase) {
  DWORD count = 0;
  check(GetProcessHandleCount(GetCurrentProcess(), &count), "GetProcessHandleCount");
  samples.push_back({phase, count});
}

int wmain(int argc, wchar_t** argv) {
  if (argc != 3 || std::wcslen(argv[1]) > 30000) return 2;
  // Only a missing absolute path in the parent's private root is supplied.
  if (GetFileAttributesW(argv[1]) != INVALID_FILE_ATTRIBUTES || GetLastError() != ERROR_FILE_NOT_FOUND) return 3;
  bool allClosed = true, completed = true;
  std::printf("{\"kind\":\"Windows SDK Failed-Creation Baseline\",\"iterations\":[");
  for (int iteration = 0; iteration < 2; ++iteration) {
    HANDLE owned[9]{};
    int handles = 0;
    LPPROC_THREAD_ATTRIBUTE_LIST attributes = nullptr;
    std::vector<unsigned char> storage;
    std::vector<Sample> samples;
    samples.reserve(20);
    DWORD createError = 0;
    const char* failure = nullptr;
    DWORD failureCode = 0, cleanupProbeError = 0;
    try {
      sample(samples, "before");
      owned[handles++] = CreateJobObjectW(nullptr, nullptr);
      check(owned[0] != nullptr, "CreateJobObjectW");
      JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};
      limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
      check(SetInformationJobObject(owned[0], JobObjectExtendedLimitInformation, &limits, sizeof(limits)), "SetInformationJobObject");
      sample(samples, "job");
      for (int pipe = 0; pipe < 3; ++pipe) {
        BOOL ok = CreatePipe(&owned[handles], &owned[handles + 1], nullptr, 0);
        handles += 2;
        check(ok, "CreatePipe");
        sample(samples, "pipe");
      }
      HANDLE inherited[] = {owned[1], owned[4], owned[6]};
      for (HANDLE handle : inherited) check(SetHandleInformation(handle, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT), "SetHandleInformation");
      SIZE_T size = 0;
      BOOL sized = InitializeProcThreadAttributeList(nullptr, 2, 0, &size);
      DWORD sizeError = GetLastError();
      if (sized || sizeError != ERROR_INSUFFICIENT_BUFFER) throw Failure{"attribute size", sizeError};
      storage.resize(size);
      auto candidate = reinterpret_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(storage.data());
      check(InitializeProcThreadAttributeList(candidate, 2, 0, &size), "InitializeProcThreadAttributeList");
      attributes = candidate;
      check(UpdateProcThreadAttribute(attributes, 0, PROC_THREAD_ATTRIBUTE_JOB_LIST, &owned[0], sizeof(HANDLE), nullptr, nullptr), "Job attribute");
      check(UpdateProcThreadAttribute(attributes, 0, PROC_THREAD_ATTRIBUTE_HANDLE_LIST, inherited, sizeof(inherited), nullptr, nullptr), "Handle attribute");
      sample(samples, "attributes");
      STARTUPINFOEXW startup{};
      startup.StartupInfo.cb = sizeof(startup);
      startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
      startup.StartupInfo.hStdInput = inherited[0];
      startup.StartupInfo.hStdOutput = inherited[1];
      startup.StartupInfo.hStdError = inherited[2];
      startup.lpAttributeList = attributes;
      PROCESS_INFORMATION info{};
      std::wstring command = L"\"" + std::wstring(argv[1]) + L"\"";
      wchar_t environment[] = L"\0";
      BOOL created = CreateProcessW(argv[1], command.data(), nullptr, nullptr, TRUE,
          CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT | EXTENDED_STARTUPINFO_PRESENT,
          environment, argv[2], &startup.StartupInfo, &info);
      createError = created ? ERROR_SUCCESS : GetLastError();
      if (info.hProcess) owned[handles++] = info.hProcess;
      if (info.hThread) owned[handles++] = info.hThread;
      if (created) {
        TerminateJobObject(owned[0], 1);
        WaitForSingleObject(info.hProcess, 5000);
        throw Failure{"unexpected successful creation", 0};
      }
      sample(samples, "create-failure");
      if (createError != ERROR_FILE_NOT_FOUND) throw Failure{"unexpected creation error", createError};
    } catch (const Failure& error) { failure = error.operation; failureCode = error.code; completed = false; }
    if (attributes) DeleteProcThreadAttributeList(attributes);
    int acquired = 0, released = 0;
    for (int index = handles - 1; index >= 0; --index) {
      if (!owned[index]) continue;
      ++acquired;
      if (CloseHandle(owned[index])) ++released;
      else allClosed = false;
    }
    try { sample(samples, "after-cleanup"); } catch (const Failure& error) {
      cleanupProbeError = error.code;
      if (!failure) { failure = error.operation; failureCode = error.code; }
      completed = false;
    }
    std::printf("%s{\"iteration\":%d,\"createError\":%lu,\"acquiredHandles\":%d,\"releasedHandles\":%d,\"failure\":\"%s\",\"failureCode\":%lu,\"cleanupProbeError\":%lu,\"samples\":[", iteration ? "," : "", iteration + 1, createError, acquired, released, failure ? failure : "", failureCode, cleanupProbeError);
    for (size_t i = 0; i < samples.size(); ++i) std::printf("%s{\"phase\":\"%s\",\"count\":%lu}", i ? "," : "", samples[i].phase, samples[i].count);
    std::printf("]}");
  }
  std::printf("],\"completed\":%s,\"allExplicitHandlesClosed\":%s}\n", completed ? "true" : "false", allClosed ? "true" : "false");
  return completed && allClosed ? 0 : 1;
}
