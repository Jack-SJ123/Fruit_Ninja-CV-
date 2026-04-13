/**
 * GestureClassifier - MLP-based gesture classification with rule-based fallback.
 * Module 1: Hand Tracking & Gesture ML
 * Author: Jason Niu
 *
 * Architecture: Input(126) -> Dense(64, ReLU) -> Dense(32, ReLU) -> Dense(4, Softmax)
 * Gestures:  0='slash', 1='idle', 2='grab', 3='open_palm'
 */

const GESTURES = ['slash', 'idle', 'grab', 'open_palm'];
const INPUT_DIM = 126;
const HIDDEN1 = 64;
const HIDDEN2 = 32;
const OUTPUT_DIM = 4;
const HISTORY_SIZE = 3; // reduced from 5 for faster response

class GestureClassifier {
  constructor() {
    this._weightsLoaded = false;

    // MLP parameters
    this._w1 = null; // [INPUT_DIM x HIDDEN1]
    this._b1 = null; // [HIDDEN1]
    this._w2 = null; // [HIDDEN1 x HIDDEN2]
    this._b2 = null; // [HIDDEN2]
    this._w3 = null; // [HIDDEN2 x OUTPUT_DIM]
    this._b3 = null; // [OUTPUT_DIM]

    // Temporal smoothing history
    this._history = [[], []];

    this._initDefaultWeights();
  }

  /**
   * Load pre-trained weights from a JSON object.
   * Expected shape: { w1, b1, w2, b2, w3, b3 } as nested arrays.
   * @param {object} weightsJSON
   */
  loadWeights(weightsJSON) {
    this._w1 = weightsJSON.w1.map((row) => Float32Array.from(row));
    this._b1 = Float32Array.from(weightsJSON.b1);
    this._w2 = weightsJSON.w2.map((row) => Float32Array.from(row));
    this._b2 = Float32Array.from(weightsJSON.b2);
    this._w3 = weightsJSON.w3.map((row) => Float32Array.from(row));
    this._b3 = Float32Array.from(weightsJSON.b3);
    this._weightsLoaded = true;
  }

  /**
   * Classify the 126-dim feature vector.
   * @param {Float32Array} features - 126-dimensional input
   * @param {number} handIndex
   * @returns {{ gesture: string, confidence: number, probabilities: object }}
   */
  predict(features, handIndex = 0) {
    let probabilities;

    if (this._weightsLoaded) {
      probabilities = this._forwardPass(features);
    } else {
      // Use rule-based heuristics as fallback
      probabilities = this._ruleBased(features);
    }

    // Find best class
    let bestIdx = 0;
    for (let i = 1; i < OUTPUT_DIM; i++) {
      if (probabilities[i] > probabilities[bestIdx]) bestIdx = i;
    }

    const raw = {
      gesture: GESTURES[bestIdx],
      confidence: probabilities[bestIdx],
      probabilities: {}
    };
    for (let i = 0; i < OUTPUT_DIM; i++) {
      raw.probabilities[GESTURES[i]] = probabilities[i];
    }

    // Temporal smoothing via majority vote
    const history = this._history[handIndex];
    history.push(raw.gesture);
    if (history.length > HISTORY_SIZE) history.shift();

    const smoothed = this._majorityVote(history);

    return {
      gesture: smoothed,
      confidence: raw.gesture === smoothed ? raw.confidence : raw.probabilities[smoothed] || raw.confidence,
      probabilities: raw.probabilities
    };
  }

  // ---- MLP forward pass ----

  _forwardPass(input) {
    const h1 = this._denseRelu(input, this._w1, this._b1, HIDDEN1);
    const h2 = this._denseRelu(h1, this._w2, this._b2, HIDDEN2);
    return this._denseSoftmax(h2, this._w3, this._b3, OUTPUT_DIM);
  }

  _denseRelu(input, weights, bias, outSize) {
    const out = new Float32Array(outSize);
    for (let j = 0; j < outSize; j++) {
      let sum = bias[j];
      const w = weights[j];
      for (let i = 0; i < input.length; i++) {
        sum += input[i] * w[i];
      }
      out[j] = sum > 0 ? sum : 0; // ReLU
    }
    return out;
  }

  _denseSoftmax(input, weights, bias, outSize) {
    const logits = new Float32Array(outSize);
    let maxLogit = -Infinity;
    for (let j = 0; j < outSize; j++) {
      let sum = bias[j];
      const w = weights[j];
      for (let i = 0; i < input.length; i++) {
        sum += input[i] * w[i];
      }
      logits[j] = sum;
      if (sum > maxLogit) maxLogit = sum;
    }

    // Numerically stable softmax
    let expSum = 0;
    const probs = new Float32Array(outSize);
    for (let j = 0; j < outSize; j++) {
      probs[j] = Math.exp(logits[j] - maxLogit);
      expSum += probs[j];
    }
    for (let j = 0; j < outSize; j++) {
      probs[j] /= expSum;
    }
    return probs;
  }

