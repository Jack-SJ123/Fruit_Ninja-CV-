"""
Gesture Classifier Training Script (PyTorch)
Module 1 - Jason Niu

Trains an MLP to classify hand gestures from MediaPipe landmarks.
Input: 126-dim feature vector (63 position + 63 velocity)
Output: 4 classes (slash, idle, grab, open_palm)

Usage:
    python scripts/train_gesture_model.py --data gesture_data/ --epochs 50 --output src/assets/gesture_weights.json
"""

import argparse
import json
import os
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader, random_split


GESTURE_CLASSES = ['slash', 'idle', 'grab', 'open_palm']
INPUT_DIM = 126
HIDDEN1 = 64
HIDDEN2 = 32
OUTPUT_DIM = 4


class GestureMLP(nn.Module):
    def __init__(self):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(INPUT_DIM, HIDDEN1),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(HIDDEN1, HIDDEN2),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(HIDDEN2, OUTPUT_DIM)
        )

    def forward(self, x):
        return self.net(x)


class GestureDataset(Dataset):
    def __init__(self, features, labels):
        self.features = torch.FloatTensor(features)
        self.labels = torch.LongTensor(labels)

    def __len__(self):
        return len(self.labels)

    def __getitem__(self, idx):
        return self.features[idx], self.labels[idx]


def load_data(data_dir: str):
    """Load gesture data from directory structure:
    gesture_data/
        slash/      -> .npy files with 126-dim feature vectors
        idle/
        grab/
        open_palm/
    """
    features = []
    labels = []

    for class_idx, class_name in enumerate(GESTURE_CLASSES):
        class_dir = os.path.join(data_dir, class_name)
        if not os.path.exists(class_dir):
            print(f"Warning: {class_dir} not found, skipping")
            continue

        for f in os.listdir(class_dir):
            if f.endswith('.npy'):
                data = np.load(os.path.join(class_dir, f))
                if data.ndim == 1:
                    data = data.reshape(1, -1)
                features.append(data)
                labels.extend([class_idx] * len(data))

    if not features:
        return None, None
    return np.vstack(features), np.array(labels)


def generate_synthetic_data(samples_per_class: int = 500) -> tuple:
    """Generate synthetic training data based on gesture heuristics."""
    features = []
    labels = []

    for _ in range(samples_per_class):
        # SLASH: high velocity, directional movement
        f = np.random.randn(INPUT_DIM).astype(np.float32) * 0.1
        f[63:] = np.random.randn(63) * 0.8  # high velocity
        f[63] = np.random.choice([-1, 1]) * (0.5 + np.random.rand() * 0.5)
        features.append(f)
        labels.append(0)

        # IDLE: low velocity, neutral position
        f = np.random.randn(INPUT_DIM).astype(np.float32) * 0.05
        f[63:] *= 0.1  # very low velocity
        features.append(f)
        labels.append(1)

        # GRAB: fingers curled toward palm (negative z spread)
        f = np.random.randn(INPUT_DIM).astype(np.float32) * 0.1
        # Fingertip z-values closer to palm
        for finger_tip_idx in [4, 8, 12, 16, 20]:
            base = (finger_tip_idx - 1) * 3
            if base + 2 < 63:
                f[base + 2] = -0.3 + np.random.randn() * 0.1  # z pulled in
        f[63:] *= 0.2
        features.append(f)
        labels.append(2)

        # OPEN_PALM: fingers spread, extended
        f = np.random.randn(INPUT_DIM).astype(np.float32) * 0.1
        for finger_tip_idx in [4, 8, 12, 16, 20]:
            base = (finger_tip_idx - 1) * 3
            if base + 1 < 63:
                f[base + 1] = -0.4 + np.random.randn() * 0.1  # y extended up
                f[base] = (finger_tip_idx - 12) * 0.08  # x spread out
        f[63:] *= 0.15
        features.append(f)
        labels.append(3)

    return np.array(features), np.array(labels)


