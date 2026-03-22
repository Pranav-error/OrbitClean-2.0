"""
ML-3a: YOLOv8 Fine-tuning on TACO Dataset
Fine-tune YOLOv8n (nano) on TACO trash annotations for waste classification.

Usage:
    python train_yolo.py --download   # Download TACO dataset
    python train_yolo.py --train      # Start training
    python train_yolo.py --demo       # Show training config only

TACO dataset: http://tacodataset.org (free, no account needed)
"""

import os
import json
import argparse

TACO_CLASSES = [
    'Aluminium foil', 'Battery', 'Blister pack', 'Bottle', 'Bottle cap',
    'Broken glass', 'Can', 'Carton', 'Cup', 'Drink can',
    'Drink carton', 'Egg carton', 'Film', 'Foam', 'Food waste',
    'Garbage bag', 'Glass jar', 'Lid', 'Magazine', 'Metal',
    'Paper', 'Paper bag', 'Plastic bag', 'Plastic container', 'Rope',
    'Scrap metal', 'Shoe', 'Squeezable tube', 'Straw', 'Tin',
    'Toilet tube', 'Unlabeled litter', 'Wrapper',
]

# Map TACO classes → SWM Rules 2026 streams
SWM_MAP = {
    'Aluminium foil': 'Dry/Blue', 'Battery': 'Hazardous/Black',
    'Blister pack': 'Hazardous/Black', 'Bottle': 'Dry/Blue',
    'Bottle cap': 'Dry/Blue', 'Broken glass': 'Hazardous/Black',
    'Can': 'Dry/Blue', 'Carton': 'Dry/Blue', 'Cup': 'Dry/Blue',
    'Drink can': 'Dry/Blue', 'Drink carton': 'Dry/Blue',
    'Egg carton': 'Dry/Blue', 'Film': 'Dry/Blue', 'Foam': 'Dry/Blue',
    'Food waste': 'Wet/Green', 'Garbage bag': 'Sanitary/Red',
    'Glass jar': 'Dry/Blue', 'Lid': 'Dry/Blue', 'Magazine': 'Dry/Blue',
    'Metal': 'Dry/Blue', 'Paper': 'Dry/Blue', 'Paper bag': 'Dry/Blue',
    'Plastic bag': 'Dry/Blue', 'Plastic container': 'Dry/Blue',
    'Rope': 'Dry/Blue', 'Scrap metal': 'Dry/Blue', 'Shoe': 'Dry/Blue',
    'Squeezable tube': 'Sanitary/Red', 'Straw': 'Dry/Blue', 'Tin': 'Dry/Blue',
    'Toilet tube': 'Sanitary/Red', 'Unlabeled litter': 'Dry/Blue', 'Wrapper': 'Dry/Blue',
}

YOLO_CONFIG = """
# OrbitClean TACO YOLOv8 Training Config
path: ./data/taco
train: images/train
val: images/val
nc: {nc}
names: {names}
""".format(nc=len(TACO_CLASSES), names=TACO_CLASSES)


def download_taco():
    """Download TACO dataset annotations and images."""
    try:
        import subprocess
        print("[TACO] Downloading TACO dataset...")
        os.makedirs("data/taco", exist_ok=True)

        # TACO annotations (JSON)
        subprocess.run([
            "wget", "-q", "-O", "data/taco/annotations.json",
            "https://raw.githubusercontent.com/pedropro/TACO/master/data/annotations.json"
        ], check=True)
        print("[TACO] Annotations downloaded.")

        # Download images via TACO download script
        subprocess.run([
            "python", "-c",
            "import subprocess; subprocess.run(['git', 'clone', '--depth=1', "
            "'https://github.com/pedropro/TACO.git', 'taco_repo'], check=True)"
        ])
        print("[TACO] Run: cd taco_repo && python download.py")
    except Exception as e:
        print(f"[WARN] Download failed: {e}")
        print("Manual download: https://github.com/pedropro/TACO#dataset")


