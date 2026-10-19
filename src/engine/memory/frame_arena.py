"""
NextHyke Feature 4.5: Dynamic Camera-Sized Frame Arena
Pools pre-allocated image buffers sized strictly to active camera dimensions, eliminating per-frame heap churn.
"""

import numpy as np
from typing import Dict, Tuple, Optional


class FrameArena:
    """
    Fixed-size memory pool managing reusable frame buffers.
    Locks memory footprint to active resolution and eliminates Python garbage collection pauses.
    """

    def __init__(self, width: int = 1920, height: int = 1080):
        self.width = width
        self.height = height
        self.channels = 4  # RGBA
        self.bgr_channels = 3  # BGR

        # Pre-allocated reusable buffers
        self.buffers: Dict[str, np.ndarray] = {}
        self.allocate_arena(width, height)

    def allocate_arena(self, width: int, height: int):
        """Allocates reusable static buffers for the specified frame resolution."""
        self.width = width
        self.height = height

        # 1. Raw Ingress Buffer (RGBA uint8)
        self.buffers["ingress_rgba"] = np.zeros((height, width, 4), dtype=np.uint8)
        # 2. BGR Ingress Working Buffer
        self.buffers["ingress_bgr"] = np.zeros((height, width, 3), dtype=np.uint8)
        # 3. Composited Egress Buffer (BGR uint8)
        self.buffers["egress_bgr"] = np.zeros((height, width, 3), dtype=np.uint8)
        # 4. Final Output Egress Buffer (RGBA uint8 for Shared Memory Ring)
        self.buffers["egress_rgba"] = np.zeros((height, width, 4), dtype=np.uint8)
        # 5. Mask Working Buffer (uint8 single-channel)
        self.buffers["mask"] = np.zeros((height, width), dtype=np.uint8)

        total_bytes = sum(buf.nbytes for buf in self.buffers.values())
        print(f"[FrameArena] Pre-allocated {len(self.buffers)} reusable buffers for {width}x{height} ({total_bytes / (1024*1024):.2f} MB)")

    def get_buffer(self, name: str) -> np.ndarray:
        """Returns reference to pre-allocated buffer without heap allocation."""
        if name not in self.buffers:
            raise KeyError(f"Buffer {name} not found in FrameArena")
        return self.buffers[name]

    def resize_arena_if_needed(self, width: int, height: int):
        """Dynamically re-allocates pool only if camera resolution changes mid-session."""
        if self.width != width or self.height != height:
            print(f"[FrameArena] Resolution change detected: {self.width}x{self.height} -> {width}x{height}")
            self.buffers.clear()
            self.allocate_arena(width, height)

    def clear(self):
        """Releases all arena buffers cleanly."""
        self.buffers.clear()
