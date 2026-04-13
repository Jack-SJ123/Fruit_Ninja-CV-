/**
 * UIManager.js - Manages all DOM-based UI overlays
 * Module 3: UI/UX & Game State
 * Author: Angel Daniel Bustamante Perez
 *
 * Creates and controls overlay screens (menu, countdown, HUD, pause,
 * game-over) entirely through programmatic DOM manipulation.
 * Uses CSS animations and a neon color theme.
 */

// ─── Style injection ────────────────────────────────────────────────

const STYLE_ID = 'fruit-ninja-ui-styles';

const UI_STYLES = `
/* ── Shared overlay base ───────────────────────────────── */
.fn-overlay {
    position: absolute;
    inset: 0;
    display: none;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 100;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: #ffffff;
    text-align: center;
    pointer-events: none;
    user-select: none;
}
.fn-overlay.active {
    display: flex;
}
.fn-overlay--backdrop {
    background: rgba(0, 0, 0, 0.70);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
}

/* ── Menu screen ───────────────────────────────────────── */
.fn-menu__title {
    font-size: clamp(2.5rem, 8vw, 5rem);
    font-weight: 900;
    letter-spacing: 0.04em;
    color: #00FFFF;
    text-shadow: 0 0 20px rgba(0,255,255,0.6), 0 0 60px rgba(0,255,255,0.3);
    margin-bottom: 0.25em;
    animation: fn-pulse 2s ease-in-out infinite;
}
.fn-menu__subtitle {
    font-size: clamp(1rem, 3vw, 1.5rem);
    color: #bbbbbb;
    margin-bottom: 1.5em;
}
/* ── Removed redundant menu hand ── */

/* ── Countdown ─────────────────────────────────────────── */
.fn-countdown__number {
    font-size: clamp(5rem, 20vw, 12rem);
    font-weight: 900;
    font-family: 'Courier New', Courier, monospace;
    color: #00FF00;
    text-shadow: 0 0 30px rgba(0,255,0,0.7), 0 0 80px rgba(0,255,0,0.3);
    animation: fn-countdownZoom 0.8s ease-out;
}

/* ── HUD ───────────────────────────────────────────────── */
.fn-hud {
    position: absolute;
    inset: 0;
    display: none;
    z-index: 100;
    pointer-events: none;
    user-select: none;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}
.fn-hud.active {
    display: block;
}
.fn-hud__score {
    position: absolute;
    top: 20px;
    right: 20px;
    padding: 15px 30px;
    background: rgba(0, 255, 255, 0.05);
    backdrop-filter: blur(10px);
    border: 2px solid #00FFFF;
    border-radius: 4px;
    clip-path: polygon(0 0, 100% 0, 100% 70%, 85% 100%, 0 100%);
    font-family: 'Outfit', sans-serif;
    color: #00FFFF;
    text-shadow: 0 0 15px rgba(0,255,255,0.8);
    min-width: 200px;
    text-align: right;
}
.fn-hud__score::before {
    content: "SCORE";
    position: absolute;
    left: 15px;
    top: 4px;
    font-size: 0.6rem;
    letter-spacing: 2px;
    opacity: 0.7;
}
.fn-hud__time {
    position: absolute;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    font-family: 'Outfit', sans-serif;
    font-size: 1.8rem;
    font-weight: 700;
    color: #ffffff;
    text-shadow: 0 0 10px rgba(255,255,255,0.4);
    background: rgba(0,0,0,0.3);
    padding: 10px 25px;
    border-radius: 4px;
    border: 1px solid rgba(255,255,255,0.2);
}
.fn-hud__time.warning {
    color: #ff4444;
    text-shadow: 0 0 15px #ff4444;
    border-color: #ff4444;
}

.fn-hud__lives {
    position: absolute;
    top: 20px;
    left: 20px;
    display: flex;
    gap: 12px;
}
.fn-hud__heart {
    font-size: 2.5rem;
    color: #ff2266;
    filter: drop-shadow(0 0 10px #ff2266);
    transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
.fn-hud__heart.lost {
    opacity: 0.15;
    transform: scale(0.6) rotate(-20deg);
    filter: grayscale(1) blur(2px);
}

/* ── Pause screen ──────────────────────────────────────── */
.fn-pause__title {
    font-size: clamp(2.5rem, 8vw, 4.5rem);
    font-weight: 900;
    color: #00FFFF;
    text-shadow: 0 0 20px rgba(0,255,255,0.6);
    margin-bottom: 0.4em;
    animation: fn-pulse 2s ease-in-out infinite;
}
.fn-pause__hint {
    font-size: clamp(1rem, 3vw, 1.4rem);
    color: #aaaaaa;
}

/* ── Game Over screen ──────────────────────────────────── */
.fn-gameover-overlay {
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: none; /* Removed blur entirely for restart fruit visibility */
}
.fn-gameover__title {
    margin-top: -100px; /* Shift content up */
    font-size: clamp(2.5rem, 8vw, 4.5rem);
    font-weight: 900;
    color: #ff4444;
    text-shadow: 0 0 20px rgba(255,68,68,0.6);
    margin-bottom: 0.4em;
}
.fn-gameover__score {
    font-family: 'Courier New', Courier, monospace;
    font-size: clamp(2rem, 6vw, 3.5rem);
    font-weight: 700;
    color: #00FFFF;
    text-shadow: 0 0 16px rgba(0,255,255,0.5);
    margin-bottom: 0.6em;
}
.fn-gameover__stats {
    list-style: none;
    padding: 0;
    margin: 0 0 1.5em 0;
    font-size: clamp(0.9rem, 2.5vw, 1.15rem);
    color: #cccccc;
    line-height: 2;
}
.fn-gameover__stats span {
    color: #00FF00;
    font-weight: 700;
    font-family: 'Courier New', Courier, monospace;
}
.fn-gameover__hint {
    font-size: clamp(1rem, 3vw, 1.3rem);
    color: #aaaaaa;
    animation: fn-pulse 2s ease-in-out infinite;
}

/* ── Score popup ───────────────────────────────────────── */
.fn-score-popup {
    position: absolute;
    font-family: 'Outfit', sans-serif;
    font-size: 2.2rem;
    font-weight: 900;
    color: #00FF00;
    text-shadow: 0 0 20px rgba(0,255,0,0.8);
    pointer-events: none;
    user-select: none;
    animation: fn-floatUp 0.9s cubic-bezier(0.23, 1, 0.32, 1) forwards;
    z-index: 110;
}

.fn-combo-flash {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-family: 'Outfit', sans-serif;
    font-size: 5rem;
    font-weight: 950;
    font-style: italic;
    color: #00FFFF;
    text-shadow:
        0 0 20px #00FFFF,
        0 0 50px rgba(0,255,255,0.4);
    pointer-events: none;
    user-select: none;
    animation: fn-comboFlash 1.2s cubic-bezier(0.19, 1, 0.22, 1) forwards;
    z-index: 115;
}

/* ── Keyframes ─────────────────────────────────────────── */
@keyframes fn-pulse {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.65; }
}
/* Removed fn-handWave keyframe */
@keyframes fn-countdownZoom {
    0%   { transform: scale(2.5); opacity: 0; }
    50%  { opacity: 1; }
    100% { transform: scale(1); opacity: 1; }
}
@keyframes fn-floatUp {
    0%   { opacity: 1; transform: translateY(0); }
    100% { opacity: 0; transform: translateY(-60px); }
}
@keyframes fn-comboFlash {
    0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
    30%  { opacity: 1; transform: translate(-50%, -50%) scale(1.15); }
    100% { opacity: 0; transform: translate(-50%, -50%) scale(1.3); }
}
`;

