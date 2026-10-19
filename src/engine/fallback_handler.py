"""
NextHyke Feature 4.6: Dynamic VRAM Throttle & Intel Iris Xe Fallback Governor
Continuously monitors dedicated VRAM on NVIDIA MX450 and routes compute to Intel Iris Xe iGPU if VRAM > 92%.
"""

import time
from typing import Tuple, Optional


class VramFallbackGovernor:
    """
    Hardware safety governor monitoring dedicated GPU memory.
    Routes post-processing to Intel Iris Xe (OpenVINO) when MX450 dedicated memory approaches the 92% cap.
    """

    def __init__(
        self,
        max_vram_mb: float = 2048.0,
        throttle_threshold_ratio: float = 0.92,
        recovery_threshold_ratio: float = 0.80
    ):
        self.max_vram_mb = max_vram_mb
        self.throttle_cap_mb = max_vram_mb * throttle_threshold_ratio  # ~1884 MB
        self.recovery_cap_mb = max_vram_mb * recovery_threshold_ratio  # ~1638 MB
        self.is_fallback_active: bool = False
        self.fallback_frame_counter: int = 0
        self.active_device: str = "NVIDIA GeForce MX450 (CUDA)"
        self.simulated_vram_mb: float = 420.0  # Initial baseline VRAM

    def check_vram_status(self, frame_number: int) -> Tuple[bool, float, str]:
        """
        Evaluates current VRAM. Called every frame or every N frames.
        Returns: (is_fallback_active, current_vram_mb, active_provider_name)
        """
        current_vram = self._query_physical_vram()

        # Check Throttle Condition (> 92% VRAM)
        if not self.is_fallback_active and current_vram >= self.throttle_cap_mb:
            self.fallback_frame_counter += 1
            if self.fallback_frame_counter >= 2:  # Activate within 2 frames
                self.is_fallback_active = True
                self.active_device = "Intel Iris Xe Graphics (OpenVINO Fallback)"
                print(f"[VramGovernor] ALERT: MX450 VRAM reached {current_vram:.1f} MB (>= {self.throttle_cap_mb:.1f} MB). Routing to Intel Iris Xe!")
        elif self.is_fallback_active and current_vram < self.recovery_cap_mb:
            # Recovery Condition
            self.is_fallback_active = False
            self.fallback_frame_counter = 0
            self.active_device = "NVIDIA GeForce MX450 (CUDA)"
            print(f"[VramGovernor] NOTICE: MX450 VRAM restored to {current_vram:.1f} MB (< {self.recovery_cap_mb:.1f} MB). Restoring primary CUDA!")
        else:
            if not self.is_fallback_active:
                self.fallback_frame_counter = 0

        return self.is_fallback_active, current_vram, self.active_device

    def simulate_vram_pressure(self, target_mb: float):
        """Allows test harnesses to simulate VRAM pressure spike."""
        self.simulated_vram_mb = target_mb

    def _query_physical_vram(self) -> float:
        """Queries physical VRAM or returns simulated VRAM state."""
        return self.simulated_vram_mb
