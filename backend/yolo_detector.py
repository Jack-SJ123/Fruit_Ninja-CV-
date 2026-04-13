"""
YOLO-based fruit detector using Ultralytics YOLOv8.

Provides detection, base64 decoding, fruit-class filtering,
and single-image benchmarking utilities.

Author: Romilson Lemes Cordeiro
Module: 4 - Python Backend & YOLO Integration
"""

from __future__ import annotations

import base64
import io
import logging
import time
from typing import Any

import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

# COCO class IDs that correspond to fruits
_COCO_FRUIT_IDS: dict[int, str] = {
    46: "banana",
    47: "apple",
    49: "orange",
}


class YOLODetector:
    """Wraps a YOLOv8 model for fruit detection."""

    def __init__(self, model_path: str | None = None) -> None:
        """Load a YOLO model.

        Args:
            model_path: Path to a custom ``.pt`` weights file.
                        If *None*, the pretrained ``yolov8n.pt`` is used.
        """
        try:
            from ultralytics import YOLO
        except ImportError as exc:
            raise RuntimeError(
                "ultralytics is not installed. Run: pip install ultralytics"
            ) from exc

        self._model_path = model_path or "yolov8n.pt"
        try:
            self._model = YOLO(self._model_path)
            logger.info("Loaded YOLO model: %s", self._model_path)
        except Exception as exc:
            logger.error("Failed to load model '%s': %s", self._model_path, exc)
            raise RuntimeError(f"Could not load YOLO model: {exc}") from exc

        # Build the fruit-class mapping.  For a custom model we treat
        # *all* classes as fruit classes; for the default COCO model we
        # restrict to known fruit IDs.
        self._custom_model = model_path is not None
        if self._custom_model:
            self._fruit_ids: dict[int, str] = dict(self._model.names)
        else:
            self._fruit_ids = dict(_COCO_FRUIT_IDS)

    # ------------------------------------------------------------------
    # Public properties
    # ------------------------------------------------------------------

    @property
    def model_name(self) -> str:
        """Human-readable model identifier."""
        return self._model_path

    # ------------------------------------------------------------------
    # Detection
    # ------------------------------------------------------------------

    def detect(
        self,
        image: np.ndarray | Image.Image,
        conf_threshold: float = 0.5,
    ) -> list[dict[str, Any]]:
        """Run detection on an image and return fruit detections.

        Args:
            image: Input image as a NumPy array (BGR or RGB) or PIL Image.
            conf_threshold: Minimum confidence score to keep a detection.

        Returns:
            A list of detection dicts, each containing:
            ``class_name``, ``confidence``, ``bbox`` ([x1, y1, x2, y2]),
            and ``class_id``.
        """
        if isinstance(image, Image.Image):
            image = np.array(image.convert("RGB"))

        results = self._model(image, conf=conf_threshold, verbose=False)

        detections: list[dict[str, Any]] = []
        for result in results:
            boxes = result.boxes
            if boxes is None:
                continue
            for box in boxes:
                class_id = int(box.cls[0])
                if class_id not in self._fruit_ids:
                    continue
                confidence = float(box.conf[0])
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                detections.append(
                    {
                        "class_name": self._fruit_ids[class_id],
                        "confidence": round(confidence, 4),
                        "bbox": [round(v, 2) for v in (x1, y1, x2, y2)],
                        "class_id": class_id,
                    }
                )

        return detections

    def detect_base64(
        self,
        base64_str: str,
        conf_threshold: float = 0.5,
    ) -> list[dict[str, Any]]:
        """Decode a base64-encoded image string and run detection.

        Args:
            base64_str: Base64-encoded JPEG or PNG image data.
                        An optional ``data:image/...;base64,`` prefix is
                        stripped automatically.
            conf_threshold: Minimum confidence score.

        Returns:
            Same format as :meth:`detect`.
        """
        # Strip optional data-URI prefix
        if "," in base64_str:
            base64_str = base64_str.split(",", 1)[1]

        raw_bytes = base64.b64decode(base64_str)
        pil_image = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
        return self.detect(pil_image, conf_threshold=conf_threshold)

    # ------------------------------------------------------------------
    # Utilities
    # ------------------------------------------------------------------

    def get_fruit_classes(self) -> dict[int, str]:
        """Return the mapping of fruit-related class IDs to names.

        Returns:
            Dict mapping COCO (or custom) class IDs to human-readable
            fruit names.
        """
        return dict(self._fruit_ids)

    # ------------------------------------------------------------------
    # Benchmarking
    # ------------------------------------------------------------------

    def benchmark(
        self,
        image: np.ndarray | Image.Image,
        iterations: int = 100,
    ) -> dict[str, float]:
        """Run inference *iterations* times and return timing statistics.

        Args:
            image: Input image.
            iterations: Number of inference passes.

        Returns:
            Dict with keys ``avg_fps``, ``min_fps``, ``max_fps``,
            ``avg_latency_ms``, ``min_latency_ms``, ``max_latency_ms``.
        """
        if isinstance(image, Image.Image):
            image = np.array(image.convert("RGB"))

        # Warm-up run
        self._model(image, verbose=False)

        latencies: list[float] = []
        for _ in range(iterations):
            start = time.perf_counter()
            self._model(image, verbose=False)
            elapsed = time.perf_counter() - start
            latencies.append(elapsed)

        latencies_ms = [t * 1000 for t in latencies]
        avg_lat = sum(latencies_ms) / len(latencies_ms)
        min_lat = min(latencies_ms)
        max_lat = max(latencies_ms)

        return {
            "avg_fps": round(1000.0 / avg_lat, 2) if avg_lat > 0 else 0.0,
            "min_fps": round(1000.0 / max_lat, 2) if max_lat > 0 else 0.0,
            "max_fps": round(1000.0 / min_lat, 2) if min_lat > 0 else 0.0,
            "avg_latency_ms": round(avg_lat, 3),
            "min_latency_ms": round(min_lat, 3),
            "max_latency_ms": round(max_lat, 3),
        }
