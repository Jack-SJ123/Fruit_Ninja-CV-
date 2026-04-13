/**
 * FruitManager.js - Module 2: Game Engine & Visual Effects
 * Author: Jack Si
 *
 * Manages fruit spawning, physics simulation, and lifecycle.
 * Fruits follow parabolic trajectories and difficulty scales over time.
 */

import * as THREE from 'three';

const FRUIT_TYPES = {
  apple: {
    color: 0xff4444,
    radius: 0.35,
    points: 10,
    geometry: (r) => new THREE.SphereGeometry(r, 24, 24),
    textureType: 'apple'
  },
  orange: {
    color: 0xff8800,
    radius: 0.35,
    points: 10,
    geometry: (r) => new THREE.SphereGeometry(r, 24, 24),
    textureType: 'citrus'
  },
  watermelon: {
    color: 0x44cc44,
    radius: 0.5,
    points: 15,
    geometry: (r) => new THREE.SphereGeometry(r, 24, 24),
    textureType: 'striped'
  },
  banana: {
    color: 0xffdd00,
    radius: 0.3,
    points: 10,
    geometry: (r) => new THREE.CylinderGeometry(r * 0.5, r * 0.6, r * 2.5, 12),
    textureType: 'speckled'
  },
  pineapple: {
    color: 0xeebb33,
    radius: 0.45,
    points: 20,
    geometry: (r) => new THREE.CylinderGeometry(r * 0.8, r * 0.9, r * 2.2, 12),
    textureType: 'pineapple',
    hasCrown: true
  },
  grape: {
    color: 0x8844ff,
    radius: 0.42,
    points: 15,
    geometry: (r) => new THREE.SphereGeometry(r, 16, 16),
    textureType: 'smooth'
  },
  strawberry: {
    color: 0xff2266,
    radius: 0.45,
    points: 20,
    geometry: (r) => new THREE.SphereGeometry(r, 16, 16), // Profile handled in loop
    textureType: 'speckled'
  },
  bomb: {
    color: 0x333333,
    radius: 0.35,
    points: -20,
    geometry: (r) => new THREE.SphereGeometry(r, 24, 24),
    textureType: 'metal'
  },
};

const FRUIT_SCALE = 1.8; // Further reduced for optimal 'Concept' proportions

const FRUIT_NAMES = ['apple', 'orange', 'watermelon', 'banana', 'pineapple', 'grape', 'strawberry'];
const GRAVITY = -2.2; // Ultra-slow, near-zero gravity feel

let nextId = 0;

class FruitManager {
  /**
   * @param {THREE.Scene} scene - The Three.js scene to add fruit meshes to.
   */
  constructor(scene) {
    this.scene = scene;
    this.fruits = new Map();
    this.spawnTimer = 0;
    this.spawnInterval = 0.5; // Quadrupled spawn rate (from 2.0 to 0.5)
    this.minSpawnInterval = 0.15;
    this.maxFruits = 32; // Massive increase for chaos
    this.bombChance = 0.1;
    this.difficultyLevel = 1;
    this.worldBounds = { xMin: -5, xMax: 5, yMin: -6, yMax: 8 };
  }

