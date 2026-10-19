#pragma once

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif

#include <windows.h>
#include <mfapi.h>
#include <mfidl.h>
#include <mfreadwrite.h>
#include <mferror.h>
#include <wrl/client.h>
#include <cstdint>
#include <string>
#include <atomic>

#include "shared_memory_ring.h"

namespace NextHyke {

class VirtualCameraStream;

class VirtualCameraSource : public IMFMediaSource {
public:
    static HRESULT CreateInstance(uint32_t session_id, VirtualCameraSource** ppSource);

    // IUnknown
    STDMETHODIMP QueryInterface(REFIID riid, void** ppv) override;
    STDMETHODIMP_(ULONG) AddRef() override;
    STDMETHODIMP_(ULONG) Release() override;

    // IMFMediaEventGenerator
    STDMETHODIMP GetEvent(DWORD dwFlags, IMFMediaEvent** ppEvent) override;
    STDMETHODIMP BeginGetEvent(IMFAsyncCallback* pCallback, IUnknown* punkState) override;
    STDMETHODIMP EndGetEvent(IMFAsyncResult* pResult, IMFMediaEvent** ppEvent) override;
    STDMETHODIMP QueueEvent(MediaEventType met, REFGUID guidExtendedType, HRESULT hrStatus, const PROPVARIANT* pvValue) override;

    // IMFMediaSource
    STDMETHODIMP GetCharacteristics(DWORD* pdwCharacteristics) override;
    STDMETHODIMP CreatePresentationDescriptor(IMFPresentationDescriptor** ppPresentationDescriptor) override;
    STDMETHODIMP Start(IMFPresentationDescriptor* pPresentationDescriptor, const GUID* pguidTimeFormat, const PROPVARIANT* pvarStartPosition) override;
    STDMETHODIMP Stop() override;
    STDMETHODIMP Pause() override;
    STDMETHODIMP Shutdown() override;

    SharedMemoryRing* GetSharedMemoryRing() { return m_pSharedMemory.get(); }

private:
    explicit VirtualCameraSource(uint32_t session_id);
    virtual ~VirtualCameraSource();

    HRESULT Initialize();
    HRESULT CreateDescriptors();

    std::atomic<ULONG> m_refCount;
    CRITICAL_SECTION m_critSec;
    uint32_t m_sessionId;
    std::unique_ptr<SharedMemoryRing> m_pSharedMemory;

    Microsoft::WRL::ComPtr<IMFMediaEventQueue> m_pEventQueue;
    Microsoft::WRL::ComPtr<IMFPresentationDescriptor> m_pPresentationDescriptor;
    Microsoft::WRL::ComPtr<IMFStreamDescriptor> m_pStreamDescriptor;
    Microsoft::WRL::ComPtr<VirtualCameraStream> m_pStream;

    bool m_isShutdown;
};

} // namespace NextHyke