// ─── Helper ─────────────────────────────────────────────

function el(tag, className, textContent) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (textContent !== undefined) node.textContent = textContent;
    return node;
}

// ─── UIManager class ────────────────────────────────────

class UIManager {
    constructor() {
        /** @type {HTMLElement|null} */
        this._container = null;
        this._screens = {};
        this._hud = {};
        this._countdownTimer = null;
        this._styleEl = null;
    }

    // ────────────────────── Public API ──────────────────────

    /**
     * Initialise all UI elements inside the given container.
     * @param {HTMLElement} container - The parent DOM node.
     */
    init(container) {
        this._container = container;
        this._injectStyles();
        this._buildMenu();
        this._buildCountdown();
        this._buildHUD();
        this._buildPause();
        this._buildGameOver();
    }

    /**
     * Update the HUD with the latest game data.
     * @param {object} gameData - Object from GameState.getData().
     */
    update(gameData) {
        if (!this._hud.score) return;

        const highScore = gameData.highScore || 0;
        this._hud.score.innerHTML = `
            ${gameData.score.toLocaleString()}
            <div style="font-size: 0.8rem; font-weight: 400; opacity: 0.6; margin-top: 5px;">
                BEST: ${highScore.toLocaleString()}
            </div>
        `;

        const secs = Math.ceil(gameData.timeRemaining);
        const mins = Math.floor(secs / 60);
        const remSecs = secs % 60;
        this._hud.time.textContent =
            `${String(mins).padStart(2, '0')}:${String(remSecs).padStart(2, '0')}`;
        this._hud.time.classList.toggle('warning', gameData.timeRemaining <= 10);

        // Combo indicator
        if (gameData.comboMultiplier > 1) {
            this._hud.combo.textContent = `${gameData.comboMultiplier}x`;
            this._hud.combo.classList.add('visible');
        } else {
            this._hud.combo.classList.remove('visible');
        }

        // Lives
        const hearts = this._hud.livesContainer.children;
        for (let i = 0; i < hearts.length; i++) {
            hearts[i].classList.toggle('lost', i >= gameData.lives);
        }
    }

