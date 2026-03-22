"""
Fine-tune MobileNetV3 for waste scene classification.
Uses real Thanisandra dump site images + augmentation.

Usage:
    # With just the 2 real photos (trains a binary waste detector):
    python ml/train_waste_classifier.py --images data/waste_images/ --epochs 20

    # With TrashNet (when disk space available):
    python ml/train_waste_classifier.py --trashnet --epochs 30
"""

import os, sys, argparse, json, random
from pathlib import Path
from io import BytesIO
import torch
import torchvision.models as models
import torchvision.transforms as T
from torch import nn, optim
from torch.utils.data import Dataset, DataLoader
from PIL import Image

DEVICE = (
    torch.device("mps") if torch.backends.mps.is_available()
    else torch.device("cuda") if torch.cuda.is_available()
    else torch.device("cpu")
)

# 4-class SWM stream mapping (same as classifier_api.py)
CLASSES = ["Wet/Green", "Dry/Blue", "Sanitary/Red", "Hazardous/Black", "No Waste"]
SWM_STREAM = {
    0: "Wet/Green",
    1: "Dry/Blue",
    2: "Sanitary/Red",
    3: "Hazardous/Black",
    4: None,  # clean scene
}

# ── Augmentation pipeline ─────────────────────────────────────────────────────

TRAIN_TRANSFORMS = T.Compose([
    T.Resize((256, 256)),
    T.RandomCrop(224),
    T.RandomHorizontalFlip(),
    T.RandomVerticalFlip(p=0.2),
    T.ColorJitter(brightness=0.4, contrast=0.4, saturation=0.3, hue=0.1),
    T.RandomRotation(15),
    T.RandomGrayscale(p=0.05),
    T.ToTensor(),
    T.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
])

VAL_TRANSFORMS = T.Compose([
    T.Resize((224, 224)),
    T.ToTensor(),
    T.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
])


class WasteDataset(Dataset):
    """
    Expects directory structure:
        waste_images/
            wet_green/    ← organic, food waste, vegetable waste
            dry_blue/     ← plastic, paper, metal, cardboard
            sanitary_red/ ← tissue, diaper
            hazardous/    ← battery, electronic
            no_waste/     ← clean scenes (roads, buildings, grass)
    """
    LABEL_MAP = {
        "wet_green": 0, "dry_blue": 1, "sanitary_red": 2,
        "hazardous": 3, "no_waste": 4,
    }

    def __init__(self, root, transform=None, augment_factor=20):
        self.samples = []
        self.transform = transform
        root = Path(root)
        for folder, label in self.LABEL_MAP.items():
            folder_path = root / folder
            if not folder_path.exists():
                continue
            imgs = list(folder_path.glob("*.jpg")) + list(folder_path.glob("*.jpeg")) + \
                   list(folder_path.glob("*.png"))
            for img_path in imgs:
                # Augment: add the same image multiple times (transforms are random)
                repeat = augment_factor if len(imgs) <= 10 else 1
                for _ in range(repeat):
                    self.samples.append((str(img_path), label))
        random.shuffle(self.samples)
        print(f"  Dataset: {len(self.samples)} samples from {root}")

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        path, label = self.samples[idx]
        img = Image.open(path).convert("RGB")
        if self.transform:
            img = self.transform(img)
        return img, label


def build_model(num_classes=5, freeze_backbone=True):
    """MobileNetV3-small with custom head."""
    weights = models.MobileNet_V3_Small_Weights.IMAGENET1K_V1
    model = models.mobilenet_v3_small(weights=weights)
    if freeze_backbone:
        for p in model.features.parameters():
            p.requires_grad = False
    # Replace classifier head
    in_features = model.classifier[3].in_features
    model.classifier[3] = nn.Linear(in_features, num_classes)
    return model


def train(model, loader, optimizer, criterion):
    model.train()
    total_loss, correct = 0, 0
    for imgs, labels in loader:
        imgs, labels = imgs.to(DEVICE), labels.to(DEVICE)
        optimizer.zero_grad()
        out = model(imgs)
        loss = criterion(out, labels)
        loss.backward()
        optimizer.step()
        total_loss += loss.item()
        correct += (out.argmax(1) == labels).sum().item()
    return total_loss / len(loader), correct / len(loader.dataset)


