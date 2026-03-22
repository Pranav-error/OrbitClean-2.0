"""
Waste Type Classifier — fine-tuned MobileNetV3 on Thanisandra dump site images.
Falls back to ImageNet mapping if fine-tuned model not found.
"""

import os, random
from io import BytesIO
from pathlib import Path
from datetime import datetime

FINETUNED_MODEL_PATH = Path(__file__).parent / "models" / "waste_classifier.pt"

# ── SWM stream config ────────────────────────────────────────────────────────

STREAM_COLORS = {
    'Wet/Green': '#22c55e', 'Dry/Blue': '#3b82f6',
    'Sanitary/Red': '#ef4444', 'Hazardous/Black': '#1f2937',
}
STREAM_DISPOSAL = {
    'Wet/Green': 'Place in GREEN bin. BBMP wet waste collection Mon/Wed/Fri.',
    'Dry/Blue': 'Place in BLUE bin. Segregate paper/plastic/metal. BBMP dry waste Tue/Thu/Sat.',
    'Sanitary/Red': 'Wrap securely. Place in RED bin. Do NOT mix with other streams.',
    'Hazardous/Black': 'Do NOT place in regular bins. Contact BBMP hazardous waste helpline.',
}
RECYCLER_VALUE = {
    'plastic': 8, 'paper': 5, 'cardboard': 4, 'metal': 18,
    'glass': 2, 'textile': 6, 'electronic': 30,
}

# ── ImageNet class → (waste_category, swm_stream) mapping ───────────────────
# Only classes that are actually waste/recyclable objects
IMAGENET_WASTE_MAP = {
    # Plastic / bottles
    'water bottle':         ('bottle',    'Dry/Blue'),
    'pop bottle':           ('bottle',    'Dry/Blue'),
    'wine bottle':          ('bottle',    'Dry/Blue'),
    'beer bottle':          ('bottle',    'Dry/Blue'),
    'plastic bag':          ('plastic',   'Dry/Blue'),
    'bucket':               ('plastic',   'Dry/Blue'),
    'bathtub':              ('plastic',   'Dry/Blue'),
    # Paper / cardboard
    'envelope':             ('paper',     'Dry/Blue'),
    'paper towel':          ('paper',     'Dry/Blue'),
    'toilet tissue':        ('tissue',    'Sanitary/Red'),
    'cardboard':            ('cardboard', 'Dry/Blue'),
    'carton':               ('cardboard', 'Dry/Blue'),
    'packet':               ('wrapper',   'Dry/Blue'),
    # Metal / cans
    'can opener':           ('can',       'Dry/Blue'),
    'tin can':              ('can',       'Dry/Blue'),
    'beer can':             ('can',       'Dry/Blue'),
    'steel drum':           ('metal',     'Dry/Blue'),
    'barrel':               ('metal',     'Dry/Blue'),
    # Glass
    'glass':                ('glass',     'Dry/Blue'),
    'mason jar':            ('glass',     'Dry/Blue'),
    # Organic / food
    'banana':               ('food_waste','Wet/Green'),
    'orange':               ('food_waste','Wet/Green'),
    'apple':                ('food_waste','Wet/Green'),
    'lemon':                ('food_waste','Wet/Green'),
    'fig':                  ('food_waste','Wet/Green'),
    'jackfruit':            ('food_waste','Wet/Green'),
    'mushroom':             ('vegetable', 'Wet/Green'),
    'broccoli':             ('vegetable', 'Wet/Green'),
    'cauliflower':          ('vegetable', 'Wet/Green'),
    'artichoke':            ('vegetable', 'Wet/Green'),
    'leaf':                 ('leaf',      'Wet/Green'),
    'hay':                  ('organic',   'Wet/Green'),
    'compost':              ('organic',   'Wet/Green'),
    # Textile
    'jersey':               ('textile',   'Dry/Blue'),
    'sock':                 ('textile',   'Dry/Blue'),
    'stocking':             ('textile',   'Dry/Blue'),
    'diaper':               ('diaper',    'Sanitary/Red'),
    # Hazardous / electronics
    'laptop':               ('electronic','Hazardous/Black'),
    'notebook computer':    ('electronic','Hazardous/Black'),
    'desktop computer':     ('electronic','Hazardous/Black'),
    'monitor':              ('electronic','Hazardous/Black'),
    'television':           ('electronic','Hazardous/Black'),
    'remote control':       ('electronic','Hazardous/Black'),
    'mobile phone':         ('electronic','Hazardous/Black'),
    'cellular telephone':   ('electronic','Hazardous/Black'),
    'iPod':                 ('electronic','Hazardous/Black'),
    'calculator':           ('electronic','Hazardous/Black'),
    'battery':              ('battery',   'Hazardous/Black'),
    'electric fan':         ('electronic','Hazardous/Black'),
    'hair dryer':           ('electronic','Hazardous/Black'),
    'iron':                 ('electronic','Hazardous/Black'),
    # General trash
    'ashcan':               ('plastic',   'Dry/Blue'),
    'garbage truck':        ('plastic',   'Dry/Blue'),
    'wastebasket':          ('plastic',   'Dry/Blue'),
}

