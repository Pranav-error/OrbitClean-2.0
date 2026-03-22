/**
 * Browser-side waste classifier using canvas pixel analysis.
 * Used as offline fallback when the backend API is unreachable.
 *
 * Approach:
 *  - Sample a grid of pixels from the captured canvas
 *  - Compute HSV statistics: hue distribution, saturation, brightness variance
 *  - Waste piles: high RGB variance, brownish/mixed hues, low saturation patchiness
 *  - Clean scenes (walls, floors, desks): uniform brightness, consistent hue
 */

interface PixelStats {
  rMean: number;
  gMean: number;
  bMean: number;
  variance: number;       // overall pixel variance (high → mixed/cluttered scene)
  brownScore: number;     // how "earthy/brown/grey" the image is (waste indicator)
  greenFraction: number;  // fraction of strongly green pixels (vegetation)
  skinFraction: number;   // fraction of skin-tone pixels (human → not waste)
  uniformity: number;     // 0=chaotic, 1=perfectly uniform
}

function analyzeCanvas(canvas: HTMLCanvasElement): PixelStats {
  const ctx = canvas.getContext("2d");
  if (!ctx) return { rMean: 0, gMean: 0, bMean: 0, variance: 0, brownScore: 0, greenFraction: 0, skinFraction: 0, uniformity: 1 };

  const W = canvas.width;
  const H = canvas.height;
  // Sample a 20×20 grid
  const STEP_X = Math.max(1, Math.floor(W / 20));
  const STEP_Y = Math.max(1, Math.floor(H / 20));

  const pixels: [number, number, number][] = [];
  for (let y = 0; y < H; y += STEP_Y) {
    for (let x = 0; x < W; x += STEP_X) {
      const d = ctx.getImageData(x, y, 1, 1).data;
      pixels.push([d[0], d[1], d[2]]);
    }
  }

  if (pixels.length === 0) return { rMean: 128, gMean: 128, bMean: 128, variance: 0, brownScore: 0, greenFraction: 0, skinFraction: 0, uniformity: 1 };

  const n = pixels.length;
  let rSum = 0, gSum = 0, bSum = 0;
  for (const [r, g, b] of pixels) { rSum += r; gSum += g; bSum += b; }
  const rMean = rSum / n;
  const gMean = gSum / n;
  const bMean = bSum / n;

  // Variance across all channels
  let varSum = 0;
  for (const [r, g, b] of pixels) {
    varSum += (r - rMean) ** 2 + (g - gMean) ** 2 + (b - bMean) ** 2;
  }
  const variance = varSum / (n * 3);

  // Brown/earthy score: r > g > b, moderate brightness (not pure white/black)
  // Waste piles tend to be brownish, grey, or dirty mixed colours
  let brownCount = 0;
  let greenCount = 0;
  let skinCount = 0;
  for (const [r, g, b] of pixels) {
    const brightness = (r + g + b) / 3;
    // Brown: reddish-yellow dominant, not too bright (< 220) not too dark (> 40)
    if (r > g && g >= b && brightness > 40 && brightness < 220) brownCount++;
    // Also count grey-ish (low saturation, mid brightness) as potential waste
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const saturation = maxC > 0 ? (maxC - minC) / maxC : 0;
    if (saturation < 0.2 && brightness > 50 && brightness < 200) brownCount += 0.5;

    // Strong green: G much larger than R and B
    if (g > r * 1.3 && g > b * 1.3 && g > 60) greenCount++;

    // Skin tone detection: warm hue (R > G > B), moderate saturation, not too dark/bright
    // Covers a wide range of human skin tones
    if (r > g && g > b && r > 80 && brightness > 60 && brightness < 230 &&
        saturation > 0.1 && saturation < 0.65 && (r - b) > 20 && (r - b) < 130) {
      skinCount++;
    }
  }
  const brownScore = brownCount / n;
  const greenFraction = greenCount / n;
  const skinFraction = skinCount / n;

  // Uniformity: low std dev of brightness → uniform (clean walls, floors, desks)
  const brightness = pixels.map(([r, g, b]) => (r + g + b) / 3);
  const bMeanVal = brightness.reduce((a, b) => a + b, 0) / n;
  const bVar = brightness.reduce((a, b) => a + (b - bMeanVal) ** 2, 0) / n;
  const uniformity = 1 / (1 + Math.sqrt(bVar) / 30); // 0–1, higher = more uniform

  return { rMean, gMean, bMean, variance, brownScore, greenFraction, skinFraction, uniformity };
}

