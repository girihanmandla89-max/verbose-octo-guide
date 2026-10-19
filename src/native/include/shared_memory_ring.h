#pragma once

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif

#include <windows.h>
#include <cstdint>
#include <string>

namespace NextHyke {

constexpr uint32_t SHM_MAGIC = 0x48594B45; // "HYKE"
constexpr uint32_t SHM_VERSION = 1;
constexpr uint32_t SHM_BUFFER_COUNT = 3;
constexpr uint32_t MAX_FRAME_WIDTH = 1920;
constexpr uint32_t MAX_FRAME_HEIGHT = 1080;
constexpr uint32_t BYTES_PER_PIXEL = 4; // RGBA32
constexpr uint32_t MAX_FRAME_SIZE = MAX_FRAME_WIDTH * MAX_FRAME_HEIGHT * BYTES_PER_PIXEL; // 8,294,400 bytes
constexpr uint32_t SHM_HEADER_SIZE = 4096;
constexpr uint32_t TOTAL_RING_ARENA_SIZE = SHM_HEADER_SIZE + (SHM_BUFFER_COUNT * MAX_FRAME_SIZE); // ~24.88 MB

#pragma pack(push, 1)
struct SharedMemoryHeader {
    uint32_t magic;                 // Must equal SHM_MAGIC
    uint32_t version;               // Must equal SHM_VERSION
    uint32_t width;                 // Active frame width (e.g., 1920 or 1280)
    uint32_t height;                // Active frame height (e.g., 1080 or 720)
    uint32_t stride;                // Bytes per row (width * 4)
    uint32_t format;                // 0 = RGBA32, 1 = NV12
    uint64_t frame_index;           // Monotonically increasing counter
    uint32_t active_writer_buffer;  // Index of buffer currently being written (0, 1, or 2)
    uint32_t active_reader_buffer;  // Index of buffer holding latest valid frame (0, 1, or 2)
    uint64_t timestamp_us;          // Microseconds since Unix epoch
    uint32_t reserved[64];          // Reserved for future extensions
};
#pragma pack(pop)

class SharedMemoryRing {
public:
    SharedMemoryRing(uint32_t session_id, bool is_creator);
    ~SharedMemoryRing();

    bool Initialize();
    void Close();

    bool WriteFrame(const uint8_t* rgba_data, uint32_t width, uint32_t height);
    bool ReadLatestFrame(uint8_t* out_buffer, uint32_t max_buffer_size, SharedMemoryHeader* out_header);

    const SharedMemoryHeader* GetHeader() const;
    uint32_t GetArenaSizeBytes() const { return TOTAL_RING_ARENA_SIZE; }

private:
    uint8_t* GetBufferPointer(uint32_t buffer_idx);

    uint32_t m_sessionId;
    bool m_isCreator;
    std::wstring m_mapName;
    HANDLE m_hMapFile;
    uint8_t* m_pView;
    HANDLE m_hMutex;
    HANDLE m_hFrameReadyEvents[SHM_BUFFER_COUNT];
};

} // namespace NextHyke
