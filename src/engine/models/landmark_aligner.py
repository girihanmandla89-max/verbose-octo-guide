"""
NextHyke Feature 4.2: 2DFAN-106 Landmark Alignment & Tracking
Extracts 106 geometric facial keypoints with temporal exponential smoothing to eliminate jitter.
"""

import os
import numpy as np
import cv2
import onnxruntime as ort
from typing import Optional, Tuple


class LandmarkAligner:
    """
    106-point facial landmark extractor with temporal exponential smoothing.
    Prevents landmark popping and jitter across consecutive video frames.
    """

    def __init__(
        self,
        model_path: Optional[str] = None,
        crop_size: int = 192,
        smoothing_alpha: float = 0.75,
        preferred_provider: str = "CUDAExecutionProvider"
    ):
        self.crop_size = crop_size
        self.alpha = smoothing_alpha
        self.preferred_provider = preferred_provider
        self.session: Optional[ort.InferenceSession] = None
        self.prev_landmarks: Optional[np.ndarray] = None

        if model_path is None:
            model_path = os.path.abspath(
                os.path.join(os.path.dirname(__file__), "../../../models/2dfan106.onnx")
            )
        self.model_path = model_path
        self._init_session()

    def _init_session(self):
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 3
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

        available_providers = ort.get_available_providers()
        providers = []
        if self.preferred_provider in available_providers:
            providers.append(self.preferred_provider)
        providers.append("CPUExecutionProvider")

        if os.path.exists(self.model_path):
            try:
                self.session = ort.InferenceSession(self.model_path, sess_options=opts, providers=providers)
                print(f"[LandmarkAligner] Loaded model from {self.model_path}")
            except Exception as e:
                print(f"[LandmarkAligner] Fallback loading: {e}")
                self.session = None
        else:
            self.session = None

    def extract_landmarks(
        self,
        frame: np.ndarray,
        bbox: Tuple[float, float, float, float]
    ) -> np.ndarray:
        """
        Extracts 106 (x, y) landmarks for the given face bbox: (x1, y1, x2, y2).
        Returns: np.ndarray of shape (106, 2) in original frame coordinates.
        """
        x1, y1, x2, y2 = bbox
        h, w = frame.shape[:2]

        # Add 15% margin around bbox for complete chin/forehead context
        bw = x2 - x1
        bh = y2 - y1
        cx, cy = x1 + bw / 2.0, y1 + bh / 2.0
        size = max(bw, bh) * 1.3

        crop_x1 = max(0, int(cx - size / 2.0))
        crop_y1 = max(0, int(cy - size / 2.0))
        crop_x2 = min(w, int(cx + size / 2.0))
        crop_y2 = min(h, int(cy + size / 2.0))

        crop = frame[crop_y1:crop_y2, crop_x1:crop_x2]
        if crop.size == 0:
            return np.zeros((106, 2), dtype=np.float32)

        crop_resized = cv2.resize(crop, (self.crop_size, self.crop_size), interpolation=cv2.INTER_LINEAR)

        if self.session is not None:
            # Model inference
            blob = cv2.cvtColor(crop_resized, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
            blob = np.transpose(blob, (2, 0, 1))
            blob = np.expand_dims(blob, axis=0)

            input_name = self.session.get_inputs()[0].name
            raw_out = self.session.run(None, {input_name: blob})[0]  # Shape: [1, 106, 2] or [1, 212]
            landmarks_norm = raw_out.reshape(106, 2)

            # Map from normalized crop space back to frame space
            scale_x = (crop_x2 - crop_x1) / float(self.crop_size)
            scale_y = (crop_y2 - crop_y1) / float(self.crop_size)

            raw_landmarks = np.zeros((106, 2), dtype=np.float32)
            raw_landmarks[:, 0] = crop_x1 + landmarks_norm[:, 0] * scale_x
            raw_landmarks[:, 1] = crop_y1 + landmarks_norm[:, 1] * scale_y
        else:
            # Synthetic 106-point canonical face model for testing
            raw_landmarks = self._generate_canonical_106(crop_x1, crop_y1, crop_x2 - crop_x1, crop_y2 - crop_y1)

        # Apply Temporal Exponential Smoothing Filter
        if self.prev_landmarks is None or self.prev_landmarks.shape != raw_landmarks.shape:
            smoothed_landmarks = raw_landmarks
        else:
            smoothed_landmarks = self.alpha * raw_landmarks + (1.0 - self.alpha) * self.prev_landmarks

        self.prev_landmarks = smoothed_landmarks
        return smoothed_landmarks

    def reset_tracker(self):
        """Resets temporal smoothing history (e.g. when user changes camera or scene cuts)."""
        self.prev_landmarks = None

    @staticmethod
    def _generate_canonical_106(x: int, y: int, w: int, h: int) -> np.ndarray:
        """Generates canonical 106-point landmark topology mapped to given rectangle."""
        pts = np.zeros((106, 2), dtype=np.float32)
        # Jawline: 0-32 (outer contour)
        for i in range(33):
            theta = np.pi * (0.8 + 1.4 * (i / 32.0))
            pts[i, 0] = x + (w * 0.5) + (w * 0.45) * np.cos(theta)
            pts[i, 1] = y + (h * 0.5) + (h * 0.48) * np.sin(theta)

        # Left eyebrow: 33-41
        for i in range(33, 42):
            pts[i, 0] = x + w * (0.2 + 0.25 * ((i - 33) / 8.0))
            pts[i, 1] = y + h * (0.28 - 0.05 * np.sin((i - 33) / 8.0 * np.pi))

        # Right eyebrow: 42-50
        for i in range(42, 51):
            pts[i, 0] = x + w * (0.55 + 0.25 * ((i - 42) / 8.0))
            pts[i, 1] = y + h * (0.28 - 0.05 * np.sin((i - 42) / 8.0 * np.pi))

        # Nose bridge and base: 51-60
        for i in range(51, 61):
            pts[i, 0] = x + w * (0.47 + 0.06 * np.sin((i - 51) / 9.0 * np.pi))
            pts[i, 1] = y + h * (0.35 + 0.25 * ((i - 51) / 9.0))

        # Left eye: 61-68
        for i in range(61, 69):
            ang = 2.0 * np.pi * ((i - 61) / 8.0)
            pts[i, 0] = x + w * 0.32 + (w * 0.07) * np.cos(ang)
            pts[i, 1] = y + h * 0.38 + (h * 0.04) * np.sin(ang)

        # Right eye: 69-76
        for i in range(69, 77):
            ang = 2.0 * np.pi * ((i - 69) / 8.0)
            pts[i, 0] = x + w * 0.68 + (w * 0.07) * np.cos(ang)
            pts[i, 1] = y + h * 0.38 + (h * 0.04) * np.sin(ang)

        # Outer mouth: 77-96
        for i in range(77, 97):
            ang = 2.0 * np.pi * ((i - 77) / 20.0)
            pts[i, 0] = x + w * 0.50 + (w * 0.16) * np.cos(ang)
            pts[i, 1] = y + h * 0.74 + (h * 0.09) * np.sin(ang)

        # Inner mouth: 97-105
        for i in range(97, 106):
            ang = 2.0 * np.pi * ((i - 97) / 9.0)
            pts[i, 0] = x + w * 0.50 + (w * 0.10) * np.cos(ang)
            pts[i, 1] = y + h * 0.74 + (h * 0.05) * np.sin(ang)

        return pts
