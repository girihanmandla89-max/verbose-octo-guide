# NextHyke: Master Feature-Wise Implementation Plan & Project Context

**Project Name:** NextHyke  
**Target Platform:** Windows 11 Home Single Language (Build 26200 / HAL 26100.1)  
**Reference Machine:** HP Pavilion Laptop 15-eg0xxx (SKU: 2N1K6PA#ACJ)  
**Hardware Profile:**  
- **CPU:** 11th Gen Intel Core i5-1135G7 @ 2.40 GHz (4 Cores / 8 Threads, AVX-512, VNNI)  
- **Primary AI GPU:** NVIDIA GeForce MX450 (Turing TU117, Compute Capability 7.5, 2.0 GB GDDR5/GDDR6, Driver 32.0.15.9282)  
- **Secondary iGPU:** Intel Iris Xe Graphics (Dynamic shared system memory up to 7.9 GB)  
- **System RAM:** 16.0 GB DDR4-3200  
**Classification:** Self-contained Windows 11 Native AI Desktop Video Processing & Virtual Camera Solution  
**Document Role:** Master operational context and feature-by-feature implementation blueprint.

---

## 1. Core Operating Directives & Anti-Hallucination Protocol

Derived from `rules.docx` and engineering governance standards:

1. **Product Naming Integrity:** The sole, unalterable product name is **NextHyke**. Never introduce legacy project names in code, variables, UI strings, commits, or documentation.
2. **Deterministic Accuracy Over Speculation:**
   - Never invent, assume, or extrapolate facts, library versions, file paths, hardware specifications, or API endpoints.
   - If an API, parameter, or dependency requirement is ambiguous or not provided, explicitly declare `[MISSING INFORMATION: <detail>]` and request clarification rather than guessing.
3. **Strict Hardware & Compute Reality:**
   - **CPU:** Maximum 3 worker threads on the i5-1135G7 (Core 0 and OS compositor preserved).
   - **Dedicated VRAM:** Hard cap at $\le 1.4\text{ GB}$ on the 2.0 GB NVIDIA MX450.
   - **System RAM:** Maximum working set envelope $< 1.2\text{ GB}$; idle UI $< 110\text{ MB}$; max memory growth $\le 1.0\text{ MB/hr}$.
   - **Frame Rate:** Realistic hardware-sustainable throughput ($10 - 18\text{ FPS}$ inference, decoupled $30.00\text{ FPS}$ publishing clock). No inflated or theoretical FPS claims.
4. **Anti-Hallucination & Negative Constraints:**
   - **NO Phantom Imports/Libraries:** Use only confirmed standard library modules or explicitly specified dependencies (`onnxruntime-gpu`, `opencv-python-headless`, `numpy`, `protobuf`).
   - **NO Fake Success Fallbacks:** Do not hide failures behind empty `try/catch` blocks or mock return values that simulate success when a subsystem actually failed.
   - **NO Undocumented Secrets/APIs:** Never embed placeholder mock secrets, bypass authentication tokens, or simulate external services without declaring them as stubs.
   - **NO Unrequested Rewrites:** Do not refactor or alter working existing code, UI styling, or project layout unless directly requested.
5. **Screen Capture Transparency:** NextHyke must *not* set `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)`. NextHyke remains visible in screen shares and system monitoring tools.
6. **Zero External Prerequisites:** End-user installer must be self-contained; no separate Python, Git, OBS Studio, or manual FFmpeg installations required.

---

## 2. Multi-Tier Architecture & Decoupled Stream Clock

```
+-------------------------------------------------------------------------------+
|                               NEXTHYKE DESKTOP                                |
+-------------------------------------------------------------------------------+
|  UI Layer (Electron 30+ / TypeScript Renderer)                                |
|    - 4-Step Guided Wizard (Reference -> Source -> Pre-flight -> Controls)     |
|    - Isolated Context (contextIsolation: true, nodeIntegration: false)        |
+---------------------------------------+---------------------------------------+
                                        | Typed IPC (Invoke / Handle)
                                        v
+-------------------------------------------------------------------------------+
|  Main Controller (Electron Node.js Core)                                      |
|    - Window Lifecycle & Tray (Ctrl+\ Hotkey Manager)                          |
|    - Licensing Client (Ed25519 Token Validator + DPAPI Machine Salt)          |
+---------------------------------------+---------------------------------------+
                                        | Win32 Named Pipes
                                        v
+-------------------------------------------------------------------------------+
|  Native C++ Helper (NextHykeCore.dll)                                         |
|    - Win32 Shared Memory Arena (Triple-Buffered Ring: 24.8 MB for 1080p RGBA)  |
|    - Worker Process Supervisor (Crash Recovery & Handle Guard)               |
+-------------------+---------------------------------------+-------------------+
                    | Direct Frame Buffers (<2ms)           | Direct Memory Stream
                    v                                       v
+---------------------------------------+   +-----------------------------------+
| Python 3.10/3.11 Inference Engine     |   | Windows 11 Media Foundation Cam   |
|   - ONNX Runtime (CUDA / TensorRT)    |   |   - IMFVirtualCamera Source       |
|   - Model Chain:                      |   |   - Decoupled 30.00 FPS Clock     |
|     YOLOv8-Face -> 2DFAN-106 ->       |   |   - Device Friendly Name:         |
|     Embedding -> INSwapper -> Comp    |   |     "NextHyke Processed Camera"   |
+---------------------------------------+   +-----------------+-----------------+
                                                              |
                                                              v
                                            +-----------------------------------+
                                            | Downstream Apps (Teams/Zoom/Meet) |
                                            +-----------------------------------+
```

---

## 3. Feature-by-Feature SDLC Development Cycle

Every individual feature is developed and verified in its own discrete cycle:
$$\text{Develop} \longrightarrow \text{Test} \longrightarrow \text{Verify} \longrightarrow \text{Deploy} \longrightarrow \text{Re-Test (Post-Deployment)} \longrightarrow \text{Advance Gate}$$

---

### PHASE 0: Baseline & Repository Governance

#### Feature 0.1: Git Repository & Branch Protection Rules
- **Where:** Root directory (`.git/`, `.gitignore`) on branch `feature/p0-baseline`.
- **What:** Clean Git repository initialized with strict branch protection rules (no direct commits to `main`).
- **How (Develop):**
  - Add Visual Studio Git to session path:
    `$env:PATH += ";C:\Program Files (x86)\Microsoft Visual Studio\2019\Community\Common7\IDE\CommonExtensions\Microsoft\TeamFoundation\Team Explorer\Git\cmd"`
  - Initialize Git, create `.gitignore` ignoring `runtime/`, `models/*.onnx`, `node_modules/`, `dist/`, and local caches.
- **Test:** Run `git status` and verify ignored files do not show up as untracked.
- **Verify:** Confirm Git recognizes branch `feature/p0-baseline` and working tree is clean.
- **Deploy:** Commit baseline files with descriptive message and prepare PR #1 against `main`.
- **Re-Test:** Run `git branch --show-current` to ensure head is isolated from `main`.
- **Exit Gate:** Clean Git structure verified; zero temporary files committed.

---

#### Feature 0.2: Machine Hardware Profile Schema
- **Where:** `hardware_spec.json` on branch `feature/p0-baseline`.
- **What:** Authoritative JSON schema encoding the verified physical hardware boundaries of the HP Pavilion 15-eg0xxx (Intel i5-1135G7, NVIDIA MX450 2GB, 16GB RAM, Windows 11 Build 26200).
- **How (Develop):**
  - Author `hardware_spec.json` defining CPU logical cores, max worker threads ($\le 3$), dedicated VRAM budget ($\le 1400\text{ MB}$), working set RAM limit ($< 1200\text{ MB}$), and fallback iGPU parameters.
- **Test:** Run PowerShell script to parse and validate JSON structure:
  `Get-Content hardware_spec.json | ConvertFrom-Json`
- **Verify:** Ensure all keys (`max_worker_threads: 3`, `max_vram_budget_mb: 1400`) accurately match physical machine constraints.
- **Deploy:** Commit `hardware_spec.json` to `feature/p0-baseline`.
- **Re-Test:** Validate that schema loads cleanly with zero parsing errors.
- **Exit Gate:** Hardware spec file signed off as the immutable boundary for subsequent phases.

---

#### Feature 0.3: PR Quality Template & Verification CI
- **Where:** `.github/PULL_REQUEST_TEMPLATE.md` and `.github/workflows/verify-pr.yml`.
- **What:** Standardized checklist enforcing mandatory hardware benchmark logs, VRAM records, thread counts, and test results for every future pull request.
- **How (Develop):**
  - Create markdown template requiring explicit check-boxes for: Dedicated VRAM $\le 1.4\text{ GB}$, CPU threads $\le 3$, working set RAM $< 1.2\text{ GB}$, no phantom dependencies, and 1-sentence verification test.
- **Test:** Render markdown template and verify required headers and check-boxes exist.
- **Verify:** Ensure no template section allows subjective passes without numerical evidence.
- **Deploy:** Commit `.github/` files to `feature/p0-baseline`.
- **Re-Test:** Test-open PR #1 against `main` using the new template.
- **Exit Gate:** PR #1 merged into `main`. Baseline repository governance established.

---

### PHASE 1: Runtime & Silicon Qualification

#### Feature 1.1: Standalone Embedded CPython 3.10/3.11 Bootstrapper
- **Where:** `tools/bootstrap_runtime.ps1` targeting directory `runtime/` on branch `feature/p1-runtime`.
- **What:** Fully automated PowerShell script downloading official Windows 64-bit embedded CPython 3.10.13, enabling `site-packages`, and bootstrapping standalone `pip`.
- **How (Develop):**
  - Script fetches `python-3.10.13-embed-amd64.zip`, extracts into `runtime/`, modifies `python310._pth` to uncomment `import site`, and runs `get-pip.py`.
- **Test:** Execute: `.\tools\bootstrap_runtime.ps1 -PythonVersion "3.10.13"`
- **Verify:** Run `.\runtime\python.exe --version` and verify it outputs `Python 3.10.13` without referencing host Python.
- **Deploy:** Commit `tools/bootstrap_runtime.ps1` to `feature/p1-runtime`.
- **Re-Test:** Delete test scratch and re-run bootstrap to ensure 100% idempotent installation.
- **Exit Gate:** Isolated Python runtime verified with working `pip.exe` in `runtime\Scripts\`.

---

#### Feature 1.2: Pinned Runtime Dependency Manifest
- **Where:** `requirements-runtime.txt` on branch `feature/p1-runtime`.
- **What:** Pinned dependency manifest locking verified binary wheel versions (`onnxruntime-gpu==1.17.1`, `opencv-python-headless==4.9.0.80`, `numpy==1.26.4`, `protobuf==4.25.3`).
- **How (Develop):**
  - Install dependencies via isolated pip:
    `.\runtime\Scripts\pip.exe install -r requirements-runtime.txt --no-warn-script-location`
- **Test:** Run:
  `.\runtime\python.exe -c "import cv2, numpy, onnxruntime; print(onnxruntime.__version__, onnxruntime.get_available_providers())"`
- **Verify:** Confirm `CUDAExecutionProvider` appears in available providers list.
- **Deploy:** Commit `requirements-runtime.txt` to `feature/p1-runtime`.
- **Re-Test:** Confirm zero phantom or floating unpinned dependencies exist in the manifest.
- **Exit Gate:** Dependencies import cleanly with zero compilation errors or wheel mismatches.

---

#### Feature 1.3: Silicon Micro-Benchmark Tool
- **Where:** `tools/profile_silicon.py` on branch `feature/p1-runtime`.
- **What:** Micro-benchmark evaluating tensor operations across `CUDAExecutionProvider` (NVIDIA MX450), `OpenVINOExecutionProvider` (Intel Iris Xe), and `CPUExecutionProvider` (i5 capped at $\le 3$ threads).
- **How (Develop):**
  - Script initializes synthetic tensor graph, sets `SessionOptions.intra_op_num_threads = 3`, runs 300 iterations per provider, and logs latency (ms), FPS, and GPU VRAM via NVML.
- **Test:** Execute: `.\runtime\python.exe tools\profile_silicon.py`
- **Verify:** Confirm dedicated GPU memory does not exceed $1.4\text{ GB} / 2.0\text{ GB}$ on the MX450.
- **Deploy:** Commit `tools/profile_silicon.py` and benchmark log to `feature/p1-runtime`.
- **Re-Test:** Confirm CPU utilization remains under 75% on the i5-1135G7 during the benchmark run.
- **Exit Gate:** PR #2 merged into `main`. Hardware qualification signed off.

---

### PHASE 2: Native IPC Core & Memory Bridge

#### Feature 2.1: Win32 Named Pipe Duplex Control Server
- **Where:** `src/native/named_pipe_server.cpp` and `src/native/include/named_pipe_server.h` on branch `feature/p2-native-ipc`.
- **What:** High-performance Win32 Named Pipe server (`\\.\pipe\NextHyke_Control_<PID>`) handling synchronous state transitions (`INIT`, `LOAD_MODELS`, `START_STREAM`, `STOP_STREAM`, `TELEMETRY`, `SHUTDOWN`).
- **How (Develop):**
  - Implement non-blocking overlapped I/O pipe server in C++ using Win32 API (`CreateNamedPipeW`, `ConnectNamedPipe`).
- **Test:** Run standalone test client connecting to pipe and exchanging 500 state pings.
- **Verify:** Command round-trip latency $< 0.5\text{ ms}$; zero socket/handle exhaustion.
- **Deploy:** Compile into `NextHykeCore.dll`.
- **Re-Test:** Test abnormal client disconnect; verify pipe resets cleanly without deadlocking.
- **Exit Gate:** Pipe server passes bidirectional stress test.

---

#### Feature 2.2: 24.8 MB Triple-Buffered Shared Memory Ring Arena
- **Where:** `src/native/shared_memory_ring.cpp` and `src/native/include/shared_memory_ring.h` on branch `feature/p2-native-ipc`.
- **What:** Zero-copy shared memory arena allocating 3 static frame buffers ($1920 \times 1080 \times 4\text{ bytes} \approx 24.8\text{ MB}$ total) using Win32 `CreateFileMappingW` / `MapViewOfFile`.
- **How (Develop):**
  - Implement ring header with atomic read/write buffer indices and synchronization events (`NextHyke_FrameReady_<Idx>`, `NextHyke_FrameConsumed_<Idx>`).
- **Test:** Transfer 1,000 synthetic 1080p RGBA frames between writer and reader processes.
- **Verify:** End-to-end memory transfer latency $< 2.0\text{ ms}$; zero frame drops at 60 Hz.
- **Deploy:** Link shared memory subsystem into `NextHykeCore.dll`.
- **Re-Test:** Verify clean cleanup of shared memory handles upon SIGTERM/SIGINT.
- **Exit Gate:** Memory transfers confirmed zero-copy; total arena memory footprint locked at $24.8\text{ MB}$.

---

#### Feature 2.3: Python Worker Process Supervisor & Lifecycle Manager
- **Where:** `src/main/process-supervisor.ts` on branch `feature/p2-native-ipc`.
- **What:** Electron main-process manager that launches, health-checks, and gracefully terminates the embedded Python inference worker.
- **How (Develop):**
  - Spawns `runtime\python.exe -m src.engine.worker --pipe-pid=<PID>`, monitors heartbeats, and cleans up native handles on shutdown.
- **Test:** Simulate worker crash (kill Python process via Task Manager); verify supervisor detects crash within $100\text{ ms}$ and releases OS resources.
- **Verify:** Host application remains stable without hanging or ghost background processes.
- **Deploy:** Integrate supervisor into Electron main process lifecycle.
- **Re-Test:** Trigger 10 consecutive clean start/stop cycles; verify zero orphan processes left behind.
- **Exit Gate:** Supervisor cleanly manages worker lifecycle under normal and crash conditions.

---

#### Feature 2.4: Electron 30+ Scaffolding with Context Isolation
- **Where:** `package.json`, `tsconfig.json`, `src/main/index.ts`, `src/preload/index.ts` on branch `feature/p2-native-ipc`.
- **What:** Secure Electron 30+ desktop application shell configured with `contextIsolation: true`, `nodeIntegration: false`, and strict Content Security Policy.
- **How (Develop):**
  - Scaffold TypeScript configuration, Electron main process, and typed context bridge exposing only authorized IPC channels.
- **Test:** Launch Electron app: `npm run dev`
- **Verify:** Confirm `window.process` and `require` are `undefined` inside the renderer DevTools console.
- **Deploy:** Commit Electron core scaffolding to `feature/p2-native-ipc`.
- **Re-Test:** Measure idle host UI memory; confirm working set stays $< 110\text{ MB}$.
- **Exit Gate:** PR #3 merged into `main`. Native bridge and desktop foundation operational.

---

### PHASE 3: Usability-Driven 4-Step Guided Wizard

#### Feature 3.1: Step 1 — Reference Photo Picker & Rights Confirmation
- **Where:** `src/renderer/src/steps/step1-reference.ts` and `src/renderer/styles/wizard.css` on branch `feature/p3-guided-ui`.
- **What:** Drag-and-drop reference image selector with real-time format validation, size limit check ($\le 15\text{ MB}$), and mandatory rights confirmation checkbox.
- **How (Develop):**
  - Implement drag-and-drop zone with instant MIME validation (`image/png`, `image/jpeg`).
  - Add actionable error message: *"File exceeds 15 MB limit. Please upload a smaller image."*
  - Add mandatory checkbox: *"I confirm I have the legal right or consent to use this reference image."*
  - Disable "Next" button until photo is valid and checkbox is checked.
- **Test:** UI tests attempting upload of: `.txt` file, 20 MB image, valid 2 MB image without checkbox, and valid image with checkbox.
- **Verify:** Next button unlocks *only* when both conditions are satisfied.
- **Deploy:** Wire Step 1 into wizard state machine.
- **Re-Test:** Verify image thumbnail preview renders smoothly with zero UI freeze.
- **Exit Gate:** Step 1 validation logic fully verified with plain-language feedback.

---

#### Feature 3.2: Step 2 — Video Source & Physical Webcam Enumerator
- **Where:** `src/renderer/src/steps/step2-source.ts` on branch `feature/p3-guided-ui`.
- **What:** Auto-enumerates all active Windows Media Foundation video input devices and supports choosing local MP4/MKV video files.
- **How (Develop):**
  - Call `navigator.mediaDevices.enumerateDevices()`, filter `videoinput`, and populate custom dropdown with device labels.
  - Provide fallback file picker for offline video testing.
- **Test:** Connect and disconnect a webcam; verify list updates dynamically.
- **Verify:** Selected device ID is stored in wizard state machine.
- **Deploy:** Commit Step 2 component to `feature/p3-guided-ui`.
- **Re-Test:** Select a 1080p video file and verify file metadata (resolution, frame rate) displays instantly.
- **Exit Gate:** Step 2 reliably discovers cameras and video inputs.

---

#### Feature 3.3: Step 3 — Hardware Pre-Flight Readiness Validator
- **Where:** `src/renderer/src/steps/step3-preflight.ts` on branch `feature/p3-guided-ui`.
- **What:** Live diagnostic pre-flight screen verifying system readiness before processing begins.
- **How (Develop):**
  - Queries system via typed IPC: Available System RAM ($\ge 2.5\text{ GB}$), NVIDIA MX450 VRAM readiness, and camera accessibility (not locked by Zoom/Teams).
  - Displays Green/Yellow/Red status badges with plain-language recovery actions.
- **Test:** Simulate low RAM condition ($< 2.5\text{ GB}$); verify warning banner appears.
- **Verify:** Start button remains disabled if any critical check fails.
- **Deploy:** Wire pre-flight validator into Step 3 view.
- **Re-Test:** Verify pre-flight check executes in $< 150\text{ ms}$ without UI lag.
- **Exit Gate:** Pre-flight gate prevents runtime crashes by validating compute environment upfront.

---

#### Feature 3.4: Step 4 — Controls, Live Comparison Canvas & Advanced Drawer
- **Where:** `src/renderer/src/steps/step4-controls.ts` on branch `feature/p3-guided-ui`.
- **What:** Operational dashboard featuring Start/Stop controls, live side-by-side comparison canvas, and collapsible Advanced Settings drawer.
- **How (Develop):**
  - Canvas renders ingress camera stream alongside processed egress stream.
  - Collapsible drawer hides rarely changed settings (detection confidence, landmark margins, color adjustment profile) to minimize decision fatigue.
- **Test:** Toggle Start/Stop camera button 20 times; toggle Advanced Drawer.
- **Verify:** Canvas renders at native 60 Hz display refresh without dropping renderer frames.
- **Deploy:** Commit Step 4 component to `feature/p3-guided-ui`.
- **Re-Test:** Confirm collapsible drawer state persists between application restarts.
- **Exit Gate:** Step 4 provides smooth real-time monitoring and clean controls.

---

#### Feature 3.5: Global Command Palette (`Ctrl+K`) & Accessible Theme System
- **Where:** `src/renderer/src/components/command-palette.ts` and `src/renderer/styles/main.css` on branch `feature/p3-guided-ui`.
- **What:** Keyboard-accessible command palette (`Ctrl+K`) for quick navigation, plus Dark/Light/High-Contrast theme toggle.
- **How (Develop):**
  - Central modal offering search across settings, presets, and diagnostic exports.
  - Implement full keyboard accessibility (`Tab`, `Enter`, `Escape`) with visible focus outlines.
- **Test:** Open app, press `Ctrl+K`, search "camera", navigate using arrow keys, press Enter.
- **Verify:** Action executes without requiring mouse clicks.
- **Deploy:** Wire command palette globally in renderer.
- **Re-Test:** Toggle Dark/Light/High-Contrast themes and verify color contrast ratios meet WCAG AA standards.
- **Exit Gate:** PR #4 merged into `main`. Complete 4-step wizard and UX layer verified.

---

### PHASE 4: AI Model Pipeline & VRAM Budgeting

#### Feature 4.1: YOLOv8-Face Detection Runner
- **Where:** `src/engine/models/face_detector.py` on branch `feature/p4-pipeline`.
- **What:** High-speed facial bounding box detector operating on downsampled input frames.
- **How (Develop):**
  - Load `yolov8n-face.onnx` into `InferenceSession` with `CUDAExecutionProvider`.
  - Implement letterbox preprocessing, non-maximum suppression (NMS), and bounding box extraction.
- **Test:** Run detector on 100 benchmark faces of varying scale and lighting.
- **Verify:** Inference latency $< 15\text{ ms}$ on NVIDIA MX450; VRAM usage $< 220\text{ MB}$.
- **Deploy:** Connect face detector output to landmark input queue.
- **Re-Test:** Test frame with zero faces; verify graceful empty return without exceptions.
- **Exit Gate:** Face detector achieves $\ge 98\%$ recall on test dataset within latency budget.

---

#### Feature 4.2: 2DFAN-106 Landmark Alignment & Tracking
- **Where:** `src/engine/models/landmark_aligner.py` on branch `feature/p4-pipeline`.
- **What:** 106-point facial landmark extractor for precise geometric pose and feature alignment.
- **How (Develop):**
  - Crop face region, normalize, and infer 106 keypoints via `2dfan106.onnx`.
  - Implement temporal exponential smoothing filter across consecutive frames to prevent jitter.
- **Test:** Track landmarks across a 60-second talking-head video.
- **Verify:** Average landmark inference time $< 12\text{ ms}$; no visible landmark popping.
- **Deploy:** Integrate landmark aligner into pipeline sequence.
- **Re-Test:** Test rapid head rotations ($\pm 45^\circ$); verify smooth landmark tracking.
- **Exit Gate:** Landmark alignment operational with stable temporal smoothing.

---

#### Feature 4.3: Identity Embedding Matcher
- **Where:** `src/engine/models/face_embedder.py` on branch `feature/p4-pipeline`.
- **What:** Generates 512-dimensional facial identity feature vectors for target reference alignment.
- **How (Develop):**
  - Run normalized crop through ArcFace ONNX model; calculate cosine similarity between live face and reference target.
- **Test:** Compare identical person images vs. different person images.
- **Verify:** Cosine distance metric separates same-identity vs. different-identity with threshold $\ge 0.65$.
- **Deploy:** Connect embedding extractor to swapper conditioning input.
- **Re-Test:** Compute embedding once on reference photo selection and cache in memory to avoid per-frame recomputation.
- **Exit Gate:** Reference embedding cached with zero per-frame compute overhead.

---

#### Feature 4.4: INSwapper_128 Core ONNX Runner
- **Where:** `src/engine/models/inswapper.py` on branch `feature/p4-pipeline`.
- **What:** Core face swap model generating transformed facial synthesis conditioned on the target embedding.
- **How (Develop):**
  - Execute `inswapper_128.onnx` using FP16 / INT8 quantization on Turing TU117 (MX450).
- **Test:** Run 500 swap iterations on test frames.
- **Verify:** Swapper execution latency $\le 55\text{ ms}$ on MX450; dedicated VRAM allocation strictly $\le 950\text{ MB}$.
- **Deploy:** Wire output into compositing module.
- **Re-Test:** Inspect visual output; verify zero NaN values or pixel artifacts in generated buffer.
- **Exit Gate:** INSwapper delivers consistent facial transformation within VRAM limits.

---

#### Feature 4.5: Camera-Sized Dynamic Frame Arenas & Compositing
- **Where:** `src/engine/memory/frame_arena.py` and `src/engine/models/compositor.py` on branch `feature/p4-pipeline`.
- **What:** Dynamically pools image buffers sized strictly to active camera dimensions, completely replacing the legacy 2048 MB weak heap allocation.
- **How (Develop):**
  - Allocate reusable NumPy buffers for active resolution ($1280 \times 720$ or $1920 \times 1080$).
  - Implement Poisson seamless cloning / Laplacian pyramid blending to blend swapped face back into original frame.
- **Test:** Run continuous 1-hour live processing run monitored via PerfMon.
- **Verify:** Memory growth stays $\le 1.0\text{ MB/hr}$; overall process working set stays $< 1.2\text{ GB}$; SSIM $\ge 0.985$.
- **Deploy:** Integrate frame arena into master pipeline controller (`src/engine/pipeline.py`).
- **Re-Test:** Switch webcam resolution mid-session; verify arena re-allocates cleanly without memory leak.
- **Exit Gate:** Frame arenas eliminate dynamic heap allocation during live streaming.

---

#### Feature 4.6: Dynamic VRAM Throttle & Intel Iris Xe Fallback
- **Where:** `src/engine/fallback_handler.py` on branch `feature/p4-pipeline`.
- **What:** Safety governor that continuously monitors MX450 dedicated VRAM and shifts post-processing to the Intel Iris Xe iGPU if VRAM exceeds 92%.
- **How (Develop):**
  - Query VRAM usage via DXGI / NVML every 60 frames.
  - If dedicated VRAM $> 1880\text{ MB}$ ($92\%$), dynamically route color adjustments and blending via `OpenVINOExecutionProvider` on the Iris Xe graphics unit.
- **Test:** Simulate artificial VRAM pressure on MX450; verify fallback handler activates within 2 frames.
- **Verify:** Zero CUDA Out-Of-Memory exceptions or application crashes.
- **Deploy:** Commit fallback handler to `feature/p4-pipeline`.
- **Re-Test:** Release VRAM pressure; verify system restores primary MX450 processing automatically.
- **Exit Gate:** PR #5 merged into `main`. Pipeline stability and memory bounds fully certified.

---

### PHASE 5: Windows 11 Native Virtual Camera Direct Output

#### Feature 5.1: C++/WinRT Media Foundation Camera Source
- **Where:** `src/native/virtual_camera/virtual_camera_source.cpp` on branch `feature/p5-virtual-cam`.
- **What:** Software video media source implementing Windows Media Foundation interfaces (`IMFMediaSource`, `IMFMediaStream`).
- **How (Develop):**
  - Implement standard Media Foundation sample allocator reading processed frames directly from the shared memory ring arena.
- **Test:** Run Media Foundation sample reader harness consuming frames from source.
- **Verify:** Media Foundation pipeline accepts RGBA/NV12 format negotiation without conversion failure.
- **Deploy:** Compile into `NextHykeVirtualCam.dll`.
- **Re-Test:** Verify clean cleanup of Media Foundation sample pools on stream stop.
- **Exit Gate:** Media Foundation source successfully outputs frames.

---

#### Feature 5.2: Per-Session Virtual Camera Registration
- **Where:** `src/native/virtual_camera/virtual_camera_registrar.cpp` on branch `feature/p5-virtual-cam`.
- **What:** Registers the virtual camera in Windows 11 with friendly name `"NextHyke Processed Camera"` without requiring administrator privileges.
- **How (Develop):**
  - Invoke `MFCreateVirtualCamera` with `MFVirtualCameraLifetime_Session` and `MFVirtualCameraAccess_CurrentUser`.
- **Test:** Call registration API on standard (non-admin) Windows 11 user account.
- **Verify:** Registration succeeds without UAC prompt; camera appears in Windows Settings $\to$ Bluetooth & devices $\to$ Cameras.
- **Deploy:** Wire registration into Electron app startup and unregistration into app exit.
- **Re-Test:** Terminate app abruptly; verify virtual camera cleanly disappears from system device list.
- **Exit Gate:** Virtual camera registers and unregisters cleanly on per-session basis.

---

#### Feature 5.3: Decoupled Dual-Clock Streaming Engine
- **Where:** `src/native/virtual_camera/decoupled_stream_clock.cpp` on branch `feature/p5-virtual-cam`.
- **What:** Decouples inference processing rate ($10 - 18\text{ FPS}$) from the virtual camera output clock (locked to $30.00\text{ FPS}$).
- **How (Develop):**
  - Inference loop writes latest processed frame to shared memory.
  - Media Foundation publishing loop ticks at exactly $33.33\text{ ms}$ intervals ($30.00\text{ FPS}$). If inference is computing, it repeats the latest frame with an updated presentation timestamp.
- **Test:** Open Microsoft Teams / Zoom $\to$ Camera Settings $\to$ Select `"NextHyke Processed Camera"`.
- **Verify:** Video appears in $< 200\text{ ms}$; stream delivers rock-solid 30.00 FPS with zero stutter or disconnection in Teams/Zoom.
- **Deploy:** Commit dual-clock subsystem to `feature/p5-virtual-cam`.
- **Re-Test:** Test 30-minute continuous video call in Teams; verify zero dropped connection alerts.
- **Exit Gate:** PR #6 merged into `main`. Native virtual camera direct output verified.

---

### PHASE 6: System Tray & Keyboard Ergonomics

#### Feature 6.1: Global Hotkey Window Toggle (`Ctrl+\`)
- **Where:** `src/main/hotkey-manager.ts` on branch `feature/p6-tray-hotkey`.
- **What:** Registers global keyboard shortcut `Ctrl+\` to instantly toggle window visibility (`show()` / `hide()`).
- **How (Develop):**
  - Use Electron `globalShortcut.register('CommandOrControl+\\', ...)` to toggle window state and focus.
- **Test:** Press `Ctrl+\` 50 times in rapid succession while video is actively streaming.
- **Verify:** Window toggles visibility in $< 50\text{ ms}$ with zero redraw stutter or video interruptions.
- **Deploy:** Commit hotkey manager to `feature/p6-tray-hotkey`.
- **Re-Test:** Verify hotkey does not intercept `Ctrl+\` when configured hotkey is unmapped.
- **Exit Gate:** Global hotkey responsiveness verified under active GPU load.

---

#### Feature 6.2: Dynamic System Tray Controller with Active Green Pip
- **Where:** `src/main/tray-controller.ts` and `assets/icons/` on branch `feature/p6-tray-hotkey`.
- **What:** System tray presence with contextual menu (Restore, Model Info, Stop Camera, Quit) and dynamic icon (grey for idle, active green pip during streaming).
- **How (Develop):**
  - Manage tray icon lifecycle via Electron `Tray` API; swap icon assets based on stream state events.
- **Test:** Start camera $\to$ verify tray switches to green pip; stop camera $\to$ verify icon returns to grey.
- **Verify:** Right-clicking tray opens menu immediately without delaying frame rendering.
- **Deploy:** Integrate tray controller with main controller.
- **Re-Test:** Close main window $\to$ verify app remains alive in tray; click tray icon $\to$ verify window restores.
- **Exit Gate:** Tray controller and visual state indicators operating reliably.

---

#### Feature 6.3: Strict Screen Capture Transparency Compliance
- **Where:** `src/main/index.ts` on branch `feature/p6-tray-hotkey`.
- **What:** Explicit verification ensuring NextHyke window is fully visible in screen shares and system recording tools (no capture evasion).
- **How (Develop):**
  - Audit codebase to ensure `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` is never called.
- **Test:** Share screen via Teams or OBS window capture while NextHyke is open.
- **Verify:** NextHyke window is clearly visible on the screen share feed.
- **Deploy:** Add automated unit assertion verifying display affinity equals `WDA_NONE`.
- **Re-Test:** Confirm window remains capturable across all window states (restored, minimized, moved).
- **Exit Gate:** PR #7 merged into `main`. Capture transparency and ergonomics verified.

---

### PHASE 7: Licensing & Anti-Tamper Security

#### Feature 7.1: DPAPI Salted Hardware Machine Fingerprinter
- **Where:** `src/main/licensing/hardware-fingerprint.ts` on branch `feature/p7-licensing`.
- **What:** Generates unique machine identity salted with motherboard UUID and CPU ID, protected via Windows DPAPI (`CryptProtectData`).
- **How (Develop):**
  - Query WMI for BIOS/Motherboard UUID and CPU ID; compute SHA-256 hash and encrypt with DPAPI machine scope.
- **Test:** Generate fingerprint across multiple reboots.
- **Verify:** Fingerprint hash remains deterministic across reboots; cannot be decrypted on a different machine.
- **Deploy:** Commit hardware fingerprinter to `feature/p7-licensing`.
- **Re-Test:** Verify fingerprinting executes in $< 100\text{ ms}$ on application launch.
- **Exit Gate:** Deterministic, DPAPI-protected machine identity established.

---

#### Feature 7.2: Ed25519 JWT Cryptographic Token Validator
- **Where:** `src/main/licensing/token-validator.ts` on branch `feature/p7-licensing`.
- **What:** Client validates server-issued licensing tokens `{ licenseId, machineHash, expiresAt }` using an embedded Ed25519 public key (zero secrets in client).
- **How (Develop):**
  - Verify signature using standard Ed25519 cryptography. Reject expired tokens or tokens with mismatched machine hashes.
- **Test:** Attempt validation of: valid token, tampered token payload, expired token, and token signed by wrong key.
- **Verify:** All invalid/tampered tokens are rejected with plain-language error message; valid token unlocks application.
- **Deploy:** Commit token validator to `feature/p7-licensing`.
- **Re-Test:** Search client codebase for private keys or Google Service Account secrets; confirm zero credentials exist.
- **Exit Gate:** Cryptographic validation verified with zero private keys or secrets stored on client.

---

#### Feature 7.3: Monotonic 72-Hour Offline Grace Period Enforcer
- **Where:** `src/main/licensing/offline-grace-manager.ts` on branch `feature/p7-licensing`.
- **What:** Permits 72 hours of continuous offline operation validated against a signed, monotonic local timestamp file.
- **How (Develop):**
  - Periodically update signed local state file with monotonic timestamp. If network is offline, allow streaming if duration $< 72\text{ hours}$.
  - Detect clock rollback: if system clock is behind the monotonic timestamp, flag tampering and request online check.
- **Test:** Disconnect network $\to$ verify 72h countdown functions; set system clock back 30 days $\to$ verify tamper detection triggers.
- **Verify:** Offline grace operates for 72 hours under legitimate disconnects and blocks clock manipulation.
- **Deploy:** Wire offline grace manager into startup sequence.
- **Re-Test:** Reconnect network; verify online heartbeat refreshes grace period immediately.
- **Exit Gate:** PR #8 merged into `main`. Secure licensing and offline grace fully operational.

---

### PHASE 8: Hardening, Packaging & Staged GA Release

#### Feature 8.1: Privacy-Preserving First-Run Telemetry Consent
- **Where:** `src/main/telemetry.ts` and `src/renderer/src/components/telemetry-modal.ts` on branch `feature/p8-packaging-ga`.
- **What:** First-run modal explicitly asking for user opt-in consent before collecting anonymous session duration and hardware compute provider.
- **How (Develop):**
  - First launch presents clear dialog: *"Help improve NextHyke by sharing anonymous performance telemetry (session duration, GPU model). We never collect video, frames, audio, or biometric data."*
  - If declined, telemetry subsystem is completely disabled.
- **Test:** Launch app as new user; test selecting "Decline" and verify zero network telemetry packets are sent.
- **Verify:** Code inspection confirms zero capture of frame data, webcam buffers, audio, or facial landmark arrays.
- **Deploy:** Commit telemetry consent modal to `feature/p8-packaging-ga`.
- **Re-Test:** Test selecting "Accept" and verify outgoing payload contains only `{ session_duration, gpu_provider, error_code }`.
- **Exit Gate:** Telemetry strictly opt-in and privacy-compliant.

---

#### Feature 8.2: Standalone Zero-Dependency NSIS Installer
- **Where:** `electron-builder.yml` and `build/installer.nsh` on branch `feature/p8-packaging-ga`.
- **What:** Self-contained Windows 11 NSIS installer bundling embedded CPython runtime, compiled DLLs, ONNX model weights, and Electron executable.
- **How (Develop):**
  - Configure `electron-builder` to bundle `runtime/`, `native/`, and `models/` into `NextHyke-Setup-1.0.0.exe`.
  - Zero external dependencies: requires no separate installation of Python, Git, OBS Studio, or manual FFmpeg.
- **Test:** Build installer: `npm run dist:win`
- **Verify:** Output file `dist\NextHyke-Setup-1.0.0.exe` is generated; checksum recorded.
- **Deploy:** Create GitHub Release `v1.0.0` with installer asset attached.
- **Re-Test:** Verify installer signature and check that installer launches with clear NextHyke branding.
- **Exit Gate:** Standalone installer package generated.

---

#### Feature 8.3: Clean Windows 11 Sandbox Verification & Staged Release
- **Where:** `tools/verify_clean_install.ps1` on branch `feature/p8-packaging-ga`.
- **What:** Automated installation test on a pristine Windows 11 test machine with zero developer tools installed.
- **How (Develop):**
  - Run installer in clean environment: verify installation completes in $< 60\text{ seconds}$, launches NextHyke, registers `"NextHyke Processed Camera"`, and streams video.
  - Perform uninstallation: verify complete removal leaves zero leftover files or orphan registry entries.
- **Test:** Execute: `.\tools\verify_clean_install.ps1 -InstallerPath "dist\NextHyke-Setup-1.0.0.exe"`
- **Verify:** Installation takes $< 60\text{ seconds}$; video stream works on first launch; uninstall is 100% clean.
- **Deploy:** Merge PR #9 into `main`. Begin staged rollout (Internal Pilot on HP 15-eg0xxx $\to$ 25% $\to$ 100% General Availability).
- **Re-Test:** Monitor initial pilot user logs for 24 hours to confirm zero crash regressions.
- **Exit Gate:** v1.0.0 General Availability release successfully completed.

---

## 4. Master Feature Execution Matrix

| # | Feature Name | Target Branch | Primary File | Key Verification Metric |
| :---: | :--- | :--- | :--- | :--- |
| **0.1** | Git Repo & Protection Rules | `feature/p0-baseline` | `.gitignore`, `.git/` | Clean repo; no direct pushes to `main` |
| **0.2** | Machine Hardware Spec | `feature/p0-baseline` | `hardware_spec.json` | JSON validates against HP 15-eg0xxx |
| **0.3** | PR Template & Verification CI | `feature/p0-baseline` | `.github/PULL_REQUEST_TEMPLATE.md`| Hardware benchmark checks enforced |
| **1.1** | Embedded CPython Bootstrapper | `feature/p1-runtime` | `tools/bootstrap_runtime.ps1` | `runtime/python.exe` outputs 3.10.13 |
| **1.2** | Pinned Dependency Manifest | `feature/p1-runtime` | `requirements-runtime.txt` | `CUDAExecutionProvider` available |
| **1.3** | Silicon Benchmark Tool | `feature/p1-runtime` | `tools/profile_silicon.py` | MX450 VRAM $\le 1.4\text{ GB}$; CPU threads $\le 3$ |
| **2.1** | Win32 Named Pipe Server | `feature/p2-native-ipc`| `src/native/named_pipe_server.cpp`| Command latency $< 0.5\text{ ms}$ |
| **2.2** | 24.8 MB Shared Memory Ring | `feature/p2-native-ipc`| `src/native/shared_memory_ring.cpp`| Transfer latency $< 2.0\text{ ms}$; zero drops |
| **2.3** | Worker Process Supervisor | `feature/p2-native-ipc`| `src/main/process-supervisor.ts` | Clean handle release on crash/exit |
| **2.4** | Electron 30+ Core Shell | `feature/p2-native-ipc`| `src/main/index.ts`, `package.json` | Idle UI memory $< 110\text{ MB}$; context isolated |
| **3.1** | Step 1 — Photo Picker & Rights | `feature/p3-guided-ui` | `src/renderer/src/steps/step1-reference.ts` | Format/size $\le 15\text{ MB}$; consent check |
| **3.2** | Step 2 — Video Source Picker | `feature/p3-guided-ui` | `src/renderer/src/steps/step2-source.ts` | Dynamic webcam & file enumeration |
| **3.3** | Step 3 — Pre-Flight Validator | `feature/p3-guided-ui` | `src/renderer/src/steps/step3-preflight.ts` | RAM $\ge 2.5\text{ GB}$ & VRAM ready |
| **3.4** | Step 4 — Controls & Canvas | `feature/p3-guided-ui` | `src/renderer/src/steps/step4-controls.ts` | 60 Hz canvas; collapsible drawer |
| **3.5** | Command Palette & Themes | `feature/p3-guided-ui` | `src/renderer/src/components/command-palette.ts` | `Ctrl+K` active; WCAG AA contrast |
| **4.1** | YOLOv8-Face Detection | `feature/p4-pipeline` | `src/engine/models/face_detector.py` | Detection latency $< 15\text{ ms}$; VRAM $< 220\text{ MB}$ |
| **4.2** | 2DFAN-106 Landmark Aligner | `feature/p4-pipeline` | `src/engine/models/landmark_aligner.py`| Latency $< 12\text{ ms}$; temporal smoothing |
| **4.3** | Identity Embedding Matcher | `feature/p4-pipeline` | `src/engine/models/face_embedder.py` | ArcFace cosine metric $\ge 0.65$; cached |
| **4.4** | INSwapper_128 Core Engine | `feature/p4-pipeline` | `src/engine/models/inswapper.py` | Swapper latency $\le 55\text{ ms}$; VRAM $\le 950\text{ MB}$ |
| **4.5** | Dynamic Frame Arenas | `feature/p4-pipeline` | `src/engine/memory/frame_arena.py` | 1-hr leak test $\le 1.0\text{ MB/hr}$; SSIM $\ge 0.985$|
| **4.6** | Dynamic VRAM Fallback | `feature/p4-pipeline` | `src/engine/fallback_handler.py` | Iris Xe fallback triggers at 92% VRAM |
| **5.1** | Media Foundation Source | `feature/p5-virtual-cam`| `src/native/virtual_camera/virtual_camera_source.cpp`| RGBA/NV12 negotiation clean |
| **5.2** | User Virtual Cam Registration| `feature/p5-virtual-cam`| `src/native/virtual_camera/virtual_camera_registrar.cpp`| `"NextHyke Processed Camera"` (no Admin) |
| **5.3** | Decoupled Dual-Clock Stream | `feature/p5-virtual-cam`| `src/native/virtual_camera/decoupled_stream_clock.cpp` | Locked 30.00 FPS in Teams/Zoom |
| **6.1** | Global Hotkey Window Toggle | `feature/p6-tray-hotkey`| `src/main/hotkey-manager.ts` | `Ctrl+\` toggle response $< 50\text{ ms}$ |
| **6.2** | Dynamic Tray Controller | `feature/p6-tray-hotkey`| `src/main/tray-controller.ts` | Active green pip during streaming |
| **6.3** | Screen Capture Transparency | `feature/p6-tray-hotkey`| `src/main/index.ts` | No `WDA_EXCLUDEFROMCAPTURE` |
| **7.1** | DPAPI Hardware Fingerprint | `feature/p7-licensing` | `src/main/licensing/hardware-fingerprint.ts`| Deterministic hash; machine bound |
| **7.2** | Ed25519 JWT Token Validator | `feature/p7-licensing` | `src/main/licensing/token-validator.ts` | Zero private keys/secrets in client |
| **7.3** | 72-Hour Monotonic Grace | `feature/p7-licensing` | `src/main/licensing/offline-grace-manager.ts`| 72h offline allowed; anti-clock rollback |
| **8.1** | Opt-In Telemetry Consent | `feature/p8-packaging-ga`| `src/main/telemetry.ts` | Zero biometric/frame data collected |
| **8.2** | Standalone NSIS Installer | `feature/p8-packaging-ga`| `electron-builder.yml` | Self-contained; zero external deps |
| **8.3** | Sandbox Verification & GA | `feature/p8-packaging-ga`| `tools/verify_clean_install.ps1` | Install $< 60\text{s}$; clean uninstall |
