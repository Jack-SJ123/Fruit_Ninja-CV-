/**
 * GameState.js - State machine managing game states
 * Module 3: UI/UX & Game State
 * Author: Angel Daniel Bustamante Perez
 *
 * Manages all game state transitions and tracks game data including
 * score, time, combos, lives, and statistics.
 */

const VALID_STATES = ['loading', 'menu', 'countdown', 'playing', 'paused', 'gameover'];

const VALID_TRANSITIONS = {
    loading:   ['menu'],
    menu:      ['countdown'],
    countdown: ['playing'],
    playing:   ['paused', 'gameover'],
    paused:    ['playing', 'gameover'],
    gameover:  ['menu', 'countdown'],
};

const INITIAL_GAME_DATA = {
    score: 0,
    timeRemaining: 60,
    combo: 0,
    maxCombo: 0,
    fruitsSliced: 0,
    bombsHit: 0,
    lives: 5,
    comboMultiplier: 1,
    highScore: 0,
};

const MAX_COMBO_MULTIPLIER = 3;
const COMBO_THRESHOLDS = [0, 3, 6]; // hits needed for 1x, 2x, 3x

class GameState {
    constructor() {
        this._state = 'loading';
        this._data = { ...INITIAL_GAME_DATA };
        this._stateChangeCallbacks = [];
        this._gameEventCallbacks = [];

        // Load Persistent High Score
        const saved = localStorage.getItem('fn_high_score');
        if (saved) {
            this._data.highScore = parseInt(saved, 10) || 0;
            INITIAL_GAME_DATA.highScore = this._data.highScore;
        }
    }

    /**
     * Transition to a new state if the transition is valid.
     * @param {string} newState - The target state.
     * @returns {boolean} Whether the transition succeeded.
     */
    transition(newState) {
        if (!VALID_STATES.includes(newState)) {
            console.warn(`[GameState] Invalid state: "${newState}"`);
            return false;
        }

        const allowed = VALID_TRANSITIONS[this._state];
        if (!allowed || !allowed.includes(newState)) {
            console.warn(
                `[GameState] Invalid transition: "${this._state}" -> "${newState}"`
            );
            return false;
        }

        const prevState = this._state;
        this._state = newState;

        // Reset game data when starting a new round
        if (newState === 'countdown') {
            this._resetData();
        }

        this._notifyStateChange(prevState, newState);
        return true;
    }

    /**
     * Get the current state.
     * @returns {string}
     */
    getState() {
        return this._state;
    }

    /**
     * Get a shallow copy of the current game data.
     * @returns {object}
     */
    getData() {
        return { ...this._data };
    }

    /**
     * Reset the game state back to the menu with fresh data.
     */
    reset() {
        this._state = 'menu';
        this._resetData();
        this._notifyStateChange('reset', 'menu');
    }

    /**
     * Add points to the score, applying the current combo multiplier.
     * @param {number} points - Base points to add.
     */
    updateScore(points) {
        if (this._state !== 'playing') return;

        const gained = points * this._data.comboMultiplier;
        this._data.score += gained;
        this._data.fruitsSliced += 1;

        if (this._data.score > this._data.highScore) {
            this._data.highScore = this._data.score;
            localStorage.setItem('fn_high_score', this._data.highScore.toString());
        }

        this._emitGameEvent('scoreChange', {
            points: gained,
            basePoints: points,
            multiplier: this._data.comboMultiplier,
            totalScore: this._data.score,
        });
    }

    /**
     * Update the remaining time by subtracting dt (in seconds).
     * Triggers game over when time runs out.
     * @param {number} dt - Elapsed time in seconds.
     */
    updateTime(dt) {
        if (this._state !== 'playing') return;

        this._data.timeRemaining = Math.max(0, this._data.timeRemaining - dt);

        if (this._data.timeRemaining <= 0) {
            this._data.timeRemaining = 0;
            this.transition('gameover');
        }
    }

    /**
     * Increment the combo counter and recalculate the multiplier.
     */
    addCombo() {
        if (this._state !== 'playing') return;

        this._data.combo += 1;

        if (this._data.combo > this._data.maxCombo) {
            this._data.maxCombo = this._data.combo;
        }

        // Determine multiplier based on thresholds
        let newMultiplier = 1;
        for (let i = COMBO_THRESHOLDS.length - 1; i >= 0; i--) {
            if (this._data.combo >= COMBO_THRESHOLDS[i]) {
                newMultiplier = i + 1;
                break;
            }
        }
        newMultiplier = Math.min(newMultiplier, MAX_COMBO_MULTIPLIER);

        const prevMultiplier = this._data.comboMultiplier;
        this._data.comboMultiplier = newMultiplier;

        if (newMultiplier > prevMultiplier) {
            this._emitGameEvent('comboUp', {
                multiplier: newMultiplier,
                combo: this._data.combo,
            });
        }

        this._emitGameEvent('combo', {
            combo: this._data.combo,
            multiplier: this._data.comboMultiplier,
        });
    }

    /**
     * Reset the combo counter and multiplier back to baseline.
     */
    resetCombo() {
        if (this._state !== 'playing') return;

        this._data.combo = 0;
        this._data.comboMultiplier = 1;

        this._emitGameEvent('comboReset', { combo: 0, multiplier: 1 });
    }

    /**
     * Lose one life (e.g., from hitting a bomb). Triggers game over
     * when lives reach 0.
     */
    loseLife() {
        if (this._state !== 'playing') return;

        this._data.lives = Math.max(0, this._data.lives - 1);
        this._data.bombsHit += 1;

        this._emitGameEvent('lifeLost', {
            livesRemaining: this._data.lives,
            bombsHit: this._data.bombsHit,
        });

        if (this._data.lives <= 0) {
            this.transition('gameover');
        }
    }

    /**
     * Register a callback for state changes.
     * @param {function} callback - Called with (prevState, newState).
     * @returns {function} Unsubscribe function.
     */
    onStateChange(callback) {
        this._stateChangeCallbacks.push(callback);
        return () => {
            this._stateChangeCallbacks = this._stateChangeCallbacks.filter(
                (cb) => cb !== callback
            );
        };
    }

    /**
     * Register a callback for game events (score, combo, life lost, etc.).
     * @param {function} callback - Called with (eventName, eventData).
     * @returns {function} Unsubscribe function.
     */
    onGameEvent(callback) {
        this._gameEventCallbacks.push(callback);
        return () => {
            this._gameEventCallbacks = this._gameEventCallbacks.filter(
                (cb) => cb !== callback
            );
        };
    }

    // ---- Private helpers ----

    _resetData() {
        this._data = { ...INITIAL_GAME_DATA };
    }

    _notifyStateChange(prevState, newState) {
        for (const cb of this._stateChangeCallbacks) {
            try {
                cb(prevState, newState);
            } catch (err) {
                console.error('[GameState] State change callback error:', err);
            }
        }
    }

    _emitGameEvent(eventName, eventData) {
        for (const cb of this._gameEventCallbacks) {
            try {
                cb(eventName, eventData);
            } catch (err) {
                console.error('[GameState] Game event callback error:', err);
            }
        }
    }
}

export default GameState;
