#include "../include/named_pipe_server.h"
#include "../include/shared_memory_ring.h"

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
