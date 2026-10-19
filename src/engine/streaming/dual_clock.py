"""
NextHyke Feature 5.3: Decoupled Dual-Clock Streaming Engine
Decouples variable AI inference rate (10-18 FPS) from the native virtual camera output clock (locked to 30.00 FPS).
Guarantees rock-solid 30.00 FPS presentation timestamps to downstream conferencing clients (Teams/Zoom/Meet).
"""

import time
import threading
from typing import Optional, Callable, Dict, Any
import numpy as np

from src.engine.ipc.shared_memory import SharedMemoryRing


class DecoupledStreamClock:
    """
    Decoupled Dual-Clock Streaming Controller.
    Ticks at an unwavering 30.00 FPS (33.333 ms interval).
    If AI inference is in-flight, repeats the latest valid frame with a monotonic presentation timestamp.
    """

    def __init__(
        self,
        session_id: int,
        target_fps: float = 30.0,
        shm: Optional[SharedMemoryRing] = None
    ):
        self.session_id = session_id
        self.target_fps = target_fps
        self.interval_sec = 1.0 / target_fps  # 0.0333333... sec (33.333 ms)
        self.shm = shm

        self._lock = threading.Lock()
        self._is_running = False
        self._worker_thread: Optional[threading.Thread] = None
        self._callback: Optional[Callable[[np.ndarray, int, int, bool], None]] = None

        # Frame staging state
        self._latest_inference_frame: Optional[np.ndarray] = None
        self._latest_inference_index: int = 0
        self._last_published_inference_index: int = -1

        # Presentation and telemetry counters
        self._published_frames: int = 0
        self._repeated_frames: int = 0
        self._start_time: float = 0.0
        self._presentation_timestamp_100ns: int = 0
        self._max_jitter_ms: float = 0.0

    @property
    def is_running(self) -> bool:
        return self._is_running

    @property
    def published_frames(self) -> int:
        return self._published_frames

    @property
    def repeated_frames(self) -> int:
        return self._repeated_frames

    def push_inference_frame(self, frame_rgba: np.ndarray, frame_index: int):
        """
        Thread-safe method called by the AI pipeline when a new facial synthesis frame is complete.
        """
        if frame_rgba is None:
            return

        with self._lock:
            self._latest_inference_frame = frame_rgba
            self._latest_inference_index = frame_index

    def start(self, callback: Optional[Callable[[np.ndarray, int, int, bool], None]] = None) -> bool:
        """
        Starts the decoupled 30.00 FPS publishing clock thread.
        """
        if self._is_running:
            return True

        self._callback = callback
        self._is_running = True
        self._published_frames = 0
        self._repeated_frames = 0
        self._last_published_inference_index = -1
        self._presentation_timestamp_100ns = 0
        self._max_jitter_ms = 0.0
        self._start_time = time.perf_counter()

        self._worker_thread = threading.Thread(
            target=self._clock_loop,
            name="NextHyke-DecoupledClock",
            daemon=True
        )
        self._worker_thread.start()
        return True

    def stop(self):
        """
        Stops the decoupled clock thread cleanly.
        """
        if not self._is_running:
            return

        self._is_running = False
        if self._worker_thread and self._worker_thread.is_alive():
            self._worker_thread.join(timeout=2.0)
            self._worker_thread = None

    def _clock_loop(self):
        """
        High-precision monotonic clock loop delivering 30.00 FPS cadence.
        """
        next_target_time = time.perf_counter()
        nominal_step_100ns = int(self.interval_sec * 10_000_000)  # 333,333 in 100ns units

        while self._is_running:
            now = time.perf_counter()
            sleep_needed = next_target_time - now

            if sleep_needed > 0.002:
                # Sleep for coarse duration, then spin-wait for high-precision sub-millisecond alignment
                time.sleep(sleep_needed - 0.001)

            # Spin-wait to exact target
            while time.perf_counter() < next_target_time:
                pass

            tick_now = time.perf_counter()
            jitter_ms = abs((tick_now - next_target_time) * 1000.0)
            if jitter_ms > self._max_jitter_ms:
                self._max_jitter_ms = jitter_ms

            # Increment next tick target monotonically to prevent drift accumulation
            next_target_time += self.interval_sec

            # Read latest staged inference frame
            frame_to_publish = None
            current_inf_index = 0
            is_repeated = False

            with self._lock:
                if self._latest_inference_frame is not None:
                    frame_to_publish = self._latest_inference_frame
                    current_inf_index = self._latest_inference_index

            if frame_to_publish is not None:
                if current_inf_index == self._last_published_inference_index:
                    # AI inference still in-flight; repeat latest frame
                    is_repeated = True
                    self._repeated_frames += 1
                else:
                    # Fresh AI inference frame
                    is_repeated = False
                    self._last_published_inference_index = current_inf_index

                self._published_frames += 1
                self._presentation_timestamp_100ns += nominal_step_100ns

                # Publish to Shared Memory Ring if present
                if self.shm:
                    h, w = frame_to_publish.shape[:2]
                    self.shm.write_frame(frame_to_publish.tobytes(), w, h)

                # Invoke listener callback if registered
                if self._callback:
                    try:
                        self._callback(
                            frame_to_publish,
                            self._published_frames,
                            self._presentation_timestamp_100ns,
                            is_repeated
                        )
                    except Exception as e:
                        print(f"[DecoupledStreamClock] Callback error: {e}", flush=True)

    def get_telemetry(self) -> Dict[str, Any]:
        """
        Returns real-time streaming telemetry for dashboard monitoring.
        """
        elapsed = max(0.001, time.perf_counter() - self._start_time) if self._is_running else 1.0
        effective_fps = self._published_frames / elapsed
        unique_frames = self._published_frames - self._repeated_frames
        inference_fps = unique_frames / elapsed

        return {
            "target_fps": self.target_fps,
            "published_frames": self._published_frames,
            "repeated_frames": self._repeated_frames,
            "effective_fps": round(effective_fps, 2),
            "inference_fps": round(inference_fps, 2),
            "repeat_ratio": round(self._repeated_frames / max(1, self._published_frames), 3),
            "max_jitter_ms": round(self._max_jitter_ms, 2),
            "is_active": self._is_running
        }
