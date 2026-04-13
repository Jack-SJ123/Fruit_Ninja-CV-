"""
Gesture Data Collection Script
Module 3 - Angel Daniel Bustamante Perez

Captures MediaPipe hand landmarks from webcam and saves them as
126-dim feature vectors (.npy) organized by gesture label.

Usage:
    python scripts/collect_gesture_data.py --gesture slash --samples 200
    python scripts/collect_gesture_data.py --gesture idle --samples 200
    python scripts/collect_gesture_data.py --gesture grab --samples 200
    python scripts/collect_gesture_data.py --gesture open_palm --samples 200

Controls:
    SPACE  - Start/stop recording
    Q/ESC  - Quit
"""

import argparse
import os
import time
import numpy as np
import cv2
import mediapipe as mp

GESTURE_CLASSES = ['slash', 'idle', 'grab', 'open_palm']


class LandmarkCollector:
    def __init__(self):
        self.mp_hands = mp.solutions.hands
        self.hands = self.mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=1,
            min_detection_confidence=0.7,
            min_tracking_confidence=0.5
        )
        self.mp_draw = mp.solutions.drawing_utils
        self.prev_landmarks = None
        self.prev_time = None

    def extract_features(self, landmarks, timestamp: float) -> np.ndarray:
        """Extract 126-dim feature vector from landmarks."""
        coords = np.array([[lm.x, lm.y, lm.z] for lm in landmarks.landmark])
        wrist = coords[0]

        # Position features: relative to wrist (63 dims)
        relative = coords - wrist
        position_features = relative.flatten()  # 21 * 3 = 63

        # Velocity features (63 dims)
        if self.prev_landmarks is not None and self.prev_time is not None:
            dt = timestamp - self.prev_time
            if dt > 0:
                prev_coords = np.array([[lm.x, lm.y, lm.z]
                                        for lm in self.prev_landmarks.landmark])
                velocity = (coords - prev_coords) / dt
            else:
                velocity = np.zeros_like(coords)
        else:
            velocity = np.zeros_like(coords)

        velocity_features = velocity.flatten()  # 21 * 3 = 63

        self.prev_landmarks = landmarks
        self.prev_time = timestamp

        # Normalize to [-1, 1]
        pos_max = np.abs(position_features).max() or 1.0
        vel_max = np.abs(velocity_features).max() or 1.0
        position_features = position_features / pos_max
        velocity_features = velocity_features / vel_max

        return np.concatenate([position_features, velocity_features]).astype(np.float32)

    def release(self):
        self.hands.close()


def main():
    parser = argparse.ArgumentParser(description='Collect gesture data')
    parser.add_argument('--gesture', type=str, required=True,
                        choices=GESTURE_CLASSES,
                        help='Gesture label to collect')
    parser.add_argument('--samples', type=int, default=200,
                        help='Number of samples to collect')
    parser.add_argument('--output', type=str, default='gesture_data',
                        help='Output directory')
    parser.add_argument('--camera', type=int, default=0,
                        help='Camera device index')
    args = parser.parse_args()

    output_dir = os.path.join(args.output, args.gesture)
    os.makedirs(output_dir, exist_ok=True)

    existing = len([f for f in os.listdir(output_dir) if f.endswith('.npy')])
    print(f"Collecting '{args.gesture}' gesture data")
    print(f"Existing samples: {existing}")
    print(f"Target: {args.samples} new samples")
    print(f"Output: {output_dir}/")
    print(f"\nPress SPACE to start/stop recording, Q to quit")

    cap = cv2.VideoCapture(args.camera)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    collector = LandmarkCollector()
    mp_draw = mp.solutions.drawing_utils
    mp_hands_style = mp.solutions.hands

    recording = False
    collected = 0
    batch_features = []

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        frame = cv2.flip(frame, 1)
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = collector.hands.process(rgb)

        status = "RECORDING" if recording else "READY (press SPACE)"
        color = (0, 0, 255) if recording else (0, 255, 0)
        cv2.putText(frame, f"Gesture: {args.gesture} | {status}",
                    (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)
        cv2.putText(frame, f"Collected: {collected}/{args.samples}",
                    (10, 65), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

        if results.multi_hand_landmarks:
            for hand_landmarks in results.multi_hand_landmarks:
                mp_draw.draw_landmarks(frame, hand_landmarks,
                                       mp_hands_style.HAND_CONNECTIONS)

                if recording and collected < args.samples:
                    features = collector.extract_features(
                        hand_landmarks, time.time()
                    )
                    batch_features.append(features)
                    collected += 1

                    if collected % 50 == 0:
                        print(f"  Collected {collected}/{args.samples}")

                    if collected >= args.samples:
                        recording = False
                        print(f"\nDone! Collected {collected} samples")

        # Progress bar
        progress = int((collected / args.samples) * 400)
        cv2.rectangle(frame, (10, 80), (410, 100), (50, 50, 50), -1)
        cv2.rectangle(frame, (10, 80), (10 + progress, 100), color, -1)

        cv2.imshow(f'Gesture Collector - {args.gesture}', frame)

        key = cv2.waitKey(1) & 0xFF
        if key == ord(' '):
            recording = not recording
            if recording:
                print("Recording started...")
                collector.prev_landmarks = None
                collector.prev_time = None
            else:
                print("Recording paused")
        elif key == ord('q') or key == 27:
            break

    # Save collected data
    if batch_features:
        batch_array = np.array(batch_features)
        timestamp = int(time.time())
        save_path = os.path.join(output_dir, f"batch_{timestamp}.npy")
        np.save(save_path, batch_array)
        print(f"\nSaved {len(batch_features)} samples to {save_path}")
        print(f"Shape: {batch_array.shape}")

    cap.release()
    cv2.destroyAllWindows()
    collector.release()


if __name__ == '__main__':
    main()
