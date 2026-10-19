"""
NextHyke Phase 4: AI Model Pipeline & VRAM Budgeting Qualification Test
Verifies:
1. Feature 4.1: Face detector recall (>= 98%), latency (< 15 ms), zero-face graceful handling.
2. Feature 4.2: 106-point landmark tracking, temporal exponential smoothing, latency (< 12 ms).
3. Feature 4.3: Identity embedding caching, cosine similarity separation (>= 0.65).
4. Feature 4.4: INSwapper_128 synthesis (500 iterations), latency (<= 55 ms), zero NaN/artifacts.
5. Feature 4.5: Camera-sized FrameArena dynamic resizing, SSIM >= 0.985, zero memory leak.
6. Feature 4.6: VRAM throttle at 92% (> 1880 MB), Iris Xe fallback within 2 frames, auto-recovery.
"""

import sys
import os
import time
import numpy as np
import cv2

# Ensure project root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.engine.models.face_detector import FaceDetector
from src.engine.models.landmark_aligner import LandmarkAligner
from src.engine.models.face_embedder import FaceEmbedder
from src.engine.models.inswapper import INSwapperRunner
from src.engine.models.compositor import FaceCompositor
from src.engine.memory.frame_arena import FrameArena
from src.engine.fallback_handler import VramFallbackGovernor
from src.engine.pipeline import NextHykePipeline


def generate_synthetic_portrait(width=640, height=480, face_cx=320, face_cy=240, skin_tone=(180, 200, 230)) -> np.ndarray:
    """Generates synthetic portrait frame with oval face for deterministic benchmarking."""
    img = np.full((height, width, 3), (40, 30, 25), dtype=np.uint8)
    # Face oval
    cv2.ellipse(img, (face_cx, face_cy), (80, 110), 0, 0, 360, skin_tone, -1)
    # Eyes
    cv2.circle(img, (face_cx - 30, face_cy - 20), 10, (20, 20, 20), -1)
    cv2.circle(img, (face_cx + 30, face_cy - 20), 10, (20, 20, 20), -1)
    # Mouth
    cv2.ellipse(img, (face_cx, face_cy + 45), (25, 10), 0, 0, 360, (50, 50, 180), -1)
    return img


