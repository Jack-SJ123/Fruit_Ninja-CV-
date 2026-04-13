/**
 * HandTracker - Wraps MediaPipe HandLandmarker for real-time hand tracking.
 * Module 1: Hand Tracking & Gesture ML
 * Author: Jason Niu
 */

// Lazy-loaded to avoid blocking the module graph if CDN is slow/unavailable
let HandLandmarker, FilesetResolver;
async function loadMediaPipe() {
  if (HandLandmarker) return;
  const module = await import('../../vendor/mediapipe/vision_bundle.mjs');
  HandLandmarker = module.HandLandmarker;
  FilesetResolver = module.FilesetResolver;
}

const PERFORMANCE_TIERS = {
  low:    { fps: 30, interval: 33, maxHands: 1 },
  medium: { fps: 45, interval: 22, maxHands: 2 },
  high:   { fps: 60, interval: 16, maxHands: 2 }
};

const SMOOTHING_WINDOW = 3;

class HandTracker {
  constructor() {
    this._handLandmarker = null;
    this._videoElement = null;
    this._running = false;
    this._animFrameId = null;
    this._lastDetectionTime = 0;
    this._lastVideoTime = -1;
    this._tier = 'medium';
    this._latestResults = null;

    // Smoothing buffers: array of past N frame results per hand index
    this._smoothingBuffers = [[], []];

    // Public callback
    this.onResults = null;
  }

  _autoDetectTier() {
    const cores = navigator.hardwareConcurrency || 2;
    const mem = navigator.deviceMemory || 4;
    if (cores >= 8 && mem >= 8) return 'high';
    if (cores >= 4 && mem >= 4) return 'medium';
    return 'low';
  }

  /** @param {HTMLVideoElement} videoElement */
  async init(videoElement) {
    this._videoElement = videoElement;
    this._tier = this._autoDetectTier();

    await loadMediaPipe();
    const wasmRoot = new URL('../../vendor/mediapipe/wasm/', import.meta.url).href;
    const modelAssetPath = new URL('../../vendor/mediapipe/hand_landmarker.task', import.meta.url).href;
    const vision = await FilesetResolver.forVisionTasks(
      wasmRoot
    );

    const tierCfg = PERFORMANCE_TIERS[this._tier];

    const baseOptions = {
      modelAssetPath,
      delegate: 'GPU'
    };
    const commonOptions = {
      runningMode: 'VIDEO',
      numHands: tierCfg.maxHands,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5
    };

    try {
      this._handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions,
        ...commonOptions
      });
    } catch (error) {
      console.warn('[HandTracker] GPU delegate unavailable, falling back to CPU:', error?.message || error);
      this._handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          ...baseOptions,
          delegate: 'CPU'
        },
        ...commonOptions
      });
    }

    console.log(`[HandTracker] Initialized, tier=${this._tier}, maxHands=${tierCfg.maxHands}`);
  }

  start() {
    if (!this._handLandmarker || !this._videoElement) {
      throw new Error('HandTracker not initialized. Call init() first.');
    }
    this._running = true;
    this._tick();
  }

  stop() {
    this._running = false;
    if (this._animFrameId !== null) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }
    this._lastVideoTime = -1;
  }

  getLatestResults() {
    return this._latestResults;
  }

  async setPerformanceTier(tier) {
    if (!PERFORMANCE_TIERS[tier]) {
      throw new Error(`Unknown tier "${tier}". Use low, medium, or high.`);
    }
    this._tier = tier;
    if (this._handLandmarker) {
      await this._handLandmarker.setOptions({
        numHands: PERFORMANCE_TIERS[tier].maxHands
      });
    }
  }

  // ---- internal ----

  _tick() {
    if (!this._running) return;

    const now = performance.now();
    const interval = PERFORMANCE_TIERS[this._tier].interval;

    if (now - this._lastDetectionTime >= interval) {
      if (this._videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        try {
          if (this._videoElement.currentTime !== this._lastVideoTime) {
            const result = this._handLandmarker.detectForVideo(this._videoElement, now);
            this._lastVideoTime = this._videoElement.currentTime;
            this._handleResults(result, now);
          }
        } catch (e) {
          console.warn('[HandTracker] detectForVideo failed:', e?.message || e);
        }
        this._lastDetectionTime = now;
      }
    }

    this._animFrameId = requestAnimationFrame(() => this._tick());
  }

  _handleResults(result, timestamp = performance.now()) {
    const processed = this._processLandmarks(result);

    this._latestResults = {
      landmarks: processed.landmarks,
      worldLandmarks: processed.worldLandmarks,
      handedness: result.handedness || [],
      timestamp
    };

    if (typeof this.onResults === 'function') {
      this.onResults(this._latestResults);
    }
  }

  /**
   * Process landmarks: apply smoothing.
   * NOTE: We do NOT mirror x here. The CSS already mirrors the video via scaleX(-1).
   * MediaPipe landmarks are in video-space (0-1), and the video is displayed mirrored.
   * So landmark x=0.3 visually appears at 0.3 on screen (because the video is already flipped).
   */
  _processLandmarks(result) {
    const activeHands = new Set();
    const landmarks = (result.landmarks || []).map((hand, hi) => {
      const handedness = result.handedness?.[hi]?.[0]?.categoryName || 'Right';
      const handIndex = handedness === 'Left' ? 0 : 1;
      activeHands.add(handIndex);
      return this._smooth(hand, handIndex);
    });

    for (let i = 0; i < this._smoothingBuffers.length; i++) {
      if (!activeHands.has(i)) {
        this._smoothingBuffers[i] = [];
      }
    }

    const worldLandmarks = result.worldLandmarks || [];

    return { landmarks, worldLandmarks };
  }

  /**
   * 3-frame position smoothing for a single hand.
   */
  _smooth(handLandmarks, handIndex) {
    const buf = this._smoothingBuffers[handIndex];
    buf.push(handLandmarks);
    if (buf.length > SMOOTHING_WINDOW) buf.shift();

    if (buf.length === 1) return handLandmarks;

    const count = buf.length;
    return handLandmarks.map((_, li) => {
      let sx = 0, sy = 0, sz = 0;
      for (let f = 0; f < count; f++) {
        sx += buf[f][li].x;
        sy += buf[f][li].y;
        sz += buf[f][li].z;
      }
      return {
        x: sx / count,
        y: sy / count,
        z: sz / count
      };
    });
  }
}

export default HandTracker;
