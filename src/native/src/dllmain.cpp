#include "../include/named_pipe_server.h"
#include "../include/shared_memory_ring.h"
#include "../include/virtual_camera_registrar.h"
#include "../include/virtual_camera_source.h"
#include "../include/decoupled_stream_clock.h"

#define NEXTHYKE_API extern "C" __declspec(dllexport)

static NextHyke::NamedPipeServer* g_pPipeServer = nullptr;
static NextHyke::SharedMemoryRing* g_pSharedMemory = nullptr;

BOOL APIENTRY DllMain(HMODULE hModule, DWORD ul_reason_for_call, LPVOID lpReserved) {
    switch (ul_reason_for_call) {
    case DLL_PROCESS_ATTACH:
        DisableThreadLibraryCalls(hModule);
        break;
    case DLL_PROCESS_DETACH:
        if (g_pPipeServer) {
            g_pPipeServer->Stop();
            delete g_pPipeServer;
            g_pPipeServer = nullptr;
        }
        if (g_pSharedMemory) {
            g_pSharedMemory->Close();
            delete g_pSharedMemory;
            g_pSharedMemory = nullptr;
        }
        break;
    }
    return TRUE;
}

NEXTHYKE_API bool NextHyke_InitIPC(uint32_t process_id) {
    if (!g_pPipeServer) {
        g_pPipeServer = new NextHyke::NamedPipeServer(process_id);
        g_pPipeServer->Start([](NextHyke::CommandType cmd, const std::string& payload) -> std::string {
            // Default echo / ack
            return "{\"status\":\"ok\"}";
        });
    }

    if (!g_pSharedMemory) {
        g_pSharedMemory = new NextHyke::SharedMemoryRing(process_id, true);
        if (!g_pSharedMemory->Initialize()) {
            return false;
        }
    }
    return true;
}

NEXTHYKE_API void NextHyke_CloseIPC() {
    if (g_pPipeServer) {
        g_pPipeServer->Stop();
        delete g_pPipeServer;
        g_pPipeServer = nullptr;
    }
    if (g_pSharedMemory) {
        g_pSharedMemory->Close();
        delete g_pSharedMemory;
        g_pSharedMemory = nullptr;
    }
}

NEXTHYKE_API bool NextHyke_WriteFrame(const uint8_t* rgba_data, uint32_t width, uint32_t height) {
    if (!g_pSharedMemory) return false;
    return g_pSharedMemory->WriteFrame(rgba_data, width, height);
}

NEXTHYKE_API bool NextHyke_ReadFrame(uint8_t* out_buffer, uint32_t max_size, NextHyke::SharedMemoryHeader* out_header) {
    if (!g_pSharedMemory) return false;
    return g_pSharedMemory->ReadLatestFrame(out_buffer, max_size, out_header);
}

static NextHyke::VirtualCameraSource* g_pVirtualCameraSource = nullptr;
static NextHyke::DecoupledStreamClock* g_pStreamClock = nullptr;

NEXTHYKE_API bool NextHyke_RegisterVirtualCamera(const wchar_t* friendlyName) {
    return NextHyke::VirtualCameraRegistrar::Instance().RegisterCamera(
        friendlyName ? friendlyName : L"NextHyke Processed Camera"
    );
}

NEXTHYKE_API bool NextHyke_UnregisterVirtualCamera() {
    return NextHyke::VirtualCameraRegistrar::Instance().UnregisterCamera();
}

NEXTHYKE_API bool NextHyke_IsVirtualCameraRegistered() {
    return NextHyke::VirtualCameraRegistrar::Instance().IsRegistered();
}

NEXTHYKE_API bool NextHyke_StartVirtualCameraStream(uint32_t session_id) {
    if (g_pVirtualCameraSource) return true;
    HRESULT hr = NextHyke::VirtualCameraSource::CreateInstance(session_id, &g_pVirtualCameraSource);
    if (FAILED(hr) || !g_pVirtualCameraSource) return false;
    return SUCCEEDED(g_pVirtualCameraSource->Start(nullptr, nullptr, nullptr));
}

NEXTHYKE_API void NextHyke_StopVirtualCameraStream() {
    if (g_pVirtualCameraSource) {
        g_pVirtualCameraSource->Stop();
        g_pVirtualCameraSource->Shutdown();
        g_pVirtualCameraSource->Release();
        g_pVirtualCameraSource = nullptr;
    }
}

NEXTHYKE_API bool NextHyke_StartDecoupledClock(double target_fps) {
    if (g_pStreamClock) return true;
    g_pStreamClock = new NextHyke::DecoupledStreamClock(target_fps);
    return g_pStreamClock->Start([](uint64_t frameIndex, uint64_t timestamp100ns, bool isRepeated) {
        // Frame ticked by decoupled clock
    });
}

NEXTHYKE_API void NextHyke_StopDecoupledClock() {
    if (g_pStreamClock) {
        g_pStreamClock->Stop();
        delete g_pStreamClock;
        g_pStreamClock = nullptr;
    }
}

NEXTHYKE_API void NextHyke_NotifyInferenceFrame(uint64_t frame_index) {
    if (g_pStreamClock) {
        g_pStreamClock->NotifyNewInferenceFrame(frame_index);
    }
}

NEXTHYKE_API void NextHyke_GetClockStats(uint64_t* out_published, uint64_t* out_repeated) {
    if (g_pStreamClock) {
        if (out_published) *out_published = g_pStreamClock->GetPublishedFrames();
        if (out_repeated) *out_repeated = g_pStreamClock->GetRepeatedFrames();
    } else {
        if (out_published) *out_published = 0;
        if (out_repeated) *out_repeated = 0;
    }
}

