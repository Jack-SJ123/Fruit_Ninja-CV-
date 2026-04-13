/**
 * ParticleSystem.js - Module 2: Game Engine & Visual Effects
 * Author: Jack Si
 *
 * Creates particle explosion effects when fruits are sliced and
 * floating score text popups. Uses a particle pool to minimize
 * garbage collection pressure.
 */

import * as THREE from 'three';

const FRUIT_COLORS = {
  apple:      0xff4444,
  orange:     0xff8800,
  watermelon: 0x44cc44,
  banana:     0xffdd00,
  pineapple:  0xeebb33,
  grape:      0x8844ff,
  strawberry: 0xff2266,
  bomb:       0x333333,
};

const PARTICLE_POOL_SIZE = 300;
const PARTICLES_PER_EXPLOSION = { min: 15, max: 25 };
const PARTICLE_COUNT = 45; // Significant increase for impact
const PARTICLE_LIFETIME = { min: 0.5, max: 1.0 };
const GRAVITY = -15;
const DAMPING = 0.96;

class ParticleSystem {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'ParticleSystem';

    // Pool of reusable particle sprites
    this._pool = [];
    this._active = [];
    this._textSprites = [];
    this._particleTexture = this._createCircleTexture();

    this._initPool();
  }

  /**
   * Create the explosion effect at a given world position.
   * @param {{x:number, y:number, z:number}} position
   * @param {string} fruitType - One of apple, orange, watermelon, banana, bomb.
   * @param {number} [points] - Score value for the popup text.
   */
  createExplosion(position, fruitType, points) {
    const color = FRUIT_COLORS[fruitType] ?? 0xffffff;
    const count = PARTICLE_COUNT;

    for (let i = 0; i < count; i++) {
      const p = this._allocate();
      if (!p) break; // pool exhausted

      p.position.copy(position);
      
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 8;
      p.velocity.set(
        Math.cos(angle) * speed,
        Math.sin(angle) * speed + (Math.random() * 4),
        (Math.random() - 0.5) * 5
      );
      
      p.life = 1.0;
      
      if (p.isSeed) {
        p.color.setHex(0x221100); // Dark seed color
        p.size = 0.08;
      } else {
        p.color.setHex(color);
        p.size = Math.random() * 0.25 + 0.1;
      }

      p.sprite.position.copy(p.position);
      p.sprite.material.color.copy(p.color);
      p.sprite.material.opacity = 0.9;
      p.sprite.scale.setScalar(p.size);
      p.sprite.visible = true;

      p.active = true;
      this._active.push(p);
    }

    // Add a secondary "juice splash" bloom for fruit (not bomb)
    if (fruitType !== 'bomb') {
      this._createJuiceBlast(position, color);
    }

    // Score popup text
    if (points !== undefined && points !== 0) {
      this._createTextPopup(position, points);
    }
  }

  /**
   * Update all active particles. Call each frame.
   * @param {number} dt - Delta time in seconds.
   */
  update(dt) {
    // Update particles
    for (let i = this._active.length - 1; i >= 0; i--) {
      const p = this._active[i];
      p.life -= dt;

      if (p.life <= 0) {
        this._release(p);
        this._active.splice(i, 1);
        continue;
      }

      // Apply physics
      p.velocity.y += GRAVITY * dt;
      p.velocity.multiplyScalar(DAMPING);
      p.position.addScaledVector(p.velocity, dt);

      p.sprite.position.copy(p.position);

      // Fade out
      p.sprite.material.opacity = p.life;
    }

    // Update text popups
    for (let i = this._textSprites.length - 1; i >= 0; i--) {
      const ts = this._textSprites[i];
      ts.age += dt;

      if (ts.age >= ts.lifetime) {
        this.group.remove(ts.sprite);
        ts.sprite.material.map.dispose();
        ts.sprite.material.dispose();
        this._textSprites.splice(i, 1);
        continue;
      }

      // Float upward
      ts.sprite.position.y += 2.5 * dt;

      // Fade out
      const t = ts.age / ts.lifetime;
      ts.sprite.material.opacity = 1 - t;
    }
  }

  /**
   * Get the Three.js group containing all particle meshes.
   * Add this to your scene.
   * @returns {THREE.Group}
   */
  getScene() {
    return this.group;
  }

  // --- Private helpers ---

  /**
   * Build the reusable pool of sprite particles.
   * @private
   */
  _initPool() {
    this.points = [];
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      const material = new THREE.SpriteMaterial({
        map: this._particleTexture,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      this.group.add(sprite);

      this._pool.push({
        sprite,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        size: Math.random() * 0.25 + 0.1, // Varied sizes for chunks
        life: 0,
        color: new THREE.Color(),
        isSeed: Math.random() > 0.8, // Random seeds for detail
        active: false,
      });
    }
  }

  /**
   * Allocate a particle from the pool.
   * @returns {object|null}
   * @private
   */
  _allocate() {
    for (const p of this._pool) {
      if (!p.active) return p;
    }
    return null; // pool exhausted
  }

  /**
   * Release a particle back to the pool.
   * @param {object} particle
   * @private
   */
  _release(particle) {
    particle.active = false;
    particle.sprite.visible = false;
  }

  /**
   * Create a canvas-based circle texture for particles.
   * @returns {THREE.CanvasTexture}
   * @private
   */
  _createCircleTexture() {
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const half = size / 2;
    const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.3, 'rgba(255,255,255,0.8)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Create a floating score text sprite at the given position.
   * @param {{x:number, y:number, z:number}} position
   * @param {number} points
   * @private
   */
  _createTextPopup(position, points) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    const text = points > 0 ? `+${points}` : `${points}`;
    const color = points > 0 ? '#FFFF00' : '#FF4444';

    ctx.font = 'bold 40px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Outline
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.strokeText(text, 64, 32);

    // Fill
    ctx.fillStyle = color;
    ctx.fillText(text, 64, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(position.x, position.y + 0.5, position.z + 0.1);
    sprite.scale.set(1.2, 0.6, 1);

    this.group.add(sprite);

    this._textSprites.push({
      sprite,
      age: 0,
      lifetime: 1.0,
    });
  }

    // Internal effect for a "splash" burst of color.
    _createJuiceBlast(position, colorHex) {
        for (let i = 0; i < 12; i++) {
            const p = this._allocate();
            if (!p) break;
            
            p.position.set(position.x, position.y, position.z);
            p.velocity.set(
                (Math.random() - 0.5) * 12,
                (Math.random() - 0.5) * 12,
                (Math.random() - 0.5) * 4
            );
            
            p.life = 0.4 + Math.random() * 0.3;
            p.isSeed = false;
            p.color.setHex(colorHex);
            p.size = 0.15 + Math.random() * 0.25;

            p.sprite.position.copy(p.position);
            p.sprite.material.color.copy(p.color);
            p.sprite.material.opacity = 0.6;
            p.sprite.scale.setScalar(p.size);
            p.sprite.visible = true;

            p.active = true;
            this._active.push(p);
        }
    }
}

export default ParticleSystem;
