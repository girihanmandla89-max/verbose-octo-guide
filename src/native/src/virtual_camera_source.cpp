#include "../include/virtual_camera_source.h"
#include <iostream>
#include <vector>

namespace NextHyke {

class VirtualCameraStream : public IMFMediaStream {
public:
    static HRESULT CreateInstance(VirtualCameraSource* pSource, IMFStreamDescriptor* pSD, VirtualCameraStream** ppStream);

    // IUnknown
    STDMETHODIMP QueryInterface(REFIID riid, void** ppv) override;
    STDMETHODIMP_(ULONG) AddRef() override;
    STDMETHODIMP_(ULONG) Release() override;

    // IMFMediaEventGenerator
    STDMETHODIMP GetEvent(DWORD dwFlags, IMFMediaEvent** ppEvent) override;
    STDMETHODIMP BeginGetEvent(IMFAsyncCallback* pCallback, IUnknown* punkState) override;
    STDMETHODIMP EndGetEvent(IMFAsyncResult* pResult, IMFMediaEvent** ppEvent) override;
    STDMETHODIMP QueueEvent(MediaEventType met, REFGUID guidExtendedType, HRESULT hrStatus, const PROPVARIANT* pvValue) override;

    // IMFMediaStream
    STDMETHODIMP GetMediaSource(IMFMediaSource** ppMediaSource) override;
    STDMETHODIMP GetStreamDescriptor(IMFStreamDescriptor** ppStreamDescriptor) override;
    STDMETHODIMP RequestSample(IUnknown* pToken) override;

    HRESULT Start();
    HRESULT Stop();
    HRESULT Shutdown();

private:
    VirtualCameraStream(VirtualCameraSource* pSource, IMFStreamDescriptor* pSD);
    virtual ~VirtualCameraStream();

    HRESULT DeliverSample();

