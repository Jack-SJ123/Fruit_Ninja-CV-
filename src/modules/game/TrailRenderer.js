/**
 * TrailRenderer.js - Module 2: Game Engine & Visual Effects
 * Author: Jack Si
 *
 * Renders fluorescent neon trails on a 2D canvas overlay that follow
 * the player's hands. Left hand = cyan, right hand = green.
 * Trails fade out after 150ms and use layered glow rendering.
 */

const TRAIL_RETENTION_MS = 300; // longer retention for better visibility

const FINGER_COLORS = {
  '4':  'rgba(255, 50, 50,',   // Thumb - Red
  '8':  'rgba(0, 255, 255,',   // Index - Cyan
  '12': 'rgba(0, 255, 0,',     // Middle - Green
  '16': 'rgba(255, 255, 0,',   // Ring - Yellow
  '20': 'rgba(255, 0, 255,',   // Pinky - Magenta
};

// Glow layers: [lineWidth, alphaMultiplier, colorIndex (0=Primary, 1=WhiteCore)]
const GLOW_LAYERS = [
  [35, 0.15, 0], // Wide outer halo
  [22, 0.3, 0],  // Inner glow
  [12, 0.6, 0],  // Sharp neon
  [4,  1.0, 1],  // White-hot core
];

class TrailRenderer {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    // Map key: "handIndex_landmarkIndex", value: array of points
    this.trails = new Map();
    this._resizeObserver = null;
  }

  /**
   * Initialize with a canvas element.
   * @param {HTMLCanvasElement} canvas
   */
  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // Match canvas internal size to its CSS display size
    this._syncSize();

    this._resizeObserver = new ResizeObserver(() => this._syncSize());
    this._resizeObserver.observe(canvas);
  }

  /**
   * Add a trail point for a hand.
   * @param {number} handIndex - 0 for left hand, 1 for right hand.
   * @param {number} landmarkIndex - MediaPipe landmark index (e.g., 8 for index finger).
   * @param {number} x - X position in pixels relative to the canvas.
   * @param {number} y - Y position in pixels relative to the canvas.
   */
  addPoint(handIndex, landmarkIndex, x, y) {
    const key = `${handIndex}_${landmarkIndex}`;
    if (!this.trails.has(key)) {
      this.trails.set(key, []);
    }
    this.trails.get(key).push({ x, y, timestamp: performance.now() });
  }

  /**
   * Render all active trails onto the canvas.
   * Should be called every animation frame.
   */
  render() {
    const ctx = this.ctx;
    if (!ctx) return;

    const now = performance.now();

    // Clear the overlay
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (const [key, rawPoints] of this.trails.entries()) {
      const [handIndexStr] = key.split('_');
      const h = parseInt(handIndexStr, 10);

      // Prune expired points
      const points = rawPoints.filter((p) => now - p.timestamp <= TRAIL_RETENTION_MS);
      this.trails.set(key, points);

      if (points.length < 2) continue;

      // Draw glow layers from widest/faintest to narrowest/brightest
      for (const [lineWidth, opacityMul, colorType] of GLOW_LAYERS) {
        // We draw individual segments to support tapering thickness
        for (let i = 0; i < points.length - 1; i++) {
          const p1 = points[i];
          const p2 = points[i + 1];
          
          // Taper: points[length-1] is the hand (newest), i=0 is the tail (oldest)
          const taper = (i + 1) / points.length; 
          const segmentAge = (now - p2.timestamp) / TRAIL_RETENTION_MS;
          const fade = Math.pow(Math.max(0, 1 - segmentAge), 1.2);
          
          ctx.beginPath();
          ctx.lineWidth = lineWidth * taper * (0.3 + 0.7 * fade);
          // Non-index fingers are slightly thinner
          if (!key.endsWith('_8')) ctx.lineWidth *= 0.6;

          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          
          const alpha = (opacityMul * fade).toFixed(3);
          if (colorType === 1) {
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
          } else {
            const [, tipIdx] = key.split('_');
            const baseColor = FINGER_COLORS[tipIdx] || 'rgba(0, 255, 255,';
            ctx.strokeStyle = baseColor + alpha + ')';
          }
          ctx.stroke();
        }
      }
    }
  }

  /**
   * Clear all trail data.
   */
  clear() {
    this.trails.clear();
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  /**
   * Clean up resources.
   */
  dispose() {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    this.clear();
    this.ctx = null;
    this.canvas = null;
  }

  /**
   * Sync canvas resolution to its CSS display size.
   * @private
   */
  _syncSize() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    if (this.canvas.width !== rect.width || this.canvas.height !== rect.height) {
      this.canvas.width = rect.width;
      this.canvas.height = rect.height;
    }
  }
}

export default TrailRenderer;