    /**
     * Show a screen by name.
     * @param {'menu'|'countdown'|'hud'|'paused'|'gameover'} name
     */
    showScreen(name) {
        const target = name === 'hud' ? this._hud.root : this._screens[name];
        if (target) target.classList.add('active');

        if (name === 'countdown') {
            this._runCountdown();
        }
    }

    /**
     * Hide a screen by name.
     * @param {'menu'|'countdown'|'hud'|'paused'|'gameover'} name
     */
    hideScreen(name) {
        const target = name === 'hud' ? this._hud.root : this._screens[name];
        if (target) target.classList.remove('active');
    }

    /**
     * Show a floating score popup at the given viewport-relative position.
     * @param {number} points - The point value to display.
     * @param {number} x - X position (0-1, fraction of container width).
     * @param {number} y - Y position (0-1, fraction of container height).
     */
    showScorePopup(points, x, y) {
        if (!this._container) return;

        const popup = el('div', 'fn-score-popup', `+${points}`);
        popup.style.left = `${(x * 100).toFixed(1)}%`;
        popup.style.top = `${(y * 100).toFixed(1)}%`;
        this._container.appendChild(popup);

        popup.addEventListener('animationend', () => popup.remove());
    }

    /**
     * Flash a combo multiplier announcement in the center of the screen.
     * @param {number} multiplier
     */
    showCombo(multiplier) {
        if (!this._container) return;

        const flash = el('div', 'fn-combo-flash', `${multiplier}x COMBO!`);
        this._container.appendChild(flash);

        flash.addEventListener('animationend', () => flash.remove());
    }

    /**
     * Remove all UI elements and clean up.
     */
    destroy() {
        if (this._countdownTimer) {
            clearTimeout(this._countdownTimer);
            this._countdownTimer = null;
        }

        // Remove screens
        Object.values(this._screens).forEach((node) => node?.remove());
        this._screens = {};

        if (this._hud.root) this._hud.root.remove();
        this._hud = {};

        // Remove injected style
        if (this._styleEl) {
            this._styleEl.remove();
            this._styleEl = null;
        }

        this._container = null;
    }

    // ────────────────── Private builders ────────────────────

