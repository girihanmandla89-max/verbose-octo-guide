"""
NextHyke Master AI Pipeline Controller
Coordinates face detection, landmark alignment, identity embedding, synthesis, and compositing.
"""

import time
import numpy as np
import cv2
from typing import Optional, Dict, Any, Tuple

from src.engine.models.face_detector import FaceDetector
from src.engine.models.landmark_aligner import LandmarkAligner
from src.engine.models.face_embedder import FaceEmbedder
from src.engine.models.inswapper import INSwapperRunner
from src.engine.models.compositor import FaceCompositor
from src.engine.memory.frame_arena import FrameArena
from src.engine.fallback_handler import VramFallbackGovernor


class NextHykePipeline:
    """
    End-to-end real-time AI video processing pipeline.
    Connects camera ingress, face detection, 106-pt tracking, INSwapper synthesis, and zero-leak compositing.
    """

    def __init__(self, frame_width: int = 1920, frame_height: int = 1080):
        self.width = frame_width
        self.height = frame_height

        # Initialize Core Subsystems
        self.detector = FaceDetector()
        self.aligner = LandmarkAligner()
        self.embedder = FaceEmbedder()
        self.swapper = INSwapperRunner()
        self.compositor = FaceCompositor()
        self.arena = FrameArena(frame_width, frame_height)
        self.governor = VramFallbackGovernor()

        self.target_embedding: Optional[np.ndarray] = None
        self.is_configured: boolean = False
        self.frame_counter: int = 0
        self.total_latency_ms: float = 0.0

    def load_reference_photo(self, image_path: str) -> bool:
        """Loads and caches reference photo identity embedding once."""
        img = cv2.imread(image_path)
        if img is None:
            print(f"[Pipeline] Failed to load reference photo from {image_path}")
            return False

        # Detect face in reference photo
        boxes = self.detector.detect(img, conf_threshold=0.5)
        if len(boxes) > 0:
            x1, y1, x2, y2, _ = [int(v) for v in boxes[0]]
            crop = img[max(0, y1):min(img.shape[0], y2), max(0, x1):min(img.shape[1], x2)]
        else:
            crop = img

        self.target_embedding = self.embedder.set_reference_target(image_path, crop)
        self.is_configured = True
        return True

    def process_frame(self, input_bgr: np.ndarray) -> Tuple[np.ndarray, Dict[str, Any]]:
        """
        Executes one full iteration of the NextHyke inference pipeline.
        Returns: (processed_bgr_frame, telemetry_dict)
        """
        t0 = time.perf_counter()
        self.frame_counter += 1

        # Check VRAM safety governor
        is_fallback, current_vram, active_device = self.governor.check_vram_status(self.frame_counter)

        # 1. Face Detection
        t_det0 = time.perf_counter()
        detections = self.detector.detect(input_bgr, conf_threshold=0.5)
        det_time_ms = (time.perf_counter() - t_det0) * 1000.0

        if len(detections) == 0 or self.target_embedding is None:
            # No face detected or target not loaded: return original frame directly
            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            return input_bgr, {
                "faces_detected": 0,
                "latency_ms": round(elapsed_ms, 2),
                "det_time_ms": round(det_time_ms, 2),
                "swap_time_ms": 0.0,
                "vram_mb": round(current_vram, 1),
                "device": active_device,
                "is_fallback": is_fallback
            }

        # Select primary face
        primary_box = detections[0][:4]

        # 2. 106-Point Landmark Alignment & Temporal Smoothing
        t_align0 = time.perf_counter()
        landmarks = self.aligner.extract_landmarks(input_bgr, primary_box)
        align_time_ms = (time.perf_counter() - t_align0) * 1000.0

        # 3. Crop aligned face for 128x128 swapper
        x1, y1, x2, y2 = [int(v) for v in primary_box]
        face_crop = input_bgr[max(0, y1):min(input_bgr.shape[0], y2), max(0, x1):min(input_bgr.shape[1], x2)]

        # 4. Core Synthesis (INSwapper_128)
        t_swap0 = time.perf_counter()
        swapped_128 = self.swapper.swap_face(face_crop, self.target_embedding)
        swap_time_ms = (time.perf_counter() - t_swap0) * 1000.0

        # 5. Seamless Compositing & Blending
        t_comp0 = time.perf_counter()
        output_bgr = self.compositor.composite(input_bgr, swapped_128, landmarks, primary_box)
        comp_time_ms = (time.perf_counter() - t_comp0) * 1000.0

        total_elapsed_ms = (time.perf_counter() - t0) * 1000.0

        telemetry = {
            "faces_detected": len(detections),
            "latency_ms": round(total_elapsed_ms, 2),
            "det_time_ms": round(det_time_ms, 2),
            "align_time_ms": round(align_time_ms, 2),
            "swap_time_ms": round(swap_time_ms, 2),
            "comp_time_ms": round(comp_time_ms, 2),
            "vram_mb": round(current_vram, 1),
            "device": active_device,
            "is_fallback": is_fallback
        }

        return output_bgr, telemetry

    def reset(self):
        """Resets temporal tracking and frame counters."""
        self.aligner.reset_tracker()
        self.frame_counter = 0