  /**
   * Update all fruit positions and handle lifecycle.
   * @param {number} dt - Delta time in seconds.
   */
  update(dt) {
    // Spawn logic
    this.spawnTimer += dt;
    if (this.spawnTimer >= this.spawnInterval && this.fruits.size < this.maxFruits) {
      this.spawnFruit();
      this.spawnTimer = 0;
    }

    const toRemove = [];

    for (const [id, fruit] of this.fruits) {
      const { position, velocity, rotation, rotationSpeed, isSliced, half1, half2 } = fruit;

      if (!isSliced) {
          velocity.y += GRAVITY * dt;
          position.x += velocity.x * dt;
          position.y += velocity.y * dt;
          position.z += velocity.z * dt;

          rotation.x += rotationSpeed.x * dt;
          rotation.y += rotationSpeed.y * dt;
          rotation.z += rotationSpeed.z * dt;

          fruit.mesh.position.set(position.x, position.y, position.z);
          fruit.mesh.rotation.set(rotation.x, rotation.y, rotation.z);
      } else {
          // Tumble halves apart on slice
          half1.position.y += 3.5 * dt;
          half1.position.x += 2 * dt;
          half1.rotation.z += 4 * dt;
          
          half2.position.y -= 3.5 * dt;
          half2.position.x -= 2 * dt;
          half2.rotation.z -= 4 * dt;

          position.y += velocity.y * 0.4 * dt;
          fruit.mesh.position.y = position.y;
      }

      if (position.y < this.worldBounds.yMin) {
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      this.removeFruit(id);
    }
  }

  /**
   * Spawn a single fruit at a random x position along the bottom.
   * @returns {object|null} The spawned fruit data, or null if at capacity.
   */
  spawnFruit() {
    if (this.fruits.size >= this.maxFruits) return null;

    const isBomb = Math.random() < this.bombChance;
    const typeName = isBomb
      ? 'bomb'
      : FRUIT_NAMES[Math.floor(Math.random() * FRUIT_NAMES.length)];

    const config = FRUIT_TYPES[typeName];
    const radius = typeName === 'bomb' ? config.radius : config.radius * FRUIT_SCALE;
    const id = nextId++;

    // Random horizontal spawn position
    const spawnX = this.worldBounds.xMin + Math.random() * (this.worldBounds.xMax - this.worldBounds.xMin);
    const spawnY = this.worldBounds.yMin;

    // Launch velocity: ultra-slow floating launch
    const vx = (0 - spawnX) * (0.08 + Math.random() * 0.1) + (Math.random() - 0.5) * 1.5;
    const vy = 7.5 + Math.random() * 3.5; // Very low velocity for smooth floating
    const vz = (Math.random() - 0.5) * 1.5;

    const fruitGroup = new THREE.Group();
    
    // Main Body (Hidden when sliced)
    const bodyGroup = new THREE.Group();
    fruitGroup.add(bodyGroup);
    
    const bodyGeometry = config.geometry(radius);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: config.color,
      map: this.generateFruitTexture(config.textureType, config.color),
      roughness: 0.4,
      metalness: config.textureType === 'metal' ? 0.8 : 0.1,
      emissive: config.color,
      emissiveIntensity: 0.6, // Boosted for visibility without Bloom
    });
    const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
    bodyGroup.add(bodyMesh);


