"""
Performance benchmarking utilities for the YOLO fruit detector.

Measures latency, throughput, accuracy, and memory usage.
Supports CPU and GPU and can compare multiple models.

Author: Romilson Lemes Cordeiro
Module: 4 - Python Backend & YOLO Integration
"""

from __future__ import annotations

import logging
import statistics
import time
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)


def _detect_device() -> str:
    """Return ``'cuda'`` if a GPU is available, otherwise ``'cpu'``."""
    try:
        import torch
        return "cuda" if torch.cuda.is_available() else "cpu"
    except ImportError:
        return "cpu"


def _get_memory_mb() -> float:
    """Return current process RSS in megabytes (best-effort)."""
    try:
        import psutil, os
        process = psutil.Process(os.getpid())
        return round(process.memory_info().rss / (1024 * 1024), 2)
    except Exception:
        return 0.0


class Benchmark:
    """Comprehensive benchmarking suite for a :class:`YOLODetector`."""

    def __init__(self, detector: Any) -> None:
        """Initialise with an existing YOLODetector instance.

        Args:
            detector: A ``YOLODetector`` instance used for inference.
        """
        from yolo_detector import YOLODetector

        if not isinstance(detector, YOLODetector):
            raise TypeError("detector must be an instance of YOLODetector")

        self._detector = detector
        self._device: str = _detect_device()
        self._latency_results: dict[str, Any] | None = None
        self._throughput_results: dict[str, Any] | None = None
        self._accuracy_results: dict[str, Any] | None = None

    # ------------------------------------------------------------------
    # Latency
    # ------------------------------------------------------------------

    def run_latency_test(
        self,
        image: np.ndarray,
        iterations: int = 100,
    ) -> dict[str, Any]:
        """Measure per-frame inference latency.

        Args:
            image: A single image as a NumPy array.
            iterations: Number of inference passes.

        Returns:
            Dict with mean, median, p95, p99, min, max latency (ms)
            and derived FPS figures.
        """
        logger.info("Running latency test (%d iterations) ...", iterations)

        # Warm-up
        self._detector.detect(image, conf_threshold=0.25)

        latencies: list[float] = []
        for _ in range(iterations):
            start = time.perf_counter()
            self._detector.detect(image, conf_threshold=0.25)
            elapsed = time.perf_counter() - start
            latencies.append(elapsed * 1000)  # ms

        latencies.sort()
        mean_lat = statistics.mean(latencies)
        median_lat = statistics.median(latencies)
        p95_idx = int(len(latencies) * 0.95)
        p99_idx = int(len(latencies) * 0.99)

        mem_after = _get_memory_mb()

        self._latency_results = {
            "iterations": iterations,
            "mean_ms": round(mean_lat, 3),
            "median_ms": round(median_lat, 3),
            "p95_ms": round(latencies[p95_idx], 3),
            "p99_ms": round(latencies[p99_idx], 3),
            "min_ms": round(latencies[0], 3),
            "max_ms": round(latencies[-1], 3),
            "avg_fps": round(1000.0 / mean_lat, 2) if mean_lat > 0 else 0.0,
            "device": self._device,
            "memory_mb": mem_after,
        }
        logger.info("Latency test done: mean=%.2f ms, FPS=%.1f",
                     mean_lat, self._latency_results["avg_fps"])
        return self._latency_results

    # ------------------------------------------------------------------
    # Throughput
    # ------------------------------------------------------------------

    def run_throughput_test(
        self,
        images: list[np.ndarray],
        batch_size: int = 1,
    ) -> dict[str, Any]:
        """Measure end-to-end throughput across a batch of images.

        Args:
            images: List of images as NumPy arrays.
            batch_size: Number of images to process per batch
                        (currently sequential; reserved for future
                        batched inference support).

        Returns:
            Dict with total time, images processed, and images/sec.
        """
        if not images:
            self._throughput_results = {
                "total_images": 0,
                "total_time_s": 0.0,
                "images_per_sec": 0.0,
                "batch_size": batch_size,
            }
            return self._throughput_results

        logger.info("Running throughput test (%d images, batch_size=%d) ...",
                     len(images), batch_size)

        total_processed = 0
        start = time.perf_counter()

        for i in range(0, len(images), batch_size):
            batch = images[i : i + batch_size]
            for img in batch:
                self._detector.detect(img, conf_threshold=0.25)
                total_processed += 1

        elapsed = time.perf_counter() - start

        self._throughput_results = {
            "total_images": total_processed,
            "total_time_s": round(elapsed, 4),
            "images_per_sec": round(total_processed / elapsed, 2) if elapsed > 0 else 0.0,
            "batch_size": batch_size,
            "device": self._device,
        }
        logger.info("Throughput test done: %.2f img/s", self._throughput_results["images_per_sec"])
        return self._throughput_results

    # ------------------------------------------------------------------
    # Accuracy (simplified mAP-like metric)
    # ------------------------------------------------------------------

    def run_accuracy_test(
        self,
        images: list[np.ndarray],
        labels: list[list[dict[str, Any]]],
    ) -> dict[str, Any]:
        """Measure detection accuracy against ground-truth labels.

        This computes a simplified mAP-like score by checking IoU overlap
        between predicted and ground-truth boxes.

        Args:
            images: List of images.
            labels: Parallel list of ground-truth annotation lists.
                    Each annotation is a dict with ``class_name`` and
                    ``bbox`` ([x1, y1, x2, y2]).

        Returns:
            Dict with precision, recall, and a simplified mAP score.
        """
        if len(images) != len(labels):
            raise ValueError("images and labels must have the same length")

        logger.info("Running accuracy test (%d images) ...", len(images))

        total_tp = 0
        total_fp = 0
        total_fn = 0
        iou_threshold = 0.5

        for img, gt_list in zip(images, labels):
            preds = self._detector.detect(img, conf_threshold=0.25)
            matched_gt: set[int] = set()

            for pred in preds:
                best_iou = 0.0
                best_gt_idx = -1
                for gi, gt in enumerate(gt_list):
                    if gi in matched_gt:
                        continue
                    if pred["class_name"] != gt.get("class_name", ""):
                        continue
                    iou = self._compute_iou(pred["bbox"], gt["bbox"])
                    if iou > best_iou:
                        best_iou = iou
                        best_gt_idx = gi

                if best_iou >= iou_threshold and best_gt_idx >= 0:
                    total_tp += 1
                    matched_gt.add(best_gt_idx)
                else:
                    total_fp += 1

            total_fn += len(gt_list) - len(matched_gt)

        precision = total_tp / (total_tp + total_fp) if (total_tp + total_fp) > 0 else 0.0
        recall = total_tp / (total_tp + total_fn) if (total_tp + total_fn) > 0 else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0

        self._accuracy_results = {
            "total_images": len(images),
            "true_positives": total_tp,
            "false_positives": total_fp,
            "false_negatives": total_fn,
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1_score": round(f1, 4),
            "iou_threshold": iou_threshold,
        }
        logger.info("Accuracy test done: P=%.3f R=%.3f F1=%.3f",
                     precision, recall, f1)
        return self._accuracy_results

    # ------------------------------------------------------------------
    # Report
    # ------------------------------------------------------------------

    def generate_report(self) -> dict[str, Any]:
        """Return a comprehensive benchmark report combining all tests.

        Returns:
            Dict suitable for JSON serialisation containing latency,
            throughput, and accuracy sections (whichever have been run).
        """
        report: dict[str, Any] = {
            "device": self._device,
            "model": self._detector.model_name,
            "memory_mb": _get_memory_mb(),
        }
        if self._latency_results is not None:
            report["latency"] = self._latency_results
        if self._throughput_results is not None:
            report["throughput"] = self._throughput_results
        if self._accuracy_results is not None:
            report["accuracy"] = self._accuracy_results
        return report

    # ------------------------------------------------------------------
    # Model comparison
    # ------------------------------------------------------------------

    def compare_models(
        self,
        model_paths: list[str],
        image: np.ndarray,
        iterations: int = 50,
    ) -> list[dict[str, Any]]:
        """Compare performance across multiple YOLO model weights.

        Args:
            model_paths: List of paths to ``.pt`` weight files.
            image: A single test image.
            iterations: Inference iterations per model.

        Returns:
            List of result dicts, one per model, each containing
            the model path and its latency statistics.
        """
        from yolo_detector import YOLODetector

        results: list[dict[str, Any]] = []
        for path in model_paths:
            logger.info("Benchmarking model: %s", path)
            try:
                det = YOLODetector(model_path=path)
                stats = det.benchmark(image, iterations=iterations)
                results.append({"model": path, "status": "ok", **stats})
            except Exception as exc:
                logger.error("Model %s failed: %s", path, exc)
                results.append({"model": path, "status": "error", "error": str(exc)})
        return results

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _compute_iou(box_a: list[float], box_b: list[float]) -> float:
        """Compute Intersection-over-Union for two [x1,y1,x2,y2] boxes."""
        x1 = max(box_a[0], box_b[0])
        y1 = max(box_a[1], box_b[1])
        x2 = min(box_a[2], box_b[2])
        y2 = min(box_a[3], box_b[3])

        inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
        area_a = (box_a[2] - box_a[0]) * (box_a[3] - box_a[1])
        area_b = (box_b[2] - box_b[0]) * (box_b[3] - box_b[1])
        union = area_a + area_b - inter

        return inter / union if union > 0 else 0.0