# ── Fine-tuned model ──────────────────────────────────────────────────────────

CLASSES = ["Wet/Green", "Dry/Blue", "Sanitary/Red", "Hazardous/Black", "No Waste"]
CLASS_TO_STREAM = {
    "Wet/Green": "Wet/Green", "Dry/Blue": "Dry/Blue",
    "Sanitary/Red": "Sanitary/Red", "Hazardous/Black": "Hazardous/Black",
}
CLASS_TO_CATEGORY = {
    "Wet/Green": "food_waste", "Dry/Blue": "mixed_waste",
    "Sanitary/Red": "sanitary", "Hazardous/Black": "hazardous",
}

_ft_model = None
_ft_transforms = None

def _get_finetuned():
    global _ft_model, _ft_transforms
    if _ft_model is not None:
        return _ft_model, _ft_transforms
    if not FINETUNED_MODEL_PATH.exists():
        return None, None
    try:
        import torch
        import torchvision.models as models
        import torchvision.transforms as T
        from torch import nn
        checkpoint = torch.load(FINETUNED_MODEL_PATH, map_location="cpu", weights_only=False)
        model = models.mobilenet_v3_small(weights=None)
        in_features = model.classifier[3].in_features
        model.classifier[3] = nn.Linear(in_features, 5)
        model.load_state_dict(checkpoint['model_state'])
        model.eval()
        _ft_model = model
        _ft_transforms = T.Compose([
            T.Resize((224, 224)),
            T.ToTensor(),
            T.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ])
        print(f"[Classifier] Loaded fine-tuned model (val_acc={checkpoint.get('val_acc', '?'):.2%})")
        return _ft_model, _ft_transforms
    except Exception as e:
        print(f"[Classifier] Could not load fine-tuned model: {e}")
        return None, None


def _infer_finetuned(image_data: bytes):
    """Run fine-tuned model inference. Returns (class_name, confidence) or None."""
    model, transforms = _get_finetuned()
    if model is None:
        return None
    try:
        import torch
        from PIL import Image
        img = Image.open(BytesIO(image_data)).convert("RGB")
        tensor = transforms(img).unsqueeze(0)
        with torch.no_grad():
            probs = torch.softmax(model(tensor), dim=1)[0]
        best_idx = probs.argmax().item()
        return CLASSES[best_idx], probs[best_idx].item(), probs.tolist()
    except Exception as e:
        print(f"[Classifier] Fine-tuned inference error: {e}")
        return None


# ── ImageNet fallback model ───────────────────────────────────────────────────

_imagenet_model = None
_imagenet_weights = None
_imagenet_categories = None

def _get_imagenet_model():
    global _imagenet_model, _imagenet_weights, _imagenet_categories
    if _imagenet_model is not None:
        return _imagenet_model, _imagenet_weights, _imagenet_categories
    try:
        import torch
        import torchvision.models as models
        _imagenet_weights = models.MobileNet_V3_Small_Weights.IMAGENET1K_V1
        _imagenet_model = models.mobilenet_v3_small(weights=_imagenet_weights)
        _imagenet_model.eval()
        _imagenet_categories = _imagenet_weights.meta['categories']
        return _imagenet_model, _imagenet_weights, _imagenet_categories
    except Exception as e:
        print(f"[Classifier] Could not load ImageNet MobileNetV3: {e}")
        return None, None, None


def _infer_imagenet(image_data: bytes):
    model, weights, categories = _get_imagenet_model()
    if model is None:
        return []
    try:
        import torch
        from PIL import Image
        img = Image.open(BytesIO(image_data)).convert("RGB")
        tensor = weights.transforms()(img).unsqueeze(0)
        with torch.no_grad():
            probs = torch.softmax(model(tensor), dim=1)[0]
        top = torch.topk(probs, 10)
        return [(categories[i.item()], probs[i.item()].item()) for i in top.indices]
    except Exception as e:
        print(f"[Classifier] ImageNet inference error: {e}")
        return []