def convert_coco_to_yolo(annotations_json, output_dir):
    """Convert TACO COCO-format annotations to YOLO format."""
    with open(annotations_json) as f:
        coco = json.load(f)

    os.makedirs(f"{output_dir}/labels/train", exist_ok=True)
    os.makedirs(f"{output_dir}/labels/val",   exist_ok=True)

    cat_id_to_idx = {c['id']: i for i, c in enumerate(coco['categories'])}
    img_id_to_info = {img['id']: img for img in coco['images']}

    for ann in coco['annotations']:
        img = img_id_to_info[ann['image_id']]
        w, h = img['width'], img['height']
        x, y, bw, bh = ann['bbox']
        cx = (x + bw/2) / w
        cy = (y + bh/2) / h
        nw = bw / w
        nh = bh / h
        cls = cat_id_to_idx.get(ann['category_id'], 0)
        label_file = f"{output_dir}/labels/train/{img['id']:012d}.txt"
        with open(label_file, 'a') as lf:
            lf.write(f"{cls} {cx:.6f} {cy:.6f} {nw:.6f} {nh:.6f}\n")

    # Write yaml
    yaml_content = YOLO_CONFIG
    with open(f"{output_dir}/taco.yaml", 'w') as f:
        f.write(yaml_content)
    print(f"[YOLO] Converted annotations → {output_dir}/labels/")


def train_yolo(data_yaml="data/taco/taco.yaml", epochs=50, img_size=640, batch=16):
    try:
        from ultralytics import YOLO
    except ImportError:
        print("[ERROR] ultralytics not installed. Run: pip install ultralytics")
        return

    print(f"[YOLO] Starting fine-tune: epochs={epochs}, img={img_size}, batch={batch}")
    model = YOLO('yolov8n.pt')   # download pretrained nano weights
    results = model.train(
        data=data_yaml,
        epochs=epochs,
        imgsz=img_size,
        batch=batch,
        name='orbitclean_taco',
        project='ml/models',
        patience=10,
        device='cpu',            # change to '0' if CUDA GPU available
        verbose=True,
    )
    print(f"[YOLO] Training complete. Model saved to ml/models/orbitclean_taco/")
    return results


def run_demo():
    print("[DEMO] YOLOv8 Training Configuration")
    print("=" * 50)
    print(f"Base model:    YOLOv8n (nano) — 3.2M params, fastest inference")
    print(f"Dataset:       TACO (Trash Annotations in Context)")
    print(f"Classes:       {len(TACO_CLASSES)} waste categories")
    print(f"Target device: CPU (CUDA optional)")
    print(f"Epochs:        50 (fine-tune on pretrained COCO weights)")
    print(f"Image size:    640×640")
    print()
    print("SWM stream mapping:")
    streams = {}
    for cls, stream in SWM_MAP.items():
        streams.setdefault(stream, []).append(cls)
    for stream, classes in streams.items():
        print(f"  {stream}: {', '.join(classes[:4])}{'...' if len(classes)>4 else ''}")
    print()
    print("To train:")
    print("  pip install ultralytics")
    print("  python train_yolo.py --download")
    print("  python train_yolo.py --train")


def main():
    parser = argparse.ArgumentParser(description="YOLOv8 TACO Trainer")
    parser.add_argument("--download", action="store_true")
    parser.add_argument("--convert",  help="Path to TACO annotations.json")
    parser.add_argument("--train",    action="store_true")
    parser.add_argument("--epochs",   type=int, default=50)
    parser.add_argument("--demo",     action="store_true")
    args = parser.parse_args()

    if args.demo:
        run_demo(); return
    if args.download:
        download_taco()
    if args.convert:
        convert_coco_to_yolo(args.convert, "data/taco")
    if args.train:
        train_yolo(epochs=args.epochs)
    if not any([args.download, args.convert, args.train]):
        run_demo()


if __name__ == "__main__":
    main()