  // ---- Rule-based fallback ----

  _ruleBased(features) {
    // features layout: [0..62] position, [63..125] velocity
    // Position features are normalized to [-1,1], likewise velocity.

    // Compute average velocity magnitude from the velocity half
    let velSum = 0;
    for (let i = 63; i < 126; i++) {
      velSum += features[i] * features[i];
    }
    const velMag = Math.sqrt(velSum / 63);

    // Compute finger extension: tips vs MCP joints (relative to wrist)
    // Finger tips: landmarks 4,8,12,16,20 -> indices in position features
    // MCP joints: landmarks 2,5,9,13,17
    const tipIndices = [4, 8, 12, 16, 20];
    const mcpIndices = [2, 5, 9, 13, 17];

    let extensionScore = 0;
    for (let f = 0; f < 5; f++) {
      const tipBase = 3 + (tipIndices[f] - 1) * 3;
      const mcpBase = 3 + (mcpIndices[f] - 1) * 3;
      // Distance of tip from wrist vs MCP from wrist (in relative coords)
      const tipDist = Math.sqrt(
        features[tipBase] ** 2 + features[tipBase + 1] ** 2 + features[tipBase + 2] ** 2
      );
      const mcpDist = Math.sqrt(
        features[mcpBase] ** 2 + features[mcpBase + 1] ** 2 + features[mcpBase + 2] ** 2
      );
      extensionScore += tipDist - mcpDist;
    }
    extensionScore /= 5; // average per finger

    // Compute finger spread: average distance between adjacent fingertips
    let spreadScore = 0;
    for (let f = 0; f < 4; f++) {
      const t1 = 3 + (tipIndices[f] - 1) * 3;
      const t2 = 3 + (tipIndices[f + 1] - 1) * 3;
      const dx = features[t1] - features[t2];
      const dy = features[t1 + 1] - features[t2 + 1];
      spreadScore += Math.sqrt(dx * dx + dy * dy);
    }
    spreadScore /= 4;

    // Score each gesture - tuned for responsiveness
    const scores = new Float32Array(OUTPUT_DIM);

    // slash: any noticeable velocity triggers slash (lowered threshold)
    scores[0] = Math.min(velMag * 5.0, 4.0);

    // idle: only when barely moving
    scores[1] = Math.max(0, 1.0 - velMag * 6.0);

    // grab: fingers curled (low extension), low velocity
    scores[2] = Math.max(0, 0.6 - extensionScore * 2.5) + Math.max(0, 0.3 - velMag);

    // open_palm: fingers extended and spread, low velocity
    scores[3] = Math.max(0, extensionScore * 2.5) + spreadScore * 2.5 + Math.max(0, 0.4 - velMag * 1.5);

    // Softmax over scores
    let maxS = -Infinity;
    for (let i = 0; i < OUTPUT_DIM; i++) {
      if (scores[i] > maxS) maxS = scores[i];
    }
    let expSum = 0;
    const probs = new Float32Array(OUTPUT_DIM);
    for (let i = 0; i < OUTPUT_DIM; i++) {
      probs[i] = Math.exp(scores[i] - maxS);
      expSum += probs[i];
    }
    for (let i = 0; i < OUTPUT_DIM; i++) {
      probs[i] /= expSum;
    }
    return probs;
  }

  // ---- Temporal smoothing ----

  _majorityVote(history) {
    if (!history || history.length === 0) return 'idle';

    const counts = {};
    for (const g of history) {
      counts[g] = (counts[g] || 0) + 1;
    }
    let best = history[history.length - 1];
    let bestCount = 0;
    for (const g in counts) {
      if (counts[g] > bestCount) {
        bestCount = counts[g];
        best = g;
      }
    }
    return best;
  }

  // ---- Default weight initialization ----

  _initDefaultWeights() {
    // Small random weights using a simple seeded LCG for reproducibility
    let seed = 42;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
      return (seed / 0x7fffffff - 0.5) * 0.1; // small values in [-0.05, 0.05]
    };

    this._w1 = Array.from({ length: HIDDEN1 }, () => {
      const row = new Float32Array(INPUT_DIM);
      for (let i = 0; i < INPUT_DIM; i++) row[i] = rand();
      return row;
    });
    this._b1 = new Float32Array(HIDDEN1);

    this._w2 = Array.from({ length: HIDDEN2 }, () => {
      const row = new Float32Array(HIDDEN1);
      for (let i = 0; i < HIDDEN1; i++) row[i] = rand();
      return row;
    });
    this._b2 = new Float32Array(HIDDEN2);

    this._w3 = Array.from({ length: OUTPUT_DIM }, () => {
      const row = new Float32Array(HIDDEN2);
      for (let i = 0; i < HIDDEN2; i++) row[i] = rand();
      return row;
    });
    this._b3 = new Float32Array(OUTPUT_DIM);
  }
}

export default GestureClassifier;