    // Special structural logic per fruit type (Added to bodyGroup)
    switch (typeName) {
      case 'apple':
          const stem = new THREE.Mesh(
              new THREE.CylinderGeometry(radius * 0.05, radius * 0.05, radius * 0.3, 8),
              new THREE.MeshStandardMaterial({ color: 0x5b341c })
          );
          stem.position.set(0, radius, 0);
          bodyGroup.add(stem);
          // Add a small leaf
          const leaf = new THREE.Mesh(
              new THREE.SphereGeometry(radius * 0.15, 8, 8),
              new THREE.MeshStandardMaterial({ color: 0x228822 })
          );
          leaf.scale.set(1.5, 0.2, 0.8);
          leaf.position.set(radius * 0.1, radius * 1.1, 0);
          leaf.rotation.z = 0.5;
          bodyGroup.add(leaf);
          break;

      case 'watermelon':
          // Make it oval
          bodyMesh.scale.set(1.2, 0.9, 1.2);
          break;
          
      case 'pineapple':
          // Multi-layer pineapple crown
          for (let i = 0; i < 8; i++) {
              const pLeaf = new THREE.Mesh(
                  new THREE.ConeGeometry(radius * 0.15, radius * 0.8, 8),
                  new THREE.MeshStandardMaterial({ color: 0x228822 })
              );
              pLeaf.position.set(Math.cos(i) * radius * 0.3, radius * 1.1, Math.sin(i) * radius * 0.3);
              pLeaf.rotation.x = 0.3;
              pLeaf.rotation.y = i;
              bodyGroup.add(pLeaf);
          }
          break;

      case 'strawberry':
          bodyMesh.visible = false;
          const sPoints = [];
          for (let j = 0; j <= 10; j++) {
              const t = j / 10;
              const x = radius * (1 - t) * Math.sin(t * Math.PI * 0.8);
              const y = radius * (t - 0.5) * 2;
              sPoints.push(new THREE.Vector2(x, -y));
          }
          const strawberryLathe = new THREE.Mesh(
              new THREE.LatheGeometry(sPoints, 20),
              bodyMaterial
          );
          bodyGroup.add(strawberryLathe);
          break;

      case 'banana':
          // Bunch of 5 curved bananas using TubeGeometry
          bodyMesh.visible = false;
          const curvePoints = [
              new THREE.Vector3(0, -radius, 0),
              new THREE.Vector3(radius * 0.4, 0, 0),
              new THREE.Vector3(0, radius, 0)
          ];
          const bananaCurve = new THREE.CatmullRomCurve3(curvePoints);
          const bananaGeo = new THREE.TubeGeometry(bananaCurve, 12, radius * 0.25, 8, false);
          
          for (let i = 0; i < 5; i++) {
              const b = new THREE.Mesh(bananaGeo, bodyMaterial);
              b.rotation.y = (i * Math.PI * 2) / 5;
              b.position.x = Math.cos(i) * radius * 0.2;
              b.position.z = Math.sin(i) * radius * 0.2;
              b.scale.setScalar(1.2);
              b.rotation.z = 0.2;
              bodyGroup.add(b);
          }
          // Top bunch stem
          const bStem = new THREE.Mesh(
            new THREE.CylinderGeometry(radius * 0.2, radius * 0.25, radius * 0.4, 8),
            new THREE.MeshStandardMaterial({ color: 0x442200 })
          );
          bStem.position.y = radius * 1.2;
          bodyGroup.add(bStem);
          break;

      case 'grape':
          // Dense cluster of 24+ grapes
          bodyMesh.visible = false;
          for (let i = 0; i < 24; i++) {
              const g = new THREE.Mesh(
                  new THREE.SphereGeometry(radius * 0.45, 12, 12),
                  bodyMaterial
              );
              // Distribute in a tapered oval shape
              const layer = Math.floor(i / 6);
              const angle = (i % 6) * (Math.PI / 3);
              const r = radius * (0.6 - layer * 0.1);
              g.position.set(
                  Math.cos(angle) * r,
                  (1.2 - layer * 0.5) * radius,
                  Math.sin(angle) * r
              );
              bodyGroup.add(g);
          }
          // Main stem for cluster
          const gStem = new THREE.Mesh(
            new THREE.CylinderGeometry(radius * 0.04, radius * 0.04, radius * 1.2, 8),
            new THREE.MeshStandardMaterial({ color: 0x336622 })
          );
          gStem.position.y = radius * 0.5;
          bodyGroup.add(gStem);
          break;

      case 'bomb':
          const ringGeo = new THREE.TorusGeometry(radius * 1.3, 0.04, 8, 24);
          const ringMat = new THREE.MeshPhongMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.6 });
          const ring = new THREE.Mesh(ringGeo, ringMat);
          bodyGroup.add(ring);
          break;
    }

    // Two Halves (Visible only when sliced)
    const halvesGroup = new THREE.Group();
    halvesGroup.visible = false;
    fruitGroup.add(halvesGroup);

    // Internal flesh colors
    const fleshColors = {
        watermelon: 0xff3333,
        apple: 0xffffee,
        orange: 0xffaa00,
        banana: 0xfffcd3,
        pineapple: 0xffef66,
        grape: 0xeeccff,
        strawberry: 0xff4444,
        bomb: 0x111111
    };
    const fColor = fleshColors[typeName] || 0xffffff;

    const createHalf = (isTop) => {
        const group = new THREE.Group();
        const outer = bodyMesh.clone();
        outer.visible = true; 
        outer.scale.y *= 0.5;
        outer.position.y = 0;
        
        const innerGeo = new THREE.CircleGeometry(radius * 1.1, 24);
        const innerMat = new THREE.MeshStandardMaterial({ 
            color: fColor,
            emissive: fColor,
            emissiveIntensity: 0.3
        });
        const inner = new THREE.Mesh(innerGeo, innerMat);
        inner.rotation.x = isTop ? Math.PI/2 : -Math.PI/2;
        inner.position.y = isTop ? -0.01 : 0.01;
        
        group.add(outer, inner);
        return group;
    };

    const half1 = createHalf(true);
    half1.position.y = 0.1;
    const half2 = createHalf(false);
    half2.position.y = -0.1;
    halvesGroup.add(half1, half2);

    fruitGroup.position.set(spawnX, spawnY, 0);
    this.scene.add(fruitGroup);

    const fruit = {
        id,
        type: typeName,
        position: { x: spawnX, y: spawnY, z: 0 },
        velocity: { x: vx, y: vy, z: vz },
        rotation: { x: 0, y: 0, z: 0 },
        rotationSpeed: {
          x: (Math.random() - 0.5) * 6,
          y: (Math.random() - 0.5) * 6,
          z: (Math.random() - 0.5) * 6,
        },
        radius,
        points: config.points,
        isSliced: false,
        mesh: fruitGroup, 
        body: bodyGroup,
        halves: halvesGroup,
        half1,
        half2
    };

    this.fruits.set(id, fruit);
    return fruit;
  }

  /**
   * Remove a fruit by ID and dispose its mesh.
   * @param {number} id
   */
  removeFruit(id) {
    const fruit = this.fruits.get(id);
    if (!fruit) return;

    this.scene.remove(fruit.mesh);
    // Recursively dispose geometries and materials
    fruit.mesh.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) {
                child.material.forEach(m => m.dispose());
            } else {
                child.material.dispose();
            }
        }
    });

    this.fruits.delete(id);
  }

  /**
   * Get an array of all active (non-sliced) fruits for collision detection.
   * @returns {Array<{id:number, type:string, position:{x,y,z}, radius:number, points:number}>}
   */
  getFruits() {
    const result = [];
    for (const [id, fruit] of this.fruits) {
      if (!fruit.isSliced) {
        result.push({
          id: fruit.id,
          type: fruit.type,
          position: { ...fruit.position },
          radius: fruit.radius,
          points: fruit.points,
        });
      }
    }
    return result;
  }

  /**
   * Mark a fruit as sliced (stops physics, allows ParticleSystem to handle visuals).
   * @param {number} id
   * @returns {object|null} The fruit data for the explosion, or null.
   */
  sliceFruit(id) {
    const fruit = this.fruits.get(id);
    if (!fruit || fruit.isSliced) return null;

    fruit.isSliced = true;
    fruit.body.visible = false;
    fruit.halves.visible = true;

    // Schedule cleanup after tumble animation
    setTimeout(() => {
        if (this.fruits.has(id)) this.removeFruit(id);
    }, 1200);

    return {
      type: fruit.type,
      position: { ...fruit.position },
      points: fruit.points,
    };
  }

  /**
   * Adjust difficulty parameters.
   * @param {number} level - Difficulty level (1+).
   */
  setDifficulty(level) {
    this.difficultyLevel = level;
    this.spawnInterval = Math.max(this.minSpawnInterval, 0.5 - (level - 1) * 0.05);
    this.maxFruits = Math.min(60, 32 + Math.floor((level - 1) * 3));
    this.bombChance = Math.min(0.2, 0.1 + (level - 1) * 0.01);
  }

  /**
   * Remove all fruits and reset state.
   */
  reset() {
    for (const id of [...this.fruits.keys()]) {
      this.removeFruit(id);
    }
    this.spawnTimer = 0;
    this.spawnInterval = 0.5;
    this.maxFruits = 32;
    this.bombChance = 0.1;
    this.difficultyLevel = 1;
  }

  /**
   * Generates a procedural texture for the fruit skin using a canvas.
   * @private
   */
  generateFruitTexture(type, baseColorHex) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    const baseColor = '#' + baseColorHex.toString(16).padStart(6, '0');
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 128, 128);

    ctx.globalAlpha = 0.3;
    if (type === 'striped') {
        // Watermelon stripes
        ctx.fillStyle = '#003300';
        for (let i = 0; i < 6; i++) {
            ctx.fillRect(i * 25, 0, 12, 128);
        }
    } else if (type === 'citrus') {
        // Orange pores
        ctx.fillStyle = '#cc5500';
        for (let i = 0; i < 150; i++) {
            ctx.beginPath();
            ctx.arc(Math.random()*128, Math.random()*128, 1, 0, Math.PI*2);
            ctx.fill();
        }
    } else if (type === 'speckled') {
        // Banana/Strawberry seeds
        ctx.fillStyle = '#331100';
        for (let i = 0; i < 60; i++) {
            ctx.fillRect(Math.random()*128, Math.random()*128, 2, 2);
        }
    } else if (type === 'pineapple') {
        // Pineapple diamond patterns
        ctx.strokeStyle = '#664400';
        ctx.lineWidth = 2;
        for (let i = 0; i < 8; i++) {
            ctx.moveTo(i * 20, 0);
            ctx.lineTo(i * 20 + 128, 128);
            ctx.moveTo(i * 20, 128);
            ctx.lineTo(i * 20 + 128, 0);
        }
        ctx.stroke();
    } else if (type === 'metal') {
        // Bomb metallic sheen
        const grad = ctx.createRadialGradient(40, 40, 10, 64, 64, 100);
        grad.addColorStop(0, '#666666');
        grad.addColorStop(1, '#000000');
        ctx.fillStyle = grad;
        ctx.globalAlpha = 1;
        ctx.fillRect(0, 0, 128, 128);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }
}

export default FruitManager;