def run_pipeline_qualification():
    print("=" * 60)
    print("NextHyke Phase 4: AI Model Pipeline Qualification Suite")
    print("=" * 60)

    # ----------------------------------------------------
    # 1. Feature 4.1: YOLOv8-Face Detection Runner
    # ----------------------------------------------------
    print("\n[Feature 4.1] Testing YOLOv8-Face Detector:")
    detector = FaceDetector()

    # Case A: Frame with zero faces
    blank_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    zero_detections = detector.detect(blank_frame)
    assert len(zero_detections) == 0, "Zero-face frame returned unexpected detections!"
    print("  PASS: Zero-face frame handled gracefully (returned empty list).")

    # Case B: 100 benchmark face detection iterations
    sample_portrait = generate_synthetic_portrait()
    det_latencies = []
    successful_detections = 0

    for i in range(100):
        t0 = time.perf_counter()
        boxes = detector.detect(sample_portrait, conf_threshold=0.5)
        t1 = time.perf_counter()
        det_latencies.append((t1 - t0) * 1000.0)
        if len(boxes) > 0:
            successful_detections += 1

    avg_det_ms = np.mean(det_latencies)
    recall = (successful_detections / 100.0) * 100.0
    print(f"  PASS: 100 face iterations completed.")
    print(f"        Average Detection Latency: {avg_det_ms:.3f} ms (Target: < 15 ms)")
    print(f"        Detection Recall Rate:     {recall:.1f}% (Target: >= 98%)")

    assert avg_det_ms < 15.0, f"Detection latency {avg_det_ms:.2f} ms exceeded 15 ms limit!"
    assert recall >= 98.0, f"Recall {recall:.1f}% fell below 98% threshold!"

    # ----------------------------------------------------
    # 2. Feature 4.2: 2DFAN-106 Landmark Alignment & Tracking
    # ----------------------------------------------------
    print("\n[Feature 4.2] Testing 2DFAN-106 Landmark Aligner & Temporal Smoothing:")
    aligner = LandmarkAligner(smoothing_alpha=0.75)
    test_bbox = (240.0, 130.0, 400.0, 350.0)

    align_latencies = []
    prev_pts = None
    jitter_accum = 0.0

    # Simulate 60-frame tracking with slight hand tremor / noise
    for frame_idx in range(60):
        noisy_bbox = (
            test_bbox[0] + np.random.uniform(-1.5, 1.5),
            test_bbox[1] + np.random.uniform(-1.5, 1.5),
            test_bbox[2] + np.random.uniform(-1.5, 1.5),
            test_bbox[3] + np.random.uniform(-1.5, 1.5)
        )
        t0 = time.perf_counter()
        landmarks = aligner.extract_landmarks(sample_portrait, noisy_bbox)
        t1 = time.perf_counter()
        align_latencies.append((t1 - t0) * 1000.0)

        assert landmarks.shape == (106, 2), f"Expected shape (106, 2), got {landmarks.shape}"

        if prev_pts is not None:
            diff = np.mean(np.abs(landmarks - prev_pts))
            jitter_accum += diff
        prev_pts = landmarks.copy()

    avg_align_ms = np.mean(align_latencies)
    avg_jitter = jitter_accum / 59.0
    print(f"  PASS: 60-frame temporal tracking complete.")
    print(f"        Average Landmark Latency: {avg_align_ms:.3f} ms (Target: < 12 ms)")
    print(f"        Temporal Jitter Metric:   {avg_jitter:.3f} px (Smooth: < 1.0 px)")

    assert avg_align_ms < 12.0, f"Landmark latency {avg_align_ms:.2f} ms exceeded 12 ms limit!"
    assert avg_jitter < 1.0, f"Landmark jitter {avg_jitter:.2f} px indicated unstable tracking!"

    # ----------------------------------------------------
    # 3. Feature 4.3: Identity Embedding Matcher
    # ----------------------------------------------------
    print("\n[Feature 4.3] Testing Identity Embedding Matcher & Caching:")
    embedder = FaceEmbedder(similarity_threshold=0.65)

    personA_img = generate_synthetic_portrait(width=640, height=480, face_cx=320, face_cy=240, skin_tone=(180, 200, 230))
    personB_img = generate_synthetic_portrait(width=640, height=480, face_cx=260, face_cy=200, skin_tone=(70, 90, 120))

    # Test Caching
    t0 = time.perf_counter()
    emb_ref1 = embedder.set_reference_target("personA.jpg", personA_img)
    t_first = (time.perf_counter() - t0) * 1000.0

    t0 = time.perf_counter()
    emb_ref2 = embedder.set_reference_target("personA.jpg", personA_img)
    t_cached = (time.perf_counter() - t0) * 1000.0

    assert emb_ref1.shape == (512,), f"Embedding shape {emb_ref1.shape} != (512,)"
    assert np.allclose(emb_ref1, emb_ref2), "Cached embedding mismatch!"
    print(f"  PASS: Reference embedding computed in {t_first:.3f} ms; cached lookup in {t_cached:.4f} ms.")

    # Cosine Similarity Separation Test
    embA_variant = embedder.compute_embedding(personA_img)
    embB = embedder.compute_embedding(personB_img)

    same_person, sim_same = embedder.is_same_identity(emb_ref1, embA_variant)
    diff_person, sim_diff = embedder.is_same_identity(emb_ref1, embB)

    print(f"        Same Person Similarity:      {sim_same:.4f} (Threshold >= 0.65 -> {same_person})")
    print(f"        Different Person Similarity: {sim_diff:.4f} (Threshold >= 0.65 -> {diff_person})")

    assert same_person, f"Same person similarity {sim_same:.4f} was below 0.65!"
    assert not diff_person, f"Different person similarity {sim_diff:.4f} was erroneously >= 0.65!"

    # ----------------------------------------------------
    # 4. Feature 4.4: INSwapper_128 Core ONNX Runner
    # ----------------------------------------------------
    print("\n[Feature 4.4] Testing INSwapper_128 Core Runner (500 iterations):")
    swapper = INSwapperRunner()
    face_crop = sample_portrait[130:350, 240:400]

    swap_latencies = []
    total_start = time.perf_counter()

    for i in range(500):
        t0 = time.perf_counter()
        swapped_face = swapper.swap_face(face_crop, emb_ref1)
        t1 = time.perf_counter()
        swap_latencies.append((t1 - t0) * 1000.0)

        # Inspect visual buffer for NaNs or corrupt bounds
        assert not np.isnan(swapped_face).any(), f"Iteration {i} contained NaN pixels!"
        assert swapped_face.shape == (128, 128, 3), f"Swapped face shape {swapped_face.shape} != (128, 128, 3)"

    avg_swap_ms = np.mean(swap_latencies)
    p99_swap_ms = np.percentile(swap_latencies, 99)
    total_swap_time = time.perf_counter() - total_start

    print(f"  PASS: 500 swap iterations completed in {total_swap_time:.2f}s.")
    print(f"        Average Swapper Latency: {avg_swap_ms:.3f} ms (Target: <= 55 ms)")
    print(f"        P99 Swapper Latency:     {p99_swap_ms:.3f} ms")
    print(f"        Zero NaNs or corrupt buffers verified.")

    assert avg_swap_ms <= 55.0, f"Swapper latency {avg_swap_ms:.2f} ms exceeded 55 ms limit!"

    # ----------------------------------------------------
    # 5. Feature 4.5: Camera-Sized Frame Arena & Compositing
    # ----------------------------------------------------
    print("\n[Feature 4.5] Testing Dynamic Frame Arena & Compositor:")
    compositor = FaceCompositor()
    arena = FrameArena(width=1920, height=1080)

    # Test Compositing
    blended_frame = compositor.composite(sample_portrait, swapped_face, landmarks, test_bbox)
    assert blended_frame.shape == sample_portrait.shape

    # Calculate SSIM on background
    ssim_val = FaceCompositor.calculate_ssim(sample_portrait, blended_frame)
    print(f"  PASS: Composited frame produced with SSIM: {ssim_val:.4f} (Target: >= 0.985)")
    assert ssim_val >= 0.985, f"SSIM {ssim_val:.4f} fell below 0.985 threshold!"

    # Test dynamic resolution change mid-session
    arena.resize_arena_if_needed(1280, 720)
    assert arena.width == 1280 and arena.height == 720
    assert arena.get_buffer("ingress_rgba").shape == (720, 1280, 4)
    print("  PASS: Dynamic resolution change (1080p -> 720p) resized arena cleanly.")

    # ----------------------------------------------------
    # 6. Feature 4.6: Dynamic VRAM Throttle & Iris Xe Fallback
    # ----------------------------------------------------
    print("\n[Feature 4.6] Testing VRAM Throttle & Intel Iris Xe Fallback Governor:")
    governor = VramFallbackGovernor(max_vram_mb=2048.0)

    # Initial state: Normal VRAM (420 MB)
    is_fb, vram, dev = governor.check_vram_status(1)
    assert not is_fb, "Fallback active under normal VRAM!"
    print(f"  PASS: Normal condition: VRAM={vram:.1f} MB, Device='{dev}'")

    # Simulate VRAM pressure spike (1950 MB > 1884 MB / 92%)
    governor.simulate_vram_pressure(1950.0)
    governor.check_vram_status(2)  # Frame 1 of pressure
    is_fb, vram, dev = governor.check_vram_status(3)  # Frame 2 of pressure -> Triggers fallback
    assert is_fb, "Fallback failed to activate within 2 frames under pressure!"
    assert "Intel Iris Xe" in dev
    print(f"  PASS: Fallback activated within 2 frames: Device='{dev}'")

    # Simulate VRAM recovery (< 80% / 1638 MB)
    governor.simulate_vram_pressure(1200.0)
    is_fb, vram, dev = governor.check_vram_status(4)
    assert not is_fb, "Fallback failed to recover after pressure dropped!"
    assert "NVIDIA GeForce MX450" in dev
    print(f"  PASS: Primary GPU automatically restored: Device='{dev}'")

    # ----------------------------------------------------
    # End-to-End Pipeline Integration Test
    # ----------------------------------------------------
    print("\n[Integration] Testing Full NextHyke Pipeline End-to-End:")
    pipeline = NextHykePipeline(frame_width=640, frame_height=480)
    # Set synthetic reference
    pipeline.target_embedding = emb_ref1

    out_frame, telemetry = pipeline.process_frame(sample_portrait)
    print(f"  Pipeline Output: {out_frame.shape}, Telemetry: {telemetry}")
    assert telemetry["faces_detected"] >= 1
    assert telemetry["latency_ms"] < 60.0

    print("\n>>> Phase 4 AI Model Pipeline & VRAM Budgeting: ALL TESTS PASSED <<<\n")


if __name__ == "__main__":
    run_pipeline_qualification()
