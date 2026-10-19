# NextHyke

NextHyke is a self-contained Windows 11 desktop application delivering real-time AI facial enhancement and processing directly as a native Windows Media Foundation virtual camera (`"NextHyke Processed Camera"`) into enterprise conferencing software (Microsoft Teams, Zoom, Google Meet) without external driver dependencies.

---

## Target Physical Hardware & Resource Budget

Engineered and calibrated strictly for the **HP Pavilion Laptop 15-eg0xxx**:
- **CPU:** 11th Gen Intel Core i5-1135G7 @ 2.40 GHz (4C / 8T) — *Worker multithreading strictly capped at $\le 3$ threads*.
- **Primary AI GPU:** NVIDIA GeForce MX450 (Turing TU117 2.0 GB VRAM) — *Dedicated VRAM allocation strictly capped at $\le 1.4\text{ GB}$*.
- **Secondary iGPU:** Intel Iris Xe Graphics — *Dynamic fallback target if MX450 VRAM exceeds 92%*.
- **System Memory:** 16 GB DDR4-3200 — *Process working set limit $< 1.2\text{ GB}$; idle UI memory $< 110\text{ MB}$; max memory growth $\le 1.0\text{ MB/hr}$*.
- **OS:** Windows 11 Build 26200 (HAL 26100.1) with native `MFCreateVirtualCamera` support.

---

## Architecture Overview

1. **Renderer UI (`src/renderer/`):** Electron 30+ and TypeScript running inside a strictly isolated DOM context (`contextIsolation: true`, `nodeIntegration: false`). Features an intuitive 4-step guided wizard and pre-flight hardware readiness checks.
2. **Main Controller (`src/main/`):** Window lifecycle, global accelerator (`Ctrl+\`), and system tray controller with dynamic green pip status indicator.
3. **Native Bridge (`src/native/`):** `NextHykeCore.dll` managing a Win32 Named Pipe duplex control server and a $24.8\text{ MB}$ triple-buffered shared memory arena for zero-copy frame transport ($< 2.0\text{ ms}$ latency).
4. **Inference Pipeline (`src/engine/`):** Isolated embedded CPython 3.10/3.11 runtime running `YOLOv8-Face -> 2DFAN-106 -> ArcFace -> INSwapper` via ONNX Runtime CUDA Execution Provider.
5. **Virtual Camera (`src/native/virtual_camera/`):** C++/WinRT Media Foundation virtual camera (`IMFVirtualCamera`) with a decoupled dual-clock streaming engine (sustainable inference rate vs locked 30.00 FPS camera clock).

---

## Development Roadmap & Context

Refer to the master engineering blueprint:
- 📄 [plan.md](plan.md) — Closed-loop feature-by-feature implementation plan (Phase 0 to Phase 8).
- ⚙️ [hardware_spec.json](hardware_spec.json) — Physical compute limits and parameters.
- 📋 [.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md) — PR quality gates and verification checklist.
