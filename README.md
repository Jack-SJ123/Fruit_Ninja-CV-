# Fruit Ninja CV - AI Gesture Controlled Arcade

A high-performance, browser-based Fruit Ninja clone powered by **MediaPipe Hand Tracking** and **Three.js**. This project features a professional-grade gaming experience with advanced physics, cinematic visual effects, and a modern "Cyber-Ninja" aesthetic.

## 🚀 Key Features

- **Predictive Hand Tracking**: Uses Exponential Moving Average (EMA) smoothing and predictive algorithms to deliver lag-free 60FPS interaction even on standard webcams.
- **Advanced Physics Engine**: Real-time fruit splitting with anatomical 'flesh' rendering and independent motion trajectories for sliced halves.
- **Pro-Grade Visuals**: Neon-emissive materials, high-density procedural particle explosions (including seeds and fruit chunks), and a Glassmorphism UI.
- **Persistent Progress**: Local storage integration for high-score tracking and session-based stats.

---

## 🏗️ 4-Module Modular Design

The project is architected into four distinct modules to ensure scalability and professional collaborative standards:

### 🎮 Module 1: Tracking & Input System
- **Lead Focus**: Computer Vision & AI.
- **Core Technology**: Google MediaPipe Hands.
- **Features**: 
  - 21-point hand landmark extraction.
  - Predictive smoothing layer for steady slashes.
  - Multi-hand support with gesture classification (Slash vs. Wave).

### ⚙️ Module 2: Game Engine & Physics
- **Lead Focus**: Physics Simulation & Visual Effects.
- **Core Technology**: Three.js WebGL & Canvas API.
- **Features**:
  - Parabolic trajectory simulation.
  - Collision detection based on raycasting and hand-trail intersection.
  - "Flesh-and-Skin" multi-part fruit models.
  - Particle system managing juice splats and debris.

### 🖼️ Module 3: UI/UX & Rendering
- **Lead Focus**: Frontend & Design Aesthetics.
- **Core Technology**: Modern CSS3 (Clip-paths, Backdrop-filters) & HTML5.
- **Features**:
  - Cyberpunk-themed HUD with neon pulsating hearts.
  - Tech-frame score panels.
  - Responsive screen-space "Juice Splash" overlay.
  - High-end typography (Google Fonts Outfit).

### 🖥️ Module 4: Backend & Integration
- **Lead Focus**: Performance & Deployment.
- **Core Technology**: ES Modules, LocalStorage, & Optional Python/YOLO Bridge.
- **Features**:
  - State machine management (Menu -> Playing -> Game Over).
  - High-score persistence.
  - Optimized module loading via Import Maps.
  - Static file hosting and dependency management.

---

## 🛠️ How to Run

1. Clone this repository:
   ```bash
   git clone https://github.com/Jack-SJ123/Fruit_Ninja-CV-.git
   ```
2. Navigate to the project folder:
   ```bash
   cd Fruit_Ninja-CV-
   ```
3. Start a local server:
   ```bash
   # Using Python
   python server/serve.py
   ```
4. Open your browser at `http://localhost:8090` (or the port specified in your console).

---

## 👤 Team & Contributions
Developed by **Jack Si** and Team for the **CV Final Project 2026**.

**Module Breakdown:**
- **Tracking**: Hand tracking reliability and gesture smoothing.
- **Engine**: Physics, particles, and 3D rendering loop.
- **UI**: HUD, overlays, and style consistency.
- **Backend/Systems**: Architecture, game state, and persistence.
