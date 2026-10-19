#pragma once

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif

#include <windows.h>
#include <cstdint>
#include <functional>
#include <atomic>

namespace NextHyke {

class DecoupledStreamClock {
public:
    using FramePublishCallback = std::function<void(uint64_t frameIndex, uint64_t timestamp100ns, bool isRepeated)>;

    explicit DecoupledStreamClock(double targetFps = 30.0);
    ~DecoupledStreamClock();

    bool Start(FramePublishCallback callback);
    void Stop();
    void NotifyNewInferenceFrame(uint64_t frameIndex);

    bool IsRunning() const { return m_isRunning; }
    double GetTargetFps() const { return m_targetFps; }
    uint64_t GetPublishedFrames() const { return m_publishedFrames; }
    uint64_t GetRepeatedFrames() const { return m_repeatedFrames; }

private:
    void ClockWorkerThread();

    double m_targetFps;
    uint64_t m_intervalUs; // ~33,333 us for 30 FPS
    std::atomic<bool> m_isRunning;
    std::atomic<uint64_t> m_latestInferenceFrame;
    std::atomic<uint64_t> m_lastPublishedInferenceFrame;
    std::atomic<uint64_t> m_publishedFrames;
    std::atomic<uint64_t> m_repeatedFrames;

    HANDLE m_hThread;
    HANDLE m_hStopEvent;
    FramePublishCallback m_callback;
    LARGE_INTEGER m_qpcFrequency;
};

} // namespace NextHyke