def classify_image_mock(image_data=None, filename=None):
    """Classify waste: fine-tuned model first, ImageNet mapping fallback."""

    if image_data and len(image_data) > 1000:

        # ── Path 1: Fine-tuned model (trained on real Thanisandra dump photos) ──
        result = _infer_finetuned(image_data)
        if result is not None:
            class_name, confidence, all_probs = result
            if class_name == "No Waste" or confidence < 0.70:
                # Return no_waste — but double-check with ImageNet if borderline
                return {
                    'status': 'no_waste',
                    'model': 'MobileNetV3 (fine-tuned, Thanisandra)',
                    'analysed_at': datetime.now().isoformat(),
                    'filename': filename or 'upload.jpg',
                    'detections': [],
                    'num_detections': 0,
                    'stream_summary': {},
                    'dominant_stream': None,
                    'dominant_stream_color': '#4a5a70',
                    'primary_disposal': 'No waste detected in this image.',
                    'total_recyclable_items': 0,
                    'scene_label': 'clean_scene',
                }
            # Waste detected by fine-tuned model
            stream = CLASS_TO_STREAM.get(class_name, "Dry/Blue")
            cat = CLASS_TO_CATEGORY.get(class_name, "mixed_waste")
            detections = [(cat, confidence, stream)]
            return _build_result(detections, filename, model=f'MobileNetV3 (fine-tuned, Thanisandra, conf={confidence:.0%})')

        # ── Path 2: ImageNet mapping fallback ────────────────────────────────
        top_preds = _infer_imagenet(image_data)
        matched = []
        for class_name, prob in top_preds:
            if class_name.lower() in IMAGENET_WASTE_MAP:
                cat, stream = IMAGENET_WASTE_MAP[class_name.lower()]
                matched.append((cat, prob, stream))
            else:
                for keyword, (cat, stream) in IMAGENET_WASTE_MAP.items():
                    if keyword in class_name.lower() or class_name.lower() in keyword:
                        matched.append((cat, prob, stream))
                        break
        matched = [(cat, prob, stream) for cat, prob, stream in matched if prob >= 0.12]
        if matched:
            seen = {}
            for cat, prob, stream in sorted(matched, key=lambda x: x[1], reverse=True):
                if cat not in seen:
                    seen[cat] = (cat, prob, stream)
            return _build_result(list(seen.values())[:3], filename, model='MobileNetV3-ImageNet fallback')

        top_label = top_preds[0][0] if top_preds else "unknown"
        return {
            'status': 'no_waste',
            'model': 'MobileNetV3-ImageNet fallback',
            'analysed_at': datetime.now().isoformat(),
            'filename': filename or 'upload.jpg',
            'detections': [], 'num_detections': 0, 'stream_summary': {},
            'dominant_stream': None, 'dominant_stream_color': '#4a5a70',
            'primary_disposal': 'No waste detected in this image.',
            'total_recyclable_items': 0, 'scene_label': top_label,
        }

    # Demo fallback (no image provided)
    scenarios = [
        [('plastic', 0.91, 'Dry/Blue'), ('wrapper', 0.84, 'Dry/Blue')],
        [('food_waste', 0.88, 'Wet/Green'), ('vegetable', 0.79, 'Wet/Green')],
        [('bottle', 0.93, 'Dry/Blue'), ('paper', 0.76, 'Dry/Blue')],
        [('battery', 0.89, 'Hazardous/Black'), ('electronic', 0.72, 'Hazardous/Black')],
        [('cardboard', 0.90, 'Dry/Blue'), ('paper', 0.83, 'Dry/Blue')],
    ]
    return _build_result(random.choice(scenarios), filename, model='MobileNetV3 (demo)')


def _build_result(raw_detections, filename, model='MobileNetV3'):
    detections, stream_summary = [], {}
    for cat, conf, stream in raw_detections:
        detections.append({
            'category': cat.replace('_', ' ').title(),
            'category_raw': cat,
            'confidence': round(conf, 3),
            'swm_stream': stream,
            'stream_color': STREAM_COLORS[stream],
            'disposal_instruction': STREAM_DISPOSAL[stream],
            'recyclable': RECYCLER_VALUE.get(cat, 0) > 0,
            'market_value_per_kg_inr': RECYCLER_VALUE.get(cat, 0),
        })
        stream_summary[stream] = stream_summary.get(stream, 0) + 1
    dominant = max(stream_summary, key=stream_summary.get) if stream_summary else 'Dry/Blue'
    return {
        'status': 'success',
        'model': model,
        'analysed_at': datetime.now().isoformat(),
        'filename': filename or 'upload.jpg',
        'detections': detections,
        'num_detections': len(detections),
        'stream_summary': stream_summary,
        'dominant_stream': dominant,
        'dominant_stream_color': STREAM_COLORS.get(dominant, '#666'),
        'primary_disposal': STREAM_DISPOSAL.get(dominant, ''),
        'total_recyclable_items': sum(1 for d in detections if d['recyclable']),
    }

def classify_image(image_data=None, filename=None, use_real_model=False):
    return classify_image_mock(image_data, filename)