def evaluate(model, loader, criterion):
    model.eval()
    total_loss, correct = 0, 0
    with torch.no_grad():
        for imgs, labels in loader:
            imgs, labels = imgs.to(DEVICE), labels.to(DEVICE)
            out = model(imgs)
            total_loss += criterion(out, labels).item()
            correct += (out.argmax(1) == labels).sum().item()
    return total_loss / len(loader), correct / len(loader.dataset)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--images", default="data/waste_images",
                        help="Root folder with class subdirectories")
    parser.add_argument("--epochs", type=int, default=25)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--batch", type=int, default=8)
    parser.add_argument("--out", default="ml/models/waste_classifier.pt")
    parser.add_argument("--trashnet", action="store_true",
                        help="Download TrashNet from HuggingFace (needs ~7GB free)")
    args = parser.parse_args()

    if args.trashnet:
        print("[TrashNet] Downloading from HuggingFace...")
        from datasets import load_dataset
        ds = load_dataset("garythung/trashnet", split="train", trust_remote_code=True)
        # Map TrashNet labels to our SWM streams
        trashnet_map = {
            "cardboard": ("dry_blue", 1),
            "glass": ("dry_blue", 1),
            "metal": ("dry_blue", 1),
            "paper": ("dry_blue", 1),
            "plastic": ("dry_blue", 1),
            "trash": ("dry_blue", 1),  # mixed → Dry/Blue
        }
        out_root = Path("data/waste_images")
        for folder in ["wet_green","dry_blue","sanitary_red","hazardous","no_waste"]:
            (out_root / folder).mkdir(parents=True, exist_ok=True)
        for i, sample in enumerate(ds):
            label_name = ds.features["label"].names[sample["label"]]
            folder_name, _ = trashnet_map.get(label_name, ("dry_blue", 1))
            img = sample["image"]
            img.save(out_root / folder_name / f"trashnet_{i:05d}.jpg")
            if i % 200 == 0:
                print(f"  Saved {i}/{len(ds)}")
        print(f"  Saved {len(ds)} images to {out_root}")
        args.images = str(out_root)

    print(f"[Train] Loading data from {args.images}...")
    print(f"[Train] Device: {DEVICE}")

    dataset = WasteDataset(args.images, transform=TRAIN_TRANSFORMS, augment_factor=30)
    if len(dataset) == 0:
        print("[ERROR] No images found. Create folders:")
        print("  data/waste_images/dry_blue/    ← add plastic/paper photos")
        print("  data/waste_images/wet_green/   ← add organic waste photos")
        print("  data/waste_images/no_waste/    ← add clean scene photos")
        sys.exit(1)

    # 80/20 split
    n_val = max(1, int(0.2 * len(dataset)))
    n_train = len(dataset) - n_val
    train_ds, val_ds = torch.utils.data.random_split(dataset, [n_train, n_val])
    val_ds.dataset.transform = VAL_TRANSFORMS

    train_loader = DataLoader(train_ds, batch_size=args.batch, shuffle=True, num_workers=0)
    val_loader   = DataLoader(val_ds,   batch_size=args.batch, shuffle=False, num_workers=0)

    model = build_model(num_classes=5, freeze_backbone=True).to(DEVICE)
    optimizer = optim.AdamW(model.classifier.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)
    criterion = nn.CrossEntropyLoss()

    best_acc = 0
    os.makedirs(os.path.dirname(args.out), exist_ok=True)

    for epoch in range(1, args.epochs + 1):
        tr_loss, tr_acc = train(model, train_loader, optimizer, criterion)
        va_loss, va_acc = evaluate(model, val_loader, criterion)
        scheduler.step()
        print(f"  Epoch {epoch:3d}  train {tr_acc:.2%} {tr_loss:.3f}  val {va_acc:.2%} {va_loss:.3f}")
        if va_acc > best_acc:
            best_acc = va_acc
            torch.save({
                'model_state': model.state_dict(),
                'classes': CLASSES,
                'swm_map': SWM_STREAM,
                'val_acc': va_acc,
            }, args.out)
            print(f"    ✓ Saved (best val acc: {best_acc:.2%})")

    print(f"\n[Done] Best val acc: {best_acc:.2%} → {args.out}")
    print("Next: update classifier_api.py to load ml/models/waste_classifier.pt")


if __name__ == "__main__":
    main()
