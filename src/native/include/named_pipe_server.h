#pragma once

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif

#include <windows.h>
#include <string>
#include <functional>
#include <atomic>
#include <vector>

namespace NextHyke {

constexpr uint32_t PIPE_MAGIC = 0x48594B45; // "HYKE"
constexpr uint32_t DEFAULT_PIPE_BUFFER_SIZE = 65536; // 64 KB command buffer

enum class CommandType : uint32_t {
    CMD_INIT = 1,
    CMD_LOAD_MODELS = 2,
    CMD_START_STREAM = 3,
    CMD_STOP_STREAM = 4,
    CMD_GET_TELEMETRY = 5,
    CMD_HEARTBEAT = 6,
    CMD_SHUTDOWN = 99
};

#pragma pack(push, 1)
struct PipePacketHeader {
    uint32_t magic;         // Must equal PIPE_MAGIC
    uint32_t command_id;    // CommandType value
    uint32_t payload_size;  // Size of following JSON/binary payload
    uint32_t sequence_id;   // Monotonic sequence number
};
#pragma pack(pop)

using CommandCallback = std::function<std::string(CommandType cmd, const std::string& payload)>;

class NamedPipeServer {
public:
    explicit NamedPipeServer(uint32_t process_id);
    ~NamedPipeServer();

    bool Start(CommandCallback callback);
    void Stop();
    bool IsConnected() const;
    std::wstring GetPipeName() const;

private:
    void ServerWorkerThread();

    uint32_t m_pid;
    std::wstring m_pipeName;
    HANDLE m_hPipe;
    HANDLE m_hStopEvent;
    HANDLE m_hWorkerThread;
    std::atomic<bool> m_isRunning;
    std::atomic<bool> m_isConnected;
    CommandCallback m_callback;
};

} // namespace NextHyke
