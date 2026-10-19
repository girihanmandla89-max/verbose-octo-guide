#include "../include/shared_memory_ring.h"
#include <iostream>
#include <sstream>
#include <chrono>

namespace NextHyke {

SharedMemoryRing::SharedMemoryRing(uint32_t session_id, bool is_creator)
    : m_sessionId(session_id)
    , m_isCreator(is_creator)
    , m_hMapFile(nullptr)
    , m_pView(nullptr)
    , m_hMutex(nullptr)
{
    std::wstringstream ss;
    ss << L"Local\\NextHyke_SharedMem_" << m_sessionId;
    m_mapName = ss.str();

    for (uint32_t i = 0; i < SHM_BUFFER_COUNT; ++i) {
        m_hFrameReadyEvents[i] = nullptr;
    }
}

SharedMemoryRing::~SharedMemoryRing() {
    Close();
}

bool SharedMemoryRing::Initialize() {
    std::wstring mutexName = m_mapName + L"_Mutex";
    m_hMutex = CreateMutexW(nullptr, FALSE, mutexName.c_str());

    for (uint32_t i = 0; i < SHM_BUFFER_COUNT; ++i) {
        std::wstringstream evName;
        evName << m_mapName << L"_Ready_" << i;
        m_hFrameReadyEvents[i] = CreateEventW(nullptr, FALSE, FALSE, evName.str().c_str());
    }

    if (m_isCreator) {
        m_hMapFile = CreateFileMappingW(
            INVALID_HANDLE_VALUE,
            nullptr,
            PAGE_READWRITE,
            0,
            TOTAL_RING_ARENA_SIZE,
            m_mapName.c_str()
        );
    } else {
        m_hMapFile = OpenFileMappingW(
            FILE_MAP_ALL_ACCESS,
            FALSE,
            m_mapName.c_str()
        );
    }

    if (!m_hMapFile) {
        return false;
    }

    m_pView = static_cast<uint8_t*>(MapViewOfFile(
        m_hMapFile,
        FILE_MAP_ALL_ACCESS,
        0,
        0,
        TOTAL_RING_ARENA_SIZE
    ));

    if (!m_pView) {
        Close();
        return false;
    }

    if (m_isCreator) {
        // Initialize header
        auto* header = reinterpret_cast<SharedMemoryHeader*>(m_pView);
        memset(header, 0, sizeof(SharedMemoryHeader));
        header->magic = SHM_MAGIC;
        header->version = SHM_VERSION;
        header->width = MAX_FRAME_WIDTH;
        header->height = MAX_FRAME_HEIGHT;
        header->stride = MAX_FRAME_WIDTH * BYTES_PER_PIXEL;
        header->format = 0; // RGBA32
        header->frame_index = 0;
        header->active_writer_buffer = 0;
        header->active_reader_buffer = 0;
    }

    return true;
}

void SharedMemoryRing::Close() {
    if (m_pView) {
        UnmapViewOfFile(m_pView);
        m_pView = nullptr;
    }
    if (m_hMapFile) {
        CloseHandle(m_hMapFile);
        m_hMapFile = nullptr;
    }
    if (m_hMutex) {
        CloseHandle(m_hMutex);
        m_hMutex = nullptr;
    }
    for (uint32_t i = 0; i < SHM_BUFFER_COUNT; ++i) {
        if (m_hFrameReadyEvents[i]) {
            CloseHandle(m_hFrameReadyEvents[i]);
            m_hFrameReadyEvents[i] = nullptr;
        }
    }
}

uint8_t* SharedMemoryRing::GetBufferPointer(uint32_t buffer_idx) {
    if (!m_pView || buffer_idx >= SHM_BUFFER_COUNT) return nullptr;
    return m_pView + SHM_HEADER_SIZE + (buffer_idx * MAX_FRAME_SIZE);
}

const SharedMemoryHeader* SharedMemoryRing::GetHeader() const {
    if (!m_pView) return nullptr;
    return reinterpret_cast<const SharedMemoryHeader*>(m_pView);
}

bool SharedMemoryRing::WriteFrame(const uint8_t* rgba_data, uint32_t width, uint32_t height) {
    if (!m_pView || !rgba_data || width > MAX_FRAME_WIDTH || height > MAX_FRAME_HEIGHT) return false;

    auto* header = reinterpret_cast<SharedMemoryHeader*>(m_pView);

    // Acquire next available write buffer (avoid reader buffer)
    uint32_t nextWriteIdx = (header->active_writer_buffer + 1) % SHM_BUFFER_COUNT;
    if (nextWriteIdx == header->active_reader_buffer) {
        nextWriteIdx = (nextWriteIdx + 1) % SHM_BUFFER_COUNT;
    }

    uint8_t* pDest = GetBufferPointer(nextWriteIdx);
    uint32_t bytesToCopy = width * height * BYTES_PER_PIXEL;
    memcpy(pDest, rgba_data, bytesToCopy);

    // Update atomic header
    WaitForSingleObject(m_hMutex, 5);
    header->width = width;
    header->height = height;
    header->stride = width * BYTES_PER_PIXEL;
    header->active_writer_buffer = nextWriteIdx;
    header->active_reader_buffer = nextWriteIdx;
    header->frame_index++;

    auto now = std::chrono::system_clock::now().time_since_epoch();
    header->timestamp_us = std::chrono::duration_cast<std::chrono::microseconds>(now).count();
    ReleaseMutex(m_hMutex);

    // Signal reader
    if (m_hFrameReadyEvents[nextWriteIdx]) {
        SetEvent(m_hFrameReadyEvents[nextWriteIdx]);
    }

    return true;
}

bool SharedMemoryRing::ReadLatestFrame(uint8_t* out_buffer, uint32_t max_buffer_size, SharedMemoryHeader* out_header) {
    if (!m_pView || !out_buffer) return false;

    auto* header = reinterpret_cast<SharedMemoryHeader*>(m_pView);

    WaitForSingleObject(m_hMutex, 5);
    uint32_t readIdx = header->active_reader_buffer;
    uint32_t frameBytes = header->width * header->height * BYTES_PER_PIXEL;

    if (out_header) {
        memcpy(out_header, header, sizeof(SharedMemoryHeader));
    }
    ReleaseMutex(m_hMutex);

    if (max_buffer_size < frameBytes) return false;

    uint8_t* pSrc = GetBufferPointer(readIdx);
    memcpy(out_buffer, pSrc, frameBytes);

    return true;
}

} // namespace NextHyke