export interface ClientClassifyResult {
  status: "success" | "no_waste";
  dominant_stream: string | null;
  dominant_stream_color: string;
  primary_disposal: string;
  detections: Array<{
    category: string;
    confidence: number;
    swm_stream: string;
    stream_color: string;
    disposal_instruction: string;
    recyclable: boolean;
    market_value_per_kg_inr: number;
  }>;
  num_detections: number;
  stream_summary: Record<string, number>;
  total_recyclable_items: number;
  model: string;
  analysed_at: string;
  filename: string;
  scene_label?: string;
}

export function classifyOnDevice(canvas: HTMLCanvasElement, filename = "capture.jpg"): ClientClassifyResult {
  const stats = analyzeCanvas(canvas);

  const base = {
    model: "Canvas pixel analysis (offline)",
    analysed_at: new Date().toISOString(),
    filename,
  };

  // ── Decision logic ────────────────────────────────────────────────────────

  // Significant skin tone pixels → people, not waste
  if (stats.skinFraction > 0.15) {
    return {
      ...base,
      status: "no_waste",
      dominant_stream: null,
      dominant_stream_color: "#4a5a70",
      primary_disposal: "No waste detected.",
      detections: [],
      num_detections: 0,
      stream_summary: {},
      total_recyclable_items: 0,
      scene_label: "people",
    };
  }

  // Very uniform → likely a clean indoor scene (wall, desk, floor, presentation)
  if (stats.uniformity > 0.70 && stats.variance < 1200) {
    return {
      ...base,
      status: "no_waste",
      dominant_stream: null,
      dominant_stream_color: "#4a5a70",
      primary_disposal: "No waste detected.",
      detections: [],
      num_detections: 0,
      stream_summary: {},
      total_recyclable_items: 0,
      scene_label: "clean_surface",
    };
  }

  // Strong vegetation / lawn green → Wet/Green (leaves, garden waste)
  if (stats.greenFraction > 0.35 && stats.uniformity < 0.85) {
    return {
      ...base,
      status: "success",
      dominant_stream: "Wet/Green",
      dominant_stream_color: "#22c55e",
      primary_disposal: "Place in GREEN bin. BBMP wet waste collection Mon/Wed/Fri.",
      detections: [{ category: "Organic / Leaves", confidence: 0.72 + stats.greenFraction * 0.1, swm_stream: "Wet/Green", stream_color: "#22c55e", disposal_instruction: "Place in GREEN bin.", recyclable: false, market_value_per_kg_inr: 0 }],
      num_detections: 1,
      stream_summary: { "Wet/Green": 1 },
      total_recyclable_items: 0,
    };
  }

  // Chaotic mixed colours + brownish tones → outdoor dump site → Dry/Blue
  if (stats.variance > 2500 && stats.brownScore > 0.25) {
    const conf = Math.min(0.96, 0.62 + stats.variance / 15000 + stats.brownScore * 0.2);
    return {
      ...base,
      status: "success",
      dominant_stream: "Dry/Blue",
      dominant_stream_color: "#3b82f6",
      primary_disposal: "Place in BLUE bin. Segregate paper/plastic/metal. BBMP dry waste Tue/Thu/Sat.",
      detections: [
        { category: "Mixed Waste", confidence: conf, swm_stream: "Dry/Blue", stream_color: "#3b82f6", disposal_instruction: "Place in BLUE bin.", recyclable: true, market_value_per_kg_inr: 5 },
      ],
      num_detections: 1,
      stream_summary: { "Dry/Blue": 1 },
      total_recyclable_items: 1,
    };
  }

  // Moderate variance, clearly brownish → possibly waste
  if (stats.variance > 1500 && stats.brownScore > 0.30) {
    const conf = 0.55 + stats.brownScore * 0.15;
    return {
      ...base,
      status: "success",
      dominant_stream: "Dry/Blue",
      dominant_stream_color: "#3b82f6",
      primary_disposal: "Place in BLUE bin. Segregate paper/plastic/metal. BBMP dry waste Tue/Thu/Sat.",
      detections: [
        { category: "Mixed Waste", confidence: conf, swm_stream: "Dry/Blue", stream_color: "#3b82f6", disposal_instruction: "Place in BLUE bin.", recyclable: true, market_value_per_kg_inr: 5 },
      ],
      num_detections: 1,
      stream_summary: { "Dry/Blue": 1 },
      total_recyclable_items: 1,
    };
  }

  // Default: clean scene
  return {
    ...base,
    status: "no_waste",
    dominant_stream: null,
    dominant_stream_color: "#4a5a70",
    primary_disposal: "No waste detected.",
    detections: [],
    num_detections: 0,
    stream_summary: {},
    total_recyclable_items: 0,
    scene_label: "clean_scene",
  };
}
