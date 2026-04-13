"""
FastAPI backend for Fruit Ninja CV game.

Provides REST API endpoints for YOLO-based fruit detection
and performance benchmarking.

Author: Romilson Lemes Cordeiro
Module: 4 - Python Backend & YOLO Integration
"""

from __future__ import annotations

import base64
import logging
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from yolo_detector import YOLODetector
from benchmark import Benchmark

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Fruit Ninja CV - Detection API",
    description="YOLO-based fruit detection backend for the Fruit Ninja CV game.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Lazy-loaded globals
# ---------------------------------------------------------------------------
detector: YOLODetector | None = None
benchmarker: Benchmark | None = None


def get_detector() -> YOLODetector:
    """Return the singleton YOLODetector, creating it on first call."""
    global detector
    if detector is None:
        try:
            detector = YOLODetector()
            logger.info("YOLODetector initialised successfully.")
        except Exception as exc:
            logger.error("Failed to initialise YOLODetector: %s", exc)
            raise HTTPException(status_code=500, detail=f"Model loading error: {exc}")
    return detector


def get_benchmarker() -> Benchmark:
    """Return the singleton Benchmark, creating it on first call."""
    global benchmarker
    if benchmarker is None:
        benchmarker = Benchmark(get_detector())
    return benchmarker


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------
class DetectRequest(BaseModel):
    """Payload for the /api/detect endpoint."""
    image: str = Field(..., description="Base64-encoded image (JPEG or PNG)")
    conf_threshold: float = Field(0.5, ge=0.0, le=1.0, description="Confidence threshold")


class Detection(BaseModel):
    """Single detection result."""
    class_name: str
    confidence: float
    bbox: list[float]
    class_id: int


class DetectResponse(BaseModel):
    """Response from the /api/detect endpoint."""
    detections: list[Detection]
    count: int


class BenchmarkRequest(BaseModel):
    """Payload for the /api/benchmark endpoint."""
    images: list[str] = Field(..., description="List of base64-encoded images")
    iterations: int = Field(50, ge=1, le=1000, description="Inference iterations per image")


class BenchmarkResponse(BaseModel):
    """Response from the /api/benchmark endpoint."""
    report: dict[str, Any]


class ModelInfoResponse(BaseModel):
    """Response from the /api/model-info endpoint."""
    model_name: str
    input_size: int
    classes: dict[int, str]
    fps_benchmark: float | None


class HealthResponse(BaseModel):
    """Response from the /api/health endpoint."""
    status: str
    model_loaded: bool


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Health check endpoint."""
    return HealthResponse(
        status="ok",
        model_loaded=detector is not None,
    )


@app.get("/api/model-info", response_model=ModelInfoResponse)
async def model_info() -> ModelInfoResponse:
    """Return metadata about the loaded YOLO model."""
    try:
        det = get_detector()
        fruit_classes = det.get_fruit_classes()

        # Quick single-image benchmark for FPS estimate
        fps: float | None = None
        try:
            import numpy as np
            dummy = np.zeros((640, 640, 3), dtype=np.uint8)
            stats = det.benchmark(dummy, iterations=20)
            fps = stats.get("avg_fps")
        except Exception:
            pass

        return ModelInfoResponse(
            model_name=det.model_name,
            input_size=640,
            classes=fruit_classes,
            fps_benchmark=fps,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("model-info error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/detect", response_model=DetectResponse)
async def detect_fruits(request: DetectRequest) -> DetectResponse:
    """Accept a base64 image, run YOLO fruit detection, return bounding boxes."""
    try:
        det = get_detector()
        results = det.detect_base64(request.image, conf_threshold=request.conf_threshold)
        detections = [Detection(**r) for r in results]
        return DetectResponse(detections=detections, count=len(detections))
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Detection error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/benchmark", response_model=BenchmarkResponse)
async def run_benchmark(request: BenchmarkRequest) -> BenchmarkResponse:
    """Run a performance benchmark on a batch of base64 images."""
    try:
        import numpy as np
        from PIL import Image
        import io

        bench = get_benchmarker()

        # Decode all images
        images: list[np.ndarray] = []
        for b64 in request.images:
            raw = base64.b64decode(b64)
            pil_img = Image.open(io.BytesIO(raw)).convert("RGB")
            images.append(np.array(pil_img))

        if not images:
            raise HTTPException(status_code=400, detail="No valid images provided.")

        # Run latency test on the first image
        bench.run_latency_test(images[0], iterations=request.iterations)

        # Run throughput test across all images
        bench.run_throughput_test(images)

        report = bench.generate_report()
        return BenchmarkResponse(report=report)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Benchmark error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
