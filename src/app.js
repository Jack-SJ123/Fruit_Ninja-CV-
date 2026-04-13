/**
 * Fruit Ninja CV - Main Application Orchestrator
 * Connects all 4 modules: Tracking, Game Engine, UI, and optional Backend
 */
import * as THREE from 'three';
import HandTracker from './modules/tracking/HandTracker.js';
import GestureClassifier from './modules/tracking/GestureClassifier.js';
import FeatureExtractor from './modules/tracking/FeatureExtractor.js';
import FruitManager from './modules/game/FruitManager.js';
import CollisionDetector from './modules/game/CollisionDetector.js';
import TrailRenderer from './modules/game/TrailRenderer.js';
import ParticleSystem from './modules/game/ParticleSystem.js';
import GameState from './modules/ui/GameState.js';
import UIManager from './modules/ui/UIManager.js';

class App {
    constructor() {
        this.handTracker = new HandTracker();
        this.gestureClassifier = new GestureClassifier();
        this.featureExtractor = new FeatureExtractor();
        this.fruitManager = null;
        this.collisionDetector = new CollisionDetector();
        this.trailRenderer = new TrailRenderer();
        this.particleSystem = new ParticleSystem();
        this.gameState = new GameState();
        this.uiManager = new UIManager();

        // High-end Visuals State
        this.composer = null;
        this._smoothedLandmarks = new Map();
        this.SMOOTHING_FACTOR = 0.35;

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.clock = new THREE.Clock();
        this.animationId = null;
        this.startTarget = null;

        this.previousLandmarks = [null, null];
        this.lastTimestamp = 0;
        // Store recent hand screen positions for each finger trail
        this.handTrails = new Map(); // Key: "handIndex_landmarkIndex", Value: array of points
        this.handStates = [this.createHandState(), this.createHandState()];
        this.slashVelocityThreshold = 0.85;
        this.slashTravelThreshold = 0.12;
        this.slashConfidenceThreshold = 0.5;
        this.slashCooldownMs = 120;
        this.debug = {
            camera: 'pending',
            tracker: 'idle',
            handCount: 0,
            lastResultAt: 0,
            lastGesture: ['-', '-']
        };
        this.handHighlightRadius = 140;
    }

    createHandState() {
        return {
            lastSeenAt: 0,
            openPalmSince: 0,
            lastSlashAt: new Map(), // Finger index -> timestamp
            lastWaveAt: 0
        };
    }

    async init() {
        this.uiManager.init(document.getElementById('ui-overlay'));
        this.initDebugOverlay();

        this.initThreeJS();
        this.trailRenderer.init(document.getElementById('trail-canvas'));
        this.fruitManager = new FruitManager(this.scene);
        this.collisionDetector.setCamera(this.camera);
        this.scene.add(this.particleSystem.getScene());
        this.initStartTarget();

        this.setupStateCallbacks();
        this.setupResizeHandler();

        // Mouse/touch fallback for when camera is unavailable
        this.setupMouseFallback();

        // Show menu immediately, then try to start camera in background
        this.gameState.transition('menu');
        this.gameLoop();

        try {
            const video = document.getElementById('webcam');
            const highlightVideo = document.getElementById('webcam-highlight');
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
            });
            video.srcObject = stream;
            if (highlightVideo) {
                highlightVideo.srcObject = stream;
            }
            await video.play();
            if (highlightVideo) {
                await highlightVideo.play().catch(() => {});
            }
            this.debug.camera = 'ready';

