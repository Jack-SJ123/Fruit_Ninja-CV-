/**
 * FeatureExtractor - Builds the 126-dim feature vector from MediaPipe landmarks.
 * Module 1: Hand Tracking & Gesture ML
 * Author: Jason Niu
 *
 * Feature layout (126 total):
 *   [0..2]   wrist absolute (x, y, z)
 *   [3..62]  landmarks 1-20 relative to wrist (20 * 3)
 *   [63..65] wrist velocity (dx, dy, dz)
 *   [66..125] landmarks 1-20 velocity (20 * 3)
 */

const NUM_LANDMARKS = 21;
const FEATURE_DIM = 126;

class FeatureExtractor {
  constructor() {
    this._lastVelocityMagnitude = [0, 0];
  }

  /**
   * Extract the 126-dimensional feature vector.
   * @param {Array<{x:number,y:number,z:number}>} landmarks - 21 hand landmarks
   * @param {Array<{x:number,y:number,z:number}>|null} previousLandmarks - previous frame
   * @param {number} dt - time delta in seconds between frames
   * @param {number} handIndex - 0 for left hand, 1 for right hand
   * @returns {Float32Array} 126-element feature vector normalized to [-1, 1]
   */
  extract(landmarks, previousLandmarks, dt, handIndex = 0) {
    const features = new Float32Array(FEATURE_DIM);

    // Guard: if landmarks are missing or malformed, return zeros
    if (!landmarks || landmarks.length < NUM_LANDMARKS) {
      this._lastVelocityMagnitude[handIndex] = 0;
      return features;
    }

    const wrist = landmarks[0];

    // ---- Position features (indices 0..62) ----
    // Wrist absolute position
    features[0] = wrist.x;
    features[1] = wrist.y;
    features[2] = wrist.z;

    // Relative positions for landmarks 1-20
    for (let i = 1; i < NUM_LANDMARKS; i++) {
      const base = 3 + (i - 1) * 3;
      features[base]     = landmarks[i].x - wrist.x;
      features[base + 1] = landmarks[i].y - wrist.y;
      features[base + 2] = landmarks[i].z - wrist.z;
    }

    // ---- Velocity features (indices 63..125) ----
    const safeDt = dt > 0 ? dt : 1 / 30; // fallback 30fps
    let velocitySumSq = 0;

    if (previousLandmarks && previousLandmarks.length >= NUM_LANDMARKS) {
      for (let i = 0; i < NUM_LANDMARKS; i++) {
        const base = 63 + i * 3;
        const dx = (landmarks[i].x - previousLandmarks[i].x) / safeDt;
        const dy = (landmarks[i].y - previousLandmarks[i].y) / safeDt;
        const dz = (landmarks[i].z - previousLandmarks[i].z) / safeDt;
        features[base]     = dx;
        features[base + 1] = dy;
        features[base + 2] = dz;
        velocitySumSq += dx * dx + dy * dy + dz * dz;
      }
    }
    // else velocity features stay zero

    this._lastVelocityMagnitude[handIndex] = Math.sqrt(velocitySumSq / NUM_LANDMARKS);

    // ---- Normalize to [-1, 1] ----
    this._normalize(features);

    return features;
  }

  /**
   * Get the overall hand speed (RMS of per-landmark velocities).
   * @returns {number}
   */
  getHandVelocity(handIndex = 0) {
    return this._lastVelocityMagnitude[handIndex] || 0;
  }

  // ---- internal ----

  /**
   * In-place normalization to [-1, 1] using the max absolute value.
   * Position and velocity halves are normalized independently so that
   * slow movements don't wash out position signal and vice versa.
   */
  _normalize(features) {
    // Normalize position half [0..62]
    this._normalizeRange(features, 0, 63);
    // Normalize velocity half [63..125]
    this._normalizeRange(features, 63, FEATURE_DIM);
  }

  _normalizeRange(features, start, end) {
    let maxAbs = 0;
    for (let i = start; i < end; i++) {
      const a = Math.abs(features[i]);
      if (a > maxAbs) maxAbs = a;
    }
    if (maxAbs > 0) {
      for (let i = start; i < end; i++) {
        features[i] /= maxAbs;
      }
    }
  }
}

export default FeatureExtractor;
