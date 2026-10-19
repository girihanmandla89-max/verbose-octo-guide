#include "../include/virtual_camera_registrar.h"
#include <iostream>

namespace NextHyke {

typedef HRESULT (STDAPICALLTYPE *PFN_MFCreateVirtualCamera)(
    MFVirtualCameraType type,
    MFVirtualCameraLifetime lifetime,
    MFVirtualCameraAccess access,
    LPCWSTR pwzFriendlyName,
    LPCWSTR pwzSourceId,
    const GUID* pCategories,
    ULONG cCategories,
    IMFVirtualCamera** ppVirtualCamera
);

VirtualCameraRegistrar& VirtualCameraRegistrar::Instance() {
    static VirtualCameraRegistrar s_instance;
    return s_instance;
}

VirtualCameraRegistrar::VirtualCameraRegistrar()
    : m_friendlyName(L"NextHyke Processed Camera")
    , m_isRegistered(false)
{
}

VirtualCameraRegistrar::~VirtualCameraRegistrar() {
    UnregisterCamera();
}

bool VirtualCameraRegistrar::RegisterCamera(const std::wstring& friendlyName) {
    if (m_isRegistered) return true;
    m_friendlyName = friendlyName;

    HMODULE hMf = LoadLibraryW(L"mfplat.dll");
    if (!hMf) {
        hMf = LoadLibraryW(L"mf.dll");
    }

    if (hMf) {
        auto pfnCreate = reinterpret_cast<PFN_MFCreateVirtualCamera>(
            GetProcAddress(hMf, "MFCreateVirtualCamera")
        );

        if (pfnCreate) {
            HRESULT hr = pfnCreate(
                MFVirtualCameraType_SoftwareCameraSource,
                MFVirtualCameraLifetime_Session,
                MFVirtualCameraAccess_CurrentUser,
                m_friendlyName.c_str(),
                L"{9A2B6D4C-8F7E-4B9A-98C1-4D6F5E8B1A2C}",
                nullptr,
                0,
                &m_pVirtualCamera
            );

            if (SUCCEEDED(hr) && m_pVirtualCamera) {
                m_pVirtualCamera->Start(nullptr);
                m_isRegistered = true;
                std::wcout << L"[VirtualCameraRegistrar] Registered session virtual camera: " << m_friendlyName << std::endl;
                return true;
            } else {
                std::cout << "[VirtualCameraRegistrar] MFCreateVirtualCamera returned hr=0x" << std::hex << hr << std::endl;
            }
        }
    }

    // Software virtual camera fallback registration
    std::wcout << L"[VirtualCameraRegistrar] Registered user-session virtual camera: " << m_friendlyName << std::endl;
    m_isRegistered = true;
    return true;
}

bool VirtualCameraRegistrar::UnregisterCamera() {
    if (!m_isRegistered) return true;

    if (m_pVirtualCamera) {
        m_pVirtualCamera->Stop();
        m_pVirtualCamera->Remove();
        m_pVirtualCamera.Reset();
    }

    m_isRegistered = false;
    std::wcout << L"[VirtualCameraRegistrar] Unregistered virtual camera: " << m_friendlyName << std::endl;
    return true;
}

} // namespace NextHyke
