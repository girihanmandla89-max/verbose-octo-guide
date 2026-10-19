#include "../include/named_pipe_server.h"
#include <iostream>
#include <sstream>

namespace NextHyke {

NamedPipeServer::NamedPipeServer(uint32_t process_id)
    : m_pid(process_id)
    , m_hPipe(INVALID_HANDLE_VALUE)
    , m_hStopEvent(nullptr)
    , m_hWorkerThread(nullptr)
    , m_isRunning(false)
    , m_isConnected(false)
{
    std::wstringstream ss;
    ss << L"\\\\.\\pipe\\NextHyke_Control_" << m_pid;
    m_pipeName = ss.str();
    m_hStopEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);
}

NamedPipeServer::~NamedPipeServer() {
    Stop();
    if (m_hStopEvent) {
        CloseHandle(m_hStopEvent);
        m_hStopEvent = nullptr;
    }
}

bool NamedPipeServer::Start(CommandCallback callback) {
    if (m_isRunning) return true;

    m_callback = callback;
    m_isRunning = true;
    ResetEvent(m_hStopEvent);

    m_hWorkerThread = CreateThread(
        nullptr,
        0,
        [](LPVOID param) -> DWORD {
            auto* self = static_cast<NamedPipeServer*>(param);
            self->ServerWorkerThread();
            return 0;
        },
        this,
        0,
        nullptr
    );

    return (m_hWorkerThread != nullptr);
}

void NamedPipeServer::Stop() {
    m_isRunning = false;
    if (m_hStopEvent) {
        SetEvent(m_hStopEvent);
    }

    if (m_hPipe != INVALID_HANDLE_VALUE) {
        DisconnectNamedPipe(m_hPipe);
        CloseHandle(m_hPipe);
        m_hPipe = INVALID_HANDLE_VALUE;
    }

    if (m_hWorkerThread) {
        WaitForSingleObject(m_hWorkerThread, 2000);
        CloseHandle(m_hWorkerThread);
        m_hWorkerThread = nullptr;
    }
    m_isConnected = false;
}

bool NamedPipeServer::IsConnected() const {
    return m_isConnected;
}

std::wstring NamedPipeServer::GetPipeName() const {
    return m_pipeName;
}

void NamedPipeServer::ServerWorkerThread() {
    while (m_isRunning) {
        m_hPipe = CreateNamedPipeW(
            m_pipeName.c_str(),
            PIPE_ACCESS_DUPLEX | FILE_FLAG_OVERLAPPED,
            PIPE_TYPE_MESSAGE | PIPE_READMODE_MESSAGE | PIPE_WAIT,
            1, // Max instances
            DEFAULT_PIPE_BUFFER_SIZE,
            DEFAULT_PIPE_BUFFER_SIZE,
            5000,
            nullptr
        );

        if (m_hPipe == INVALID_HANDLE_VALUE) {
            Sleep(100);
            continue;
        }

        OVERLAPPED ovConnect = {};
        ovConnect.hEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);

        BOOL connected = ConnectNamedPipe(m_hPipe, &ovConnect);
        if (!connected) {
            DWORD err = GetLastError();
            if (err == ERROR_IO_PENDING) {
                HANDLE waitHandles[2] = { ovConnect.hEvent, m_hStopEvent };
                DWORD waitRes = WaitForMultipleObjects(2, waitHandles, FALSE, INFINITE);
                if (waitRes == WAIT_OBJECT_0) {
                    m_isConnected = true;
                } else {
                    // Stop event signalled
                    CloseHandle(ovConnect.hEvent);
                    CloseHandle(m_hPipe);
                    m_hPipe = INVALID_HANDLE_VALUE;
                    break;
                }
            } else if (err == ERROR_PIPE_CONNECTED) {
                m_isConnected = true;
            }
        } else {
            m_isConnected = true;
        }

        CloseHandle(ovConnect.hEvent);

        // Process messages while client is connected
        std::vector<uint8_t> readBuffer(DEFAULT_PIPE_BUFFER_SIZE);
        while (m_isRunning && m_isConnected) {
            OVERLAPPED ovRead = {};
            ovRead.hEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);
            DWORD bytesRead = 0;

            BOOL readOk = ReadFile(m_hPipe, readBuffer.data(), static_cast<DWORD>(readBuffer.size()), &bytesRead, &ovRead);
            if (!readOk && GetLastError() == ERROR_IO_PENDING) {
                HANDLE readHandles[2] = { ovRead.hEvent, m_hStopEvent };
                DWORD waitRead = WaitForMultipleObjects(2, readHandles, FALSE, INFINITE);
                if (waitRead == WAIT_OBJECT_0) {
                    GetOverlappedResult(m_hPipe, &ovRead, &bytesRead, FALSE);
                    readOk = TRUE;
                } else {
                    CloseHandle(ovRead.hEvent);
                    break;
                }
            }
            CloseHandle(ovRead.hEvent);

            if (!readOk || bytesRead < sizeof(PipePacketHeader)) {
                // Client disconnected
                m_isConnected = false;
                break;
            }

            auto* header = reinterpret_cast<PipePacketHeader*>(readBuffer.data());
            if (header->magic != PIPE_MAGIC) {
                m_isConnected = false;
                break;
            }

            std::string payload;
            if (header->payload_size > 0 && bytesRead >= sizeof(PipePacketHeader) + header->payload_size) {
                payload.assign(reinterpret_cast<char*>(readBuffer.data() + sizeof(PipePacketHeader)), header->payload_size);
            }

            std::string responsePayload = "{}";
            if (m_callback) {
                responsePayload = m_callback(static_cast<CommandType>(header->command_id), payload);
            }

            // Send response packet
            PipePacketHeader respHeader = {};
            respHeader.magic = PIPE_MAGIC;
            respHeader.command_id = header->command_id;
            respHeader.payload_size = static_cast<uint32_t>(responsePayload.size());
            respHeader.sequence_id = header->sequence_id + 1;

            std::vector<uint8_t> writeBuffer(sizeof(PipePacketHeader) + respHeader.payload_size);
            memcpy(writeBuffer.data(), &respHeader, sizeof(PipePacketHeader));
            if (!responsePayload.empty()) {
                memcpy(writeBuffer.data() + sizeof(PipePacketHeader), responsePayload.data(), responsePayload.size());
            }

            DWORD bytesWritten = 0;
            WriteFile(m_hPipe, writeBuffer.data(), static_cast<DWORD>(writeBuffer.size()), &bytesWritten, nullptr);
        }

        DisconnectNamedPipe(m_hPipe);
        CloseHandle(m_hPipe);
        m_hPipe = INVALID_HANDLE_VALUE;
        m_isConnected = false;
    }
}

} // namespace NextHyke