def export_weights_to_json(model: GestureMLP, output_path: str):
    """Export PyTorch model weights to JSON for browser inference."""
    weights = {}
    state = model.state_dict()

    layer_map = {
        'net.0.weight': 'w1', 'net.0.bias': 'b1',
        'net.3.weight': 'w2', 'net.3.bias': 'b2',
        'net.6.weight': 'w3', 'net.6.bias': 'b3',
    }

    for key, name in layer_map.items():
        weights[name] = state[key].cpu().numpy().tolist()

    weights['meta'] = {
        'input_dim': INPUT_DIM,
        'hidden1': HIDDEN1,
        'hidden2': HIDDEN2,
        'output_dim': OUTPUT_DIM,
        'classes': GESTURE_CLASSES
    }

    os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
    with open(output_path, 'w') as f:
        json.dump(weights, f)
    print(f"Weights exported to {output_path}")


def train(args):
    # Load or generate data
    if args.data and os.path.exists(args.data):
        features, labels = load_data(args.data)
        if features is None:
            print("No .npy data found, using synthetic data")
            features, labels = generate_synthetic_data()
    else:
        print("No data directory provided, generating synthetic training data...")
        features, labels = generate_synthetic_data(args.synthetic_samples)

    print(f"Dataset: {len(labels)} samples, {len(GESTURE_CLASSES)} classes")
    for i, name in enumerate(GESTURE_CLASSES):
        print(f"  {name}: {(labels == i).sum()} samples")

    dataset = GestureDataset(features, labels)
    train_size = int(0.8 * len(dataset))
    val_size = len(dataset) - train_size
    train_set, val_set = random_split(dataset, [train_size, val_size])

    train_loader = DataLoader(train_set, batch_size=args.batch_size, shuffle=True)
    val_loader = DataLoader(val_set, batch_size=args.batch_size)

    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    model = GestureMLP().to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, patience=5, factor=0.5)

    best_val_acc = 0
    for epoch in range(args.epochs):
        # Train
        model.train()
        train_loss = 0
        for batch_x, batch_y in train_loader:
            batch_x, batch_y = batch_x.to(device), batch_y.to(device)
            optimizer.zero_grad()
            out = model(batch_x)
            loss = criterion(out, batch_y)
            loss.backward()
            optimizer.step()
            train_loss += loss.item()

        # Validate
        model.eval()
        correct = 0
        total = 0
        val_loss = 0
        with torch.no_grad():
            for batch_x, batch_y in val_loader:
                batch_x, batch_y = batch_x.to(device), batch_y.to(device)
                out = model(batch_x)
                val_loss += criterion(out, batch_y).item()
                _, pred = out.max(1)
                correct += (pred == batch_y).sum().item()
                total += batch_y.size(0)

        val_acc = correct / total if total > 0 else 0
        scheduler.step(val_loss)

        if (epoch + 1) % 5 == 0 or epoch == 0:
            print(f"Epoch {epoch+1}/{args.epochs} - "
                  f"Train Loss: {train_loss/len(train_loader):.4f}, "
                  f"Val Loss: {val_loss/len(val_loader):.4f}, "
                  f"Val Acc: {val_acc:.4f}")

        if val_acc > best_val_acc:
            best_val_acc = val_acc
            best_state = model.state_dict().copy()

    model.load_state_dict(best_state)
    print(f"\nBest validation accuracy: {best_val_acc:.4f}")
    export_weights_to_json(model, args.output)


def main():
    parser = argparse.ArgumentParser(description='Train gesture classifier')
    parser.add_argument('--data', type=str, default=None,
                        help='Path to gesture data directory')
    parser.add_argument('--epochs', type=int, default=50)
    parser.add_argument('--batch-size', type=int, default=32)
    parser.add_argument('--lr', type=float, default=0.001)
    parser.add_argument('--synthetic-samples', type=int, default=500,
                        help='Samples per class for synthetic data')
    parser.add_argument('--output', type=str,
                        default='src/assets/gesture_weights.json',
                        help='Output path for exported weights JSON')
    args = parser.parse_args()
    train(args)


if __name__ == '__main__':
    main()