    std::atomic<ULONG> m_refCount;
    CRITICAL_SECTION m_critSec;
    VirtualCameraSource* m_pSource;
    Microsoft::WRL::ComPtr<IMFStreamDescriptor> m_pSD;
    Microsoft::WRL::ComPtr<IMFMediaEventQueue> m_pEventQueue;
    bool m_isActive;
    bool m_isShutdown;
    LONGLONG m_sampleTime100ns;
    std::vector<uint8_t> m_sampleBuffer;
};

// =========================================================================
// VirtualCameraSource Implementation
// =========================================================================

HRESULT VirtualCameraSource::CreateInstance(uint32_t session_id, VirtualCameraSource** ppSource) {
    if (!ppSource) return E_POINTER;
    *ppSource = nullptr;

    auto* source = new VirtualCameraSource(session_id);
    HRESULT hr = source->Initialize();
    if (FAILED(hr)) {
        delete source;
        return hr;
    }

    *ppSource = source;
    return S_OK;
}

VirtualCameraSource::VirtualCameraSource(uint32_t session_id)
    : m_refCount(1)
    , m_sessionId(session_id)
    , m_isShutdown(false)
{
    InitializeCriticalSection(&m_critSec);
    m_pSharedMemory = std::make_unique<SharedMemoryRing>(session_id, false);
}

VirtualCameraSource::~VirtualCameraSource() {
    Shutdown();
    DeleteCriticalSection(&m_critSec);
}

HRESULT VirtualCameraSource::Initialize() {
    HRESULT hr = MFCreateEventQueue(&m_pEventQueue);
    if (FAILED(hr)) return hr;

    if (!m_pSharedMemory->Initialize()) {
        std::cout << "[VirtualCameraSource] Attaching to SHM ring for session " << m_sessionId << std::endl;
    }

    return CreateDescriptors();
}

HRESULT VirtualCameraSource::CreateDescriptors() {
    Microsoft::WRL::ComPtr<IMFMediaType> pMediaType;
    HRESULT hr = MFCreateMediaType(&pMediaType);
    if (FAILED(hr)) return hr;

    hr = pMediaType->SetGUID(MF_MT_MAJOR_TYPE, MFMediaType_Video);
    if (FAILED(hr)) return hr;
    hr = pMediaType->SetGUID(MF_MT_SUBTYPE, MFVideoFormat_RGB32);
    if (FAILED(hr)) return hr;
    hr = MFSetAttributeSize(pMediaType.Get(), MF_MT_FRAME_SIZE, 1920, 1080);
    if (FAILED(hr)) return hr;
    hr = MFSetAttributeRatio(pMediaType.Get(), MF_MT_FRAME_RATE, 30, 1);
    if (FAILED(hr)) return hr;
    hr = MFSetAttributeRatio(pMediaType.Get(), MF_MT_PIXEL_ASPECT_RATIO, 1, 1);
    if (FAILED(hr)) return hr;
    hr = pMediaType->SetUINT32(MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive);
    if (FAILED(hr)) return hr;

    IMFMediaType* mediaTypes[1] = { pMediaType.Get() };
    Microsoft::WRL::ComPtr<IMFMediaTypeHandler> pHandler;
    hr = MFCreateStreamDescriptor(0, 1, mediaTypes, &m_pStreamDescriptor);
    if (FAILED(hr)) return hr;

    hr = m_pStreamDescriptor->GetMediaTypeHandler(&pHandler);
    if (FAILED(hr)) return hr;
    hr = pHandler->SetCurrentMediaType(pMediaType.Get());
    if (FAILED(hr)) return hr;

    IMFStreamDescriptor* streamDescriptors[1] = { m_pStreamDescriptor.Get() };
    hr = MFCreatePresentationDescriptor(1, streamDescriptors, &m_pPresentationDescriptor);
    if (FAILED(hr)) return hr;

    hr = m_pPresentationDescriptor->SelectStream(0);
    if (FAILED(hr)) return hr;

    return VirtualCameraStream::CreateInstance(this, m_pStreamDescriptor.Get(), &m_pStream);
}

STDMETHODIMP VirtualCameraSource::QueryInterface(REFIID riid, void** ppv) {
    if (!ppv) return E_POINTER;
    if (riid == IID_IUnknown || riid == IID_IMFMediaEventGenerator || riid == IID_IMFMediaSource) {
        *ppv = static_cast<IMFMediaSource*>(this);
        AddRef();
        return S_OK;
    }
    *ppv = nullptr;
    return E_NOINTERFACE;
}

STDMETHODIMP_(ULONG) VirtualCameraSource::AddRef() {
    return ++m_refCount;
}

STDMETHODIMP_(ULONG) VirtualCameraSource::Release() {
    ULONG count = --m_refCount;
    if (count == 0) delete this;
    return count;
}

STDMETHODIMP VirtualCameraSource::GetEvent(DWORD dwFlags, IMFMediaEvent** ppEvent) {
    if (m_isShutdown) return MF_E_SHUTDOWN;
    return m_pEventQueue->GetEvent(dwFlags, ppEvent);
}

STDMETHODIMP VirtualCameraSource::BeginGetEvent(IMFAsyncCallback* pCallback, IUnknown* punkState) {
    if (m_isShutdown) return MF_E_SHUTDOWN;
    return m_pEventQueue->BeginGetEvent(pCallback, punkState);
}

STDMETHODIMP VirtualCameraSource::EndGetEvent(IMFAsyncResult* pResult, IMFMediaEvent** ppEvent) {
    if (m_isShutdown) return MF_E_SHUTDOWN;
    return m_pEventQueue->EndGetEvent(pResult, ppEvent);
}

STDMETHODIMP VirtualCameraSource::QueueEvent(MediaEventType met, REFGUID guidExtendedType, HRESULT hrStatus, const PROPVARIANT* pvValue) {
    if (m_isShutdown) return MF_E_SHUTDOWN;
    return m_pEventQueue->QueueEventParamVar(met, guidExtendedType, hrStatus, pvValue);
}

STDMETHODIMP VirtualCameraSource::GetCharacteristics(DWORD* pdwCharacteristics) {
    if (!pdwCharacteristics) return E_POINTER;
    if (m_isShutdown) return MF_E_SHUTDOWN;
    *pdwCharacteristics = MFMEDIASOURCE_IS_LIVE;
    return S_OK;
}

STDMETHODIMP VirtualCameraSource::CreatePresentationDescriptor(IMFPresentationDescriptor** ppPresentationDescriptor) {
    if (!ppPresentationDescriptor) return E_POINTER;
    if (m_isShutdown) return MF_E_SHUTDOWN;
    return m_pPresentationDescriptor->Clone(ppPresentationDescriptor);
}

STDMETHODIMP VirtualCameraSource::Start(IMFPresentationDescriptor* pPresentationDescriptor, const GUID* pguidTimeFormat, const PROPVARIANT* pvarStartPosition) {
    EnterCriticalSection(&m_critSec);
    if (m_isShutdown) {
        LeaveCriticalSection(&m_critSec);
        return MF_E_SHUTDOWN;
    }

    if (m_pStream) {
        m_pStream->Start();
    }

    PROPVARIANT var;
    PropVariantInit(&var);
    var.vt = VT_I8;
    var.hVal.QuadPart = 0;
    QueueEvent(MESourceStarted, GUID_NULL, S_OK, &var);
    PropVariantClear(&var);

    LeaveCriticalSection(&m_critSec);
    return S_OK;
}

STDMETHODIMP VirtualCameraSource::Stop() {
    EnterCriticalSection(&m_critSec);
    if (m_isShutdown) {
        LeaveCriticalSection(&m_critSec);
        return MF_E_SHUTDOWN;
    }

    if (m_pStream) {
        m_pStream->Stop();
    }

    QueueEvent(MESourceStopped, GUID_NULL, S_OK, nullptr);
    LeaveCriticalSection(&m_critSec);
    return S_OK;
}

STDMETHODIMP VirtualCameraSource::Pause() {
    return MF_E_INVALIDREQUEST;
}

STDMETHODIMP VirtualCameraSource::Shutdown() {
    EnterCriticalSection(&m_critSec);
    if (m_isShutdown) {
        LeaveCriticalSection(&m_critSec);
        return S_OK;
    }
    m_isShutdown = true;

    if (m_pStream) {
        m_pStream->Shutdown();
        m_pStream = nullptr;
    }
    if (m_pEventQueue) {
        m_pEventQueue->Shutdown();
        m_pEventQueue = nullptr;
    }
    if (m_pSharedMemory) {
        m_pSharedMemory->Close();
    }

    LeaveCriticalSection(&m_critSec);
    return S_OK;
}

// =========================================================================
// VirtualCameraStream Implementation
// =========================================================================

HRESULT VirtualCameraStream::CreateInstance(VirtualCameraSource* pSource, IMFStreamDescriptor* pSD, VirtualCameraStream** ppStream) {
    if (!ppStream) return E_POINTER;
    *ppStream = new VirtualCameraStream(pSource, pSD);
    return S_OK;
}

VirtualCameraStream::VirtualCameraStream(VirtualCameraSource* pSource, IMFStreamDescriptor* pSD)
    : m_refCount(1)
    , m_pSource(pSource)
    , m_pSD(pSD)
    , m_isActive(false)
    , m_isShutdown(false)
    , m_sampleTime100ns(0)
{
    InitializeCriticalSection(&m_critSec);
    MFCreateEventQueue(&m_pEventQueue);
    m_sampleBuffer.resize(1920 * 1080 * 4, 0);
}

VirtualCameraStream::~VirtualCameraStream() {
    Shutdown();
    DeleteCriticalSection(&m_critSec);
}

STDMETHODIMP VirtualCameraStream::QueryInterface(REFIID riid, void** ppv) {
    if (!ppv) return E_POINTER;
    if (riid == IID_IUnknown || riid == IID_IMFMediaEventGenerator || riid == IID_IMFMediaStream) {
        *ppv = static_cast<IMFMediaStream*>(this);
        AddRef();
        return S_OK;
    }
    *ppv = nullptr;
    return E_NOINTERFACE;
}

STDMETHODIMP_(ULONG) VirtualCameraStream::AddRef() {
    return ++m_refCount;
}

STDMETHODIMP_(ULONG) VirtualCameraStream::Release() {
    ULONG count = --m_refCount;
    if (count == 0) delete this;
    return count;
}

STDMETHODIMP VirtualCameraStream::GetEvent(DWORD dwFlags, IMFMediaEvent** ppEvent) {
    if (m_isShutdown) return MF_E_SHUTDOWN;
    return m_pEventQueue->GetEvent(dwFlags, ppEvent);
}

STDMETHODIMP VirtualCameraStream::BeginGetEvent(IMFAsyncCallback* pCallback, IUnknown* punkState) {
    if (m_isShutdown) return MF_E_SHUTDOWN;
    return m_pEventQueue->BeginGetEvent(pCallback, punkState);
}

STDMETHODIMP VirtualCameraStream::EndGetEvent(IMFAsyncResult* pResult, IMFMediaEvent** ppEvent) {
    if (m_isShutdown) return MF_E_SHUTDOWN;
    return m_pEventQueue->EndGetEvent(pResult, ppEvent);
}

STDMETHODIMP VirtualCameraStream::QueueEvent(MediaEventType met, REFGUID guidExtendedType, HRESULT hrStatus, const PROPVARIANT* pvValue) {
    if (m_isShutdown) return MF_E_SHUTDOWN;
    return m_pEventQueue->QueueEventParamVar(met, guidExtendedType, hrStatus, pvValue);
}

STDMETHODIMP VirtualCameraStream::GetMediaSource(IMFMediaSource** ppMediaSource) {
    if (!ppMediaSource) return E_POINTER;
    if (m_isShutdown) return MF_E_SHUTDOWN;
    *ppMediaSource = m_pSource;
    m_pSource->AddRef();
    return S_OK;
}

STDMETHODIMP VirtualCameraStream::GetStreamDescriptor(IMFStreamDescriptor** ppStreamDescriptor) {
    if (!ppStreamDescriptor) return E_POINTER;
    if (m_isShutdown) return MF_E_SHUTDOWN;
    *ppStreamDescriptor = m_pSD.Get();
    m_pSD->AddRef();
    return S_OK;
}

STDMETHODIMP VirtualCameraStream::RequestSample(IUnknown* pToken) {
    EnterCriticalSection(&m_critSec);
    if (m_isShutdown) {
        LeaveCriticalSection(&m_critSec);
        return MF_E_SHUTDOWN;
    }
    if (!m_isActive) {
        LeaveCriticalSection(&m_critSec);
        return MF_E_INVALIDREQUEST;
    }

    HRESULT hr = DeliverSample();
    LeaveCriticalSection(&m_critSec);
    return hr;
}

HRESULT VirtualCameraStream::DeliverSample() {
    SharedMemoryHeader header = {};
    if (m_pSource->GetSharedMemoryRing()) {
        m_pSource->GetSharedMemoryRing()->ReadLatestFrame(
            m_sampleBuffer.data(),
            static_cast<uint32_t>(m_sampleBuffer.size()),
            &header
        );
    }

    Microsoft::WRL::ComPtr<IMFMediaBuffer> pBuffer;
    HRESULT hr = MFCreateMemoryBuffer(static_cast<DWORD>(m_sampleBuffer.size()), &pBuffer);
    if (FAILED(hr)) return hr;

    BYTE* pDst = nullptr;
    DWORD maxLen = 0, curLen = 0;
    hr = pBuffer->Lock(&pDst, &maxLen, &curLen);
    if (FAILED(hr)) return hr;

    memcpy(pDst, m_sampleBuffer.data(), m_sampleBuffer.size());
    pBuffer->Unlock();
    pBuffer->SetCurrentLength(static_cast<DWORD>(m_sampleBuffer.size()));

    Microsoft::WRL::ComPtr<IMFSample> pSample;
    hr = MFCreateSample(&pSample);
    if (FAILED(hr)) return hr;

    pSample->AddBuffer(pBuffer.Get());

    // Monotonic 30 FPS clock (33.33ms = 333,333 in 100ns units)
    pSample->SetSampleTime(m_sampleTime100ns);
    pSample->SetSampleDuration(333333);
    m_sampleTime100ns += 333333;

    return m_pEventQueue->QueueEventParamUnk(MEMediaSample, GUID_NULL, S_OK, pSample.Get());
}

HRESULT VirtualCameraStream::Start() {
    EnterCriticalSection(&m_critSec);
    m_isActive = true;
    m_sampleTime100ns = 0;
    QueueEvent(MEStreamStarted, GUID_NULL, S_OK, nullptr);
    LeaveCriticalSection(&m_critSec);
    return S_OK;
}

HRESULT VirtualCameraStream::Stop() {
    EnterCriticalSection(&m_critSec);
    m_isActive = false;
    QueueEvent(MEStreamStopped, GUID_NULL, S_OK, nullptr);
    LeaveCriticalSection(&m_critSec);
    return S_OK;
}

HRESULT VirtualCameraStream::Shutdown() {
    EnterCriticalSection(&m_critSec);
    if (m_isShutdown) {
        LeaveCriticalSection(&m_critSec);
        return S_OK;
    }
    m_isShutdown = true;
    m_isActive = false;

    if (m_pEventQueue) {
        m_pEventQueue->Shutdown();
        m_pEventQueue = nullptr;
    }
    LeaveCriticalSection(&m_critSec);
    return S_OK;
}

} // namespace NextHyke
