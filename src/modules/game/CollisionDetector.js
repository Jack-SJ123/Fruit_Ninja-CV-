/**
 * CollisionDetector.js - Module 2: Game Engine & Visual Effects
 * Author: Jack Si
 *
 * Detects collisions between the hand position trail and fruit spheres.
 * Supports ray-based line-segment-to-sphere intersection with a
 * distance-based fallback for robustness.
 */

import * as THREE from 'three';

const DEFAULT_TRAIL_LENGTH = 10;
// Extra radius added to fruit hitbox for a generous gameplay feel
const COLLISION_PADDING = 0.15;

class CollisionDetector {
  constructor() {
    this.camera = null;
    this.trailLength = DEFAULT_TRAIL_LENGTH;
    // Reusable Three.js math objects to avoid per-frame allocations
    this._vec3A = new THREE.Vector3();
    this._vec3B = new THREE.Vector3();
    this._raycaster = new THREE.Raycaster();
  }

  /**
   * Store a reference to the Three.js camera used for coordinate conversion.
   * @param {THREE.Camera} camera
   */
  setCamera(camera) {
    this.camera = camera;
  }

  /**
   * Convert normalized screen coordinates (0-1 range) to a 3D world position
   * on the z=0 plane.
   * @param {number} screenX - Normalized x (0 = left, 1 = right).
   * @param {number} screenY - Normalized y (0 = top, 1 = bottom).
   * @param {THREE.Camera} [camera] - Optional override camera.
   * @returns {THREE.Vector3} World position on the z=0 plane.
   */
  screenToWorld(screenX, screenY, camera) {
    const cam = camera || this.camera;
    if (!cam) {
      return new THREE.Vector3(screenX * 10 - 5, -(screenY * 12 - 6), 0);
    }

    // Map from [0,1] to NDC [-1, 1]
    const ndcX = screenX * 2 - 1;
    const ndcY = -(screenY * 2 - 1); // flip y: screen top is +1 in NDC

    this._raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), cam);
    const ray = this._raycaster.ray;

    // Intersect with z=0 plane
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const target = new THREE.Vector3();
    ray.intersectPlane(plane, target);

    return target || new THREE.Vector3(ndcX * 5, ndcY * 5, 0);
  }

  /**
   * Check for collisions between a hand position trail and a list of fruits.
   *
   * @param {Array<{x:number, y:number}>} handPositions
   *   Recent hand positions in normalized screen coords (0-1).
   *   Most recent position last.
   * @param {Array<{id:number, position:{x,y,z}, radius:number}>} fruits
   *   Active fruit data from FruitManager.getFruits().
   * @returns {number[]} Array of collided fruit IDs.
   */
  checkCollisions(handPositions, fruits) {
    if (!handPositions || handPositions.length === 0 || !fruits || fruits.length === 0) {
      return [];
    }

    // Trim trail to configured length
    const trail = handPositions.slice(-this.trailLength);

    // Convert screen positions to world coordinates
    const worldTrail = trail.map((p) => this.screenToWorld(p.x, p.y));

    const collided = [];

    for (const fruit of fruits) {
      const center = this._vec3A.set(fruit.position.x, fruit.position.y, fruit.position.z);
      const hitRadius = fruit.radius + COLLISION_PADDING;
      let hit = false;

      // Ray-based: check each consecutive segment of the trail
      for (let i = 0; i < worldTrail.length - 1; i++) {
        if (this._segmentIntersectsSphere(worldTrail[i], worldTrail[i + 1], center, hitRadius)) {
          hit = true;
          break;
        }
      }

      // Distance-based fallback: check the most recent point
      if (!hit && worldTrail.length > 0) {
        const latest = worldTrail[worldTrail.length - 1];
        const dist = latest.distanceTo(center);
        if (dist < hitRadius * 1.2) {
          hit = true;
        }
      }

      if (hit) {
        collided.push(fruit.id);
      }
    }

    return collided;
  }

  /**
   * Test whether a line segment (A->B) intersects a sphere.
   * Uses closest-point-on-segment approach.
   *
   * @param {THREE.Vector3} a - Segment start.
   * @param {THREE.Vector3} b - Segment end.
   * @param {THREE.Vector3} center - Sphere center.
   * @param {number} radius - Sphere radius.
   * @returns {boolean}
   * @private
   */
  _segmentIntersectsSphere(a, b, center, radius) {
    const ab = this._vec3B.copy(b).sub(a);
    const ac = new THREE.Vector3().copy(center).sub(a);

    const abLenSq = ab.lengthSq();
    if (abLenSq === 0) {
      // Degenerate segment: just a point
      return ac.length() < radius;
    }

    // Project center onto the segment, clamped to [0,1]
    let t = ac.dot(ab) / abLenSq;
    t = Math.max(0, Math.min(1, t));

    // Closest point on segment to sphere center
    const closest = new THREE.Vector3().copy(a).addScaledVector(ab, t);
    const distSq = closest.distanceToSquared(center);

    return distSq <= radius * radius;
  }

  /**
   * Set the maximum trail length used for collision checks.
   * @param {number} length
   */
  setTrailLength(length) {
    this.trailLength = length;
  }
}

export default CollisionDetector;
