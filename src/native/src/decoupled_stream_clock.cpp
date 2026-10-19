#include "../include/decoupled_stream_clock.h"
#include <iostream>

namespace NextHyke {

DecoupledStreamClock::DecoupledStreamClock(double targetFps)
    : m_targetFps(targetFps)
    , m_intervalUs(static_cast<uint64_t>(1000000.0 / targetFps))
    , m_isRunning(false)
    , m_latestInferenceFrame(0)
    , m_lastPublishedInferenceFrame(0)
    , m_publishedFrames(0)
    , m_repeatedFrames(0)
    , m_hThread(nullptr)
    , m_hStopEvent(nullptr)
{
    QueryPerformanceFrequency(&m_qpcFrequency);
    m_hStopEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);
}

DecoupledStreamClock::~DecoupledStreamClock() {
    Stop();
    if (m_hStopEvent) {
        CloseHandle(m_hStopEvent);
        m_hStopEvent = nullptr;
    }
}

bool DecoupledStreamClock::Start(FramePublishCallback callback) {
    if (m_isRunning) return true;

    m_callback = callback;
    m_isRunning = true;
    m_publishedFrames = 0;
    m_repeatedFrames = 0;
    ResetEvent(m_hStopEvent);

    m_hThread = CreateThread(
        nullptr,
        0,
        [](LPVOID param) -> DWORD {
            auto* self = static_cast<DecoupledStreamClock*>(param);
            self->ClockWorkerThread();
            return 0;
        },
        this,
        0,
        nullptr
    );

    return (m_hThread != nullptr);
}

void DecoupledStreamClock::Stop() {
    if (!m_isRunning) return;
    m_isRunning = false;

    if (m_hStopEvent) {
        SetEvent(m_hStopEvent);
    }
    if (m_hThread) {
        WaitForSingleObject(m_hThread, 2000);
        CloseHandle(m_hThread);
        m_hThread = nullptr;
    }
}

void DecoupledStreamClock::NotifyNewInferenceFrame(uint64_t frameIndex) {
    m_latestInferenceFrame = frameIndex;
}

void DecoupledStreamClock::ClockWorkerThread() {
    // Elevate clock thread priority for rock-solid 30.00 FPS cadence
    SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_TIME_CRITICAL);

    LARGE_INTEGER qpcStart, qpcNow;
    QueryPerformanceCounter(&qpcStart);

    uint64_t frameCount = 0;
    const double qpcTicksPerUs = static_cast<double>(m_qpcFrequency.QuadPart) / 1000000.0;
    const double qpcTicksPerFrame = m_intervalUs * qpcTicksPerUs;

    LONGLONG nextTargetTicks = qpcStart.QuadPart;

    while (m_isRunning) {
        frameCount++;
        nextTargetTicks += static_cast<LONGLONG>(qpcTicksPerFrame);

        // Check if inference produced a new frame or if we must repeat the last frame
        uint64_t currentInference = m_latestInferenceFrame.load();
        bool isRepeated = (currentInference == m_lastPublishedInferenceFrame.load());

        if (isRepeated) {
            m_repeatedFrames++;
        } else {
            m_lastPublishedInferenceFrame = currentInference;
        }

        m_publishedFrames++;
        uint64_t timestamp100ns = frameCount * 333333; // 33.33ms in 100ns units

        if (m_callback) {
            m_callback(frameCount, timestamp100ns, isRepeated);
        }

        // High-precision sleep until nextTargetTicks
        QueryPerformanceCounter(&qpcNow);
        LONGLONG ticksRemaining = nextTargetTicks - qpcNow.QuadPart;

        if (ticksRemaining > 0) {
            double usRemaining = ticksRemaining / qpcTicksPerUs;
            if (usRemaining > 2000.0) {
                // Sleep for coarse duration
                DWORD sleepMs = static_cast<DWORD>((usRemaining - 1500.0) / 1000.0);
                if (sleepMs > 0) {
                    WaitForSingleObject(m_hStopEvent, sleepMs);
                }
            }
            // Fine spin-wait for sub-millisecond precision
            while (m_isRunning) {
                QueryPerformanceCounter(&qpcNow);
                if (qpcNow.QuadPart >= nextTargetTicks) {
                    break;
                }
            }
        }
    }
}

} // namespace NextHyke
