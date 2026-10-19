#pragma once

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif

#include <windows.h>
#include <mfvirtualcamera.h>
#include <mfapi.h>
#include <wrl/client.h>
#include <string>

namespace NextHyke {

class VirtualCameraRegistrar {
public:
    static VirtualCameraRegistrar& Instance();

    bool RegisterCamera(const std::wstring& friendlyName = L"NextHyke Processed Camera");
    bool UnregisterCamera();
    bool IsRegistered() const { return m_isRegistered; }
    std::wstring GetCameraName() const { return m_friendlyName; }

private:
    VirtualCameraRegistrar();
    ~VirtualCameraRegistrar();

    std::wstring m_friendlyName;
    bool m_isRegistered;
    Microsoft::WRL::ComPtr<IMFVirtualCamera> m_pVirtualCamera;
};

} // namespace NextHyke