    _injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        this._styleEl = document.createElement('style');
        this._styleEl.id = STYLE_ID;
        this._styleEl.textContent = UI_STYLES;
        document.head.appendChild(this._styleEl);
    }

    _buildMenu() {
        const screen = el('div', 'fn-overlay'); // Removed fn-overlay--backdrop for visibility

        const title = el('div', 'fn-menu__title', 'Fruit Ninja');
        const subtitle = el('div', 'fn-menu__subtitle', 'Slice the fruit to start!');
        screen.append(title, subtitle);
        this._container.appendChild(screen);
        this._screens.menu = screen;
    }

    _buildCountdown() {
        const screen = el('div', 'fn-overlay fn-overlay--backdrop');
        const numberEl = el('div', 'fn-countdown__number');
        screen.appendChild(numberEl);
        this._container.appendChild(screen);
        this._screens.countdown = screen;
        this._countdownNumberEl = numberEl;
    }

    _buildHUD() {
        const root = el('div', 'fn-hud');

        const score = el('div', 'fn-hud__score', '18,450');
        const combo = el('div', 'fn-hud__combo', '1x');
        const livesContainer = el('div', 'fn-hud__lives');

        for (let i = 0; i < 5; i++) {
            const heart = el('span', 'fn-hud__heart', '\u2665'); // Larger heart
            livesContainer.appendChild(heart);
        }

        const time = el('div', 'fn-hud__time', '01:00');
        root.append(score, time, combo, livesContainer);
        this._container.appendChild(root);

        this._hud = { root, score, time, combo, livesContainer };
    }

    _buildPause() {
        const screen = el('div', 'fn-overlay fn-overlay--backdrop');

        const title = el('div', 'fn-pause__title', 'PAUSED');
        const hint = el('div', 'fn-pause__hint', 'Wave to resume');

        screen.append(title, hint);
        this._container.appendChild(screen);
        this._screens.paused = screen;
    }

    _buildGameOver() {
        const screen = el('div', 'fn-overlay fn-gameover-overlay');

        const title = el('div', 'fn-gameover__title', 'GAME OVER');
        const scoreEl = el('div', 'fn-gameover__score', '0');
        const stats = el('ul', 'fn-gameover__stats');
        const hint = el('div', 'fn-gameover__hint', 'Slice the fruit to play again');

        screen.append(title, scoreEl, stats, hint);
        this._container.appendChild(screen);
        this._screens.gameover = screen;
        this._gameOverScoreEl = scoreEl;
        this._gameOverStatsList = stats;
    }

    // ─────────────── Private behaviour ──────────────────────

    /**
     * Animate 3-2-1-GO! then auto-hide the countdown screen.
     */
    _runCountdown() {
        const steps = ['3', '2', '1', 'GO!'];
        let i = 0;

        const show = () => {
            if (i >= steps.length) {
                this.hideScreen('countdown');
                return;
            }
            this._countdownNumberEl.textContent = steps[i];
            // Re-trigger animation by removing & re-adding the element
            const clone = this._countdownNumberEl.cloneNode(true);
            this._countdownNumberEl.replaceWith(clone);
            this._countdownNumberEl = clone;
            i++;
            this._countdownTimer = setTimeout(show, 800);
        };

        show();
    }

    /**
     * Populate the game-over screen with final stats.
     * Call this before showing the gameover screen.
     * @param {object} gameData
     */
    showGameOverStats(gameData) {
        if (this._gameOverScoreEl) {
            this._gameOverScoreEl.textContent = gameData.score.toLocaleString();
        }

        if (this._gameOverStatsList) {
            const accuracy =
                gameData.fruitsSliced > 0
                    ? (
                          (gameData.fruitsSliced /
                              (gameData.fruitsSliced + gameData.bombsHit)) *
                          100
                      ).toFixed(1)
                    : '0.0';

            this._gameOverStatsList.innerHTML = `
                <li>Fruits sliced: <span>${gameData.fruitsSliced}</span></li>
                <li>Max combo: <span>${gameData.maxCombo}x</span></li>
                <li>Bombs hit: <span>${gameData.bombsHit}</span></li>
                <li>Accuracy: <span>${accuracy}%</span></li>
            `;
        }
    }
}

export default UIManager;