            await this.handTracker.init(video);
            this.handTracker.onResults = (results) => this.onTrackingResults(results);
            this.handTracker.start();
            this.cameraReady = true;
            this.debug.tracker = 'running';
        } catch (err) {
            console.warn('Camera not available, running in demo mode:', err.message);
            this.cameraReady = false;
            this.debug.camera = `error: ${err.message}`;
            this.debug.tracker = 'stopped';
        }
    }

    initDebugOverlay() {
        const overlay = document.getElementById('ui-overlay');
        if (!overlay) return;

        const panel = document.createElement('div');
        panel.id = 'debug-status';
        panel.style.cssText = [
            'position:absolute',
            'left:12px',
            'bottom:12px',
            'z-index:300',
            'padding:8px 10px',
            'background:rgba(0,0,0,0.65)',
            'color:#fff',
            'font:12px/1.5 monospace',
            'border:1px solid rgba(255,255,255,0.15)',
            'border-radius:8px',
            'pointer-events:none',
            'white-space:pre-line'
        ].join(';');
        overlay.appendChild(panel);
        this.debugPanel = panel;
        this.renderDebugStatus();
    }

    initThreeJS() {
        const container = document.getElementById('three-container');
        this.scene = new THREE.Scene();

        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
        this.camera.position.z = 10;

        this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.shadowMap.enabled = true;
        container.appendChild(this.renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(ambientLight);
        
        // Dynamic Point Light for Glow - Even Stronger now
        const pointLight = new THREE.PointLight(0x00ffff, 30, 60);
        pointLight.position.set(0, 5, 5);
        this.scene.add(pointLight);

        const topLight = new THREE.DirectionalLight(0xffffff, 1.2);
        topLight.position.set(0, 10, 0);
        this.scene.add(topLight);
    }

    initStartTarget() {
        const group = new THREE.Group();
        const fruit = new THREE.Mesh(
            new THREE.SphereGeometry(0.7, 32, 32),
            new THREE.MeshStandardMaterial({ 
                color: 0xff8844, 
                roughness: 0.2, 
                metalness: 0.1,
                emissive: 0xff8844,
                emissiveIntensity: 0.4
            })
        );
        const leaf = new THREE.Mesh(
            new THREE.ConeGeometry(0.18, 0.35, 12),
            new THREE.MeshPhongMaterial({ color: 0x44cc44, shininess: 20 })
        );
        leaf.position.set(0.2, 0.92, 0);
        leaf.rotation.z = -0.7;
        const stem = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.04, 0.28, 8),
            new THREE.MeshPhongMaterial({ color: 0x5b341c })
        );
        stem.position.set(0, 0.95, 0);
        group.add(fruit, leaf, stem);
        group.position.set(0, -1.6, 0); // Raised for better visibility during Game Over
        group.visible = false;
        this.scene.add(group);

        this.startTarget = {
            id: -1,
            type: 'orange',
            radius: 0.9,
            mesh: group
        };
    }

    setStartTargetVisible(visible) {
        if (this.startTarget) {
            this.startTarget.mesh.visible = visible;
        }
    }

    setupStateCallbacks() {
        this.gameState.onStateChange((prevState, newState) => {
            this.uiManager.hideScreen(prevState);
            this.uiManager.hideScreen('hud');

            if (newState === 'playing') {
                this.uiManager.showScreen('hud');
                this.setStartTargetVisible(false);
                if (prevState === 'countdown') {
                    this.fruitManager.reset();
                    this.trailRenderer.clear();
                    this.handTrails.clear();
                }
            } else if (newState === 'gameover') {
                this.uiManager.showGameOverStats(this.gameState.getData());
                this.uiManager.showScreen('gameover');
                this.setStartTargetVisible(true);
            } else if (newState === 'countdown') {
                this.uiManager.showScreen('countdown');
                this.setStartTargetVisible(false);
                this._countdownTimeout = setTimeout(() => {
                    this.gameState.transition('playing');
                }, 3200);
            } else {
                this.uiManager.showScreen(newState);
                this.setStartTargetVisible(newState === 'menu');
            }
        });

        this.gameState.onGameEvent((eventName, eventData) => {
            if (eventName === 'comboUp') {
                this.uiManager.showCombo(eventData.multiplier);
            }
        });
    }

    setupResizeHandler() {
        window.addEventListener('resize', () => {
            const w = window.innerWidth;
            const h = window.innerHeight;
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(w, h);
        });
    }

    setupMouseFallback() {
        const container = document.getElementById('game-container');
        let mouseDown = false;

        const handleMove = (x, y) => {
            const rect = container.getBoundingClientRect();
            const screenX = (x - rect.left) / rect.width;
            const screenY = (y - rect.top) / rect.height;
            const trailKey = '1_8'; // Simulate right hand index finger

            this.trailRenderer.addPoint(1, 8, x - rect.left, y - rect.top);

            if (!this.handTrails.has(trailKey)) this.handTrails.set(trailKey, []);
            const trail = this.handTrails.get(trailKey);
            trail.push({ x: screenX, y: screenY });
            if (trail.length > 10) trail.shift();

            if (this.gameState.getState() === 'playing' && mouseDown) {
                const collisions = this.collisionDetector.checkCollisions(
                    trail, this.fruitManager.getFruits()
                );
                for (const fruitId of collisions) {
                    const fruit = this.fruitManager.fruits.get(fruitId);
                    if (!fruit || fruit.isSliced) continue;
                    if (fruit.type === 'bomb') {
                        this.gameState.loseLife();
                        this.gameState.resetCombo();
                        this._flashDamage();
                    } else {
                        this.gameState.updateScore(fruit.points);
                        this.gameState.addCombo();
                        const gained = fruit.points * this.gameState.getData().comboMultiplier;
                        this.uiManager.showScorePopup(gained, screenX, screenY);
                    }
                    this.particleSystem.createExplosion(fruit.mesh.position.clone(), fruit.type);
                    this.fruitManager.sliceFruit(fruitId);
                }
            }
        };

        container.addEventListener('mousedown', () => { mouseDown = true; });
        container.addEventListener('mouseup', () => { mouseDown = false; this.handTrails.delete('1_8'); });
        container.addEventListener('mousemove', (e) => { if (mouseDown) handleMove(e.clientX, e.clientY); });
    }

    onTrackingResults(results) {
        this.debug.tracker = 'receiving';
        this.debug.handCount = results.landmarks?.length || 0;
        this.debug.lastResultAt = results.timestamp || performance.now();

        if (!results.landmarks || results.landmarks.length === 0) {
            this.resetTrackingState();
            this.updateHandHighlight([]);
            this.renderDebugStatus();
            return;
        }

        const dt = results.timestamp - this.lastTimestamp || 16;
        this.lastTimestamp = results.timestamp;

        const state = this.gameState.getState();

        for (let i = 0; i < results.landmarks.length; i++) {
            const landmarks = results.landmarks[i];
            const handedness = results.handedness?.[i]?.[0]?.categoryName || 'Right';
            const handIndex = handedness === 'Left' ? 0 : 1;
            const handState = this.handStates[handIndex];
            handState.lastSeenAt = results.timestamp;

            const features = this.featureExtractor.extract(landmarks, this.previousLandmarks[handIndex], dt / 1000, handIndex);
            const prediction = this.gestureClassifier.predict(features, handIndex);
            this.previousLandmarks[handIndex] = landmarks;
            this.debug.lastGesture[handIndex] = prediction.gesture;

            const tipIndices = [4, 8, 12, 16, 20];
            const handVel = this.featureExtractor.getHandVelocity(handIndex);
            
            for (const tipIdx of tipIndices) {
                const tip = landmarks[tipIdx];
                const rawX = 1 - tip.x;
                const rawY = tip.y;
                const trailKey = `${handIndex}_${tipIdx}`;

                // Predictive Smoothing
                if (!this._smoothedLandmarks.has(trailKey)) {
                    this._smoothedLandmarks.set(trailKey, { x: rawX, y: rawY });
                }
                const smoothed = this._smoothedLandmarks.get(trailKey);
                smoothed.x += (rawX - smoothed.x) * this.SMOOTHING_FACTOR;
                smoothed.y += (rawY - smoothed.y) * this.SMOOTHING_FACTOR;

                let visualOffsetX = (tipIdx - 8) * 3; 
                this.trailRenderer.addPoint(handIndex, tipIdx, smoothed.x * window.innerWidth + visualOffsetX, smoothed.y * window.innerHeight);

                if (!this.handTrails.has(trailKey)) this.handTrails.set(trailKey, []);
                const trail = this.handTrails.get(trailKey);
                trail.push({ x: smoothed.x, y: smoothed.y });
                if (trail.length > 10) trail.shift();

                const isSlashing = this.shouldRegisterSlash(handIndex, prediction, handVel, results.timestamp, trailKey);
                
                if (isSlashing && (state === 'menu' || state === 'gameover')) {
                    const collisions = this.collisionDetector.checkCollisions(trail, [this.getStartTargetCollisionObject()]);
                    if (collisions.includes(this.startTarget.id)) {
                        this.particleSystem.createExplosion(this.startTarget.mesh.position.clone(), this.startTarget.type);
                        if (state === 'gameover') {
                            this.gameState.transition('menu');
                            setTimeout(() => this.gameState.transition('countdown'), 220);
                        } else {
                            this.gameState.transition('countdown');
                        }
                        return; // Done for this frame
                    }
                }

                if (state === 'playing' && isSlashing) {
                    const collisions = this.collisionDetector.checkCollisions(trail, this.fruitManager.getFruits());
                    for (const fruitId of collisions) {
                        const fruit = this.fruitManager.fruits.get(fruitId);
                        if (!fruit || fruit.isSliced) continue;

                        // Create juice splat on screen
                        const fruitColors = {
                             apple: 0xff4444, orange: 0xff8800, watermelon: 0x44cc44,
                             banana: 0xffdd00, pineapple: 0xeebb33, grape: 0x8844ff,
                             strawberry: 0xff2266
                        };
                        const color = fruitColors[fruit.type] || 0xffffff;
                        this._createJuiceSplat(screenX, screenY, color);

                        if (fruit.type === 'bomb') {
                            this.gameState.loseLife();
                            this.gameState.resetCombo();
                            this._flashDamage();
                        } else {
                            this.gameState.updateScore(fruit.points);
                            this.gameState.addCombo();
                            const gained = fruit.points * this.gameState.getData().comboMultiplier;
                            this.uiManager.showScorePopup(gained, screenX, screenY);
                        }
                        this.particleSystem.createExplosion(fruit.mesh.position.clone(), fruit.type);
                        this.fruitManager.sliceFruit(fruitId);
                    }
                }
            }

            if (state === 'paused' && this.isResumeWave(handIndex, handVel, results.timestamp)) {
                this.gameState.transition('playing');
            }
        }

        this.updateHandHighlight(results.landmarks);
        this.pruneInactiveHands(results.timestamp);
        this.renderDebugStatus();
    }

    shouldRegisterSlash(handIndex, prediction, handVelocity, timestamp, trailKey) {
        const handState = this.handStates[handIndex];
        const trail = this.handTrails.get(trailKey);
        const travel = this.getTrailTravelDistance(trail);
        
        const gestureConfidence = prediction.probabilities?.slash || 0;
        const strongGesture = prediction.gesture === 'slash' && gestureConfidence >= this.slashConfidenceThreshold;
        const strongMotion = handVelocity >= this.slashVelocityThreshold && travel >= this.slashTravelThreshold;

        if (!(strongGesture || strongMotion)) return false;

        const lastSlash = handState.lastSlashAt.get(trailKey) || 0;
        if (timestamp - lastSlash < this.slashCooldownMs) return false;

        handState.lastSlashAt.set(trailKey, timestamp);
        return true;
    }

    isResumeWave(handIndex, handVelocity, timestamp) {
        const handState = this.handStates[handIndex];
        // Use index finger trail for wave detection (index 8)
        const trail = this.handTrails.get(`${handIndex}_8`);
        if (!trail || trail.length < 4) {
            return false;
        }

        const start = trail[0];
        const end = trail[trail.length - 1];
        const horizontalTravel = Math.abs(end.x - start.x);
        const totalTravel = this.getTrailTravelDistance(trail);
        if (horizontalTravel < 0.12 ||
            totalTravel < 0.16 ||
            handVelocity < 0.35) {
            return false;
        }

        if (timestamp - handState.lastWaveAt < 900) {
            return false;
        }

        handState.lastWaveAt = timestamp;
        return true;
    }

    getStartTargetCollisionObject() {
        if (!this.startTarget || !this.startTarget.mesh.visible) {
            return { id: -999, position: { x: 999, y: 999, z: 0 }, radius: 0, points: 0 };
        }

        return {
            id: this.startTarget.id,
            type: this.startTarget.type,
            position: {
                x: this.startTarget.mesh.position.x,
                y: this.startTarget.mesh.position.y,
                z: this.startTarget.mesh.position.z
            },
            radius: this.startTarget.radius,
            points: 0
        };
    }

    getTrailTravelDistance(trail) {
        if (!trail || trail.length < 2) return 0;

        let distance = 0;
        for (let i = 1; i < trail.length; i++) {
            const dx = trail[i].x - trail[i - 1].x;
            const dy = trail[i].y - trail[i - 1].y;
            distance += Math.hypot(dx, dy);
        }
        return distance;
    }

    pruneInactiveHands(timestamp) {
        for (let i = 0; i < this.handStates.length; i++) {
            if (timestamp - this.handStates[i].lastSeenAt > 250) {
                this.previousLandmarks[i] = null;
                // Clear all finger trails for this hand
                for (const key of this.handTrails.keys()) {
                    if (key.startsWith(`${i}_`)) {
                        this.handTrails.delete(key);
                    }
                }
                this.handStates[i].openPalmSince = 0;
            }
        }
    }

    resetTrackingState() {
        this.previousLandmarks = [null, null];
        this.handTrails.clear();
        this.handStates = [this.createHandState(), this.createHandState()];
        this.debug.lastGesture = ['-', '-'];
    }

    renderDebugStatus() {
        if (!this.debugPanel) return;

        const ageMs = this.debug.lastResultAt
            ? Math.max(0, Math.round(performance.now() - this.debug.lastResultAt))
            : -1;
        this.debugPanel.textContent = [
            `camera: ${this.debug.camera}`,
            `tracker: ${this.debug.tracker}`,
            `hands: ${this.debug.handCount}`,
            `last result: ${ageMs >= 0 ? `${ageMs}ms ago` : 'never'}`,
            `left gesture: ${this.debug.lastGesture[0]}`,
            `right gesture: ${this.debug.lastGesture[1]}`
        ].join('\n');
    }

    updateHandHighlight(landmarksList) {
        const highlightVideo = document.getElementById('webcam-highlight');
        if (!highlightVideo) return;

        if (!landmarksList || landmarksList.length === 0) {
            highlightVideo.style.webkitMaskImage = 'none';
            highlightVideo.style.maskImage = 'none';
            highlightVideo.style.opacity = '0';
            return;
        }

        const gradients = landmarksList.map((landmarks) => {
            const center = this.getHandCenter(landmarks);
            const x = Math.round(center.x * window.innerWidth);
            const y = Math.round(center.y * window.innerHeight);
            const r = this.handHighlightRadius;
            return `radial-gradient(circle ${r}px at ${x}px ${y}px, rgba(0,0,0,1) 0, rgba(0,0,0,0.98) 45%, rgba(0,0,0,0.75) 62%, rgba(0,0,0,0) 100%)`;
        });

        const maskValue = gradients.join(',');
        highlightVideo.style.opacity = '0.98';
        highlightVideo.style.webkitMaskImage = maskValue;
        highlightVideo.style.maskImage = maskValue;
    }

    getHandCenter(landmarks) {
        if (!landmarks || landmarks.length === 0) {
            return { x: 0.5, y: 0.5 };
        }

        let sumX = 0;
        let sumY = 0;
        for (const point of landmarks) {
            sumX += point.x;
            sumY += point.y;
        }

        return {
            x: sumX / landmarks.length,
            y: sumY / landmarks.length
        };
    }

    _flashDamage() {
        const overlay = document.getElementById('ui-overlay');
        if (!overlay) return;
        const flash = document.createElement('div');
        flash.style.cssText = 'position:absolute;inset:0;background:rgba(255,0,0,0.3);pointer-events:none;z-index:200;animation:fn-floatUp 0.5s ease-out forwards;';
        overlay.appendChild(flash);
        setTimeout(() => flash.remove(), 500);
    }

    _createJuiceSplat(x, y, colorHex) {
        const overlay = document.getElementById('ui-overlay');
        if (!overlay) return;
        
        const splat = document.createElement('div');
        splat.className = 'fn-splat';
        const color = '#' + colorHex.toString(16).padStart(6, '0');
        const size = 60 + Math.random() * 80;
        
        splat.style.cssText = `
            left: ${x * 100}%;
            top: ${y * 100}%;
            width: ${size}px;
            height: ${size}px;
            background: ${color};
            box-shadow: 0 0 15px ${color};
        `;
        
        overlay.appendChild(splat);
        setTimeout(() => splat.remove(), 1500);
    }

    gameLoop() {
        this.animationId = requestAnimationFrame(() => this.gameLoop());
        const dt = this.clock.getDelta();

        if (this.gameState.getState() === 'playing') {
            this.gameState.updateTime(dt);

            // Progressive difficulty based on elapsed time
            const elapsed = 60 - this.gameState.getData().timeRemaining;
            const level = 1 + Math.floor(elapsed / 10);
            this.fruitManager.setDifficulty(level);

            this.fruitManager.update(dt);
            this.uiManager.update(this.gameState.getData());
        }

        if (this.startTarget?.mesh?.visible) {
            const t = performance.now() * 0.001;
            this.startTarget.mesh.rotation.y += dt * 1.4;
            this.startTarget.mesh.position.y = -2.2 + Math.sin(t * 2.2) * 0.18;
            const scale = 1 + Math.sin(t * 3.5) * 0.06;
            this.startTarget.mesh.scale.setScalar(scale);
        }

        this.particleSystem.update(dt);
        this.trailRenderer.render();
        this.renderDebugStatus();
        this.renderer.render(this.scene, this.camera);
    }
}

// Start the application
const app = new App();
app.init().catch(console.error);
