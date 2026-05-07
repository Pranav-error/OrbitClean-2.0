# OrbitClean 2.0 — Developer & AI Agent Guide

> Space-Enabled Waste Intelligence for Bengaluru's Circular Economy  
> Built at AWI SpaceTech Hackathon · 21–22 March 2026 · Yuvapatha, Bengaluru

---

## Project Overview

OrbitClean 2.0 is an end-to-end solid waste management intelligence system for BBMP (Bruhat Bengaluru Mahanagara Palike). It chains together:

1. Sentinel-2 satellite imagery processing
2. Multiple ML models (RF, XGBoost, MobileNetV3, Isolation Forest, Prophet)
3. Community photo reporting pipeline
4. A FastAPI backend with 34 REST endpoints
5. A Next.js 14 + Leaflet.js dashboard

**One-line purpose:** Detect illegal dump sites before a complaint is filed, predict where the next one forms, dispatch the right truck, and generate a SWM Rules 2026-compliant digital audit trail.

---

## Repository Layout

```
OrbitClean-2.0/
├── ml/                  # All ML model scripts (Python)
├── backend/             # FastAPI application (Python)
├── frontend/            # Next.js 14 dashboard (TypeScript)
├── data/                # GeoJSON, JSON output files from ML pipeline
├── Thanisandra/         # Raw QGIS shapefiles and satellite rasters
├── ground_truth/        # GPS-tagged field photos from 7 March 2026
├── requirements.txt     # Python dependencies
├── run_demo.sh          # One-shot demo runner
└── generate_workflow.py # Generates orbitclean_methodology.png
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Satellite data | Sentinel-2A L2A (Copernicus), rasterio, QGIS |
| ML — detection | Random Forest (scikit-learn) |
| ML — risk grid | XGBoost (GradientBoosting fallback) |
| ML — image class | MobileNetV3 (PyTorch), fine-tuned on TACO dataset |
| ML — volume | Geometric estimator (area × depth × bulk density) |
| ML — carbon | IPCC Tier 1 First Order Decay |
| ML — forecast | Prophet + WMA fallback |
| ML — anomaly | Isolation Forest |
| ML — routing | Nearest-neighbour + 3-layer fallback |
| Backend | FastAPI, Pydantic, uvicorn |
| NL interface | Claude claude-haiku-4-5-20251001 via Anthropic API (`backend/nl_query.py`) |
| SMS/WhatsApp | Twilio (`backend/kabadiwala_alert.py`) |
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Maps | Leaflet.js + react-leaflet |
| Data format | GeoJSON (spatial), JSON (API responses) |

---

## Running the Project

### Prerequisites

```bash
# Minimum Python deps
pip install fastapi uvicorn pydantic scikit-learn xgboost numpy

# Full ML stack (optional — needed to regenerate data files)
pip install torch torchvision ultralytics prophet rasterio geopandas
```

### 1. Backend

```bash
# From project root
uvicorn backend.app:app --reload --port 8000

# Swagger UI: http://localhost:8000/docs
# ReDoc:      http://localhost:8000/redoc
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev

# Dashboard: http://localhost:3000
# Mobile QR: http://localhost:3000/qr
```

### 3. Regenerate ML data files (offline)

```bash
python ml/dump_detector.py --demo
python ml/risk_predictor.py --demo --output data/risk_grid_predicted.geojson
python ml/route_optimizer.py
python ml/anomaly_detector.py --demo
python ml/waste_forecaster.py --demo
python ml/carbon_estimator.py --demo
python ml/water_risk.py --demo
python ml/deterrence_roi.py --demo
```

### 4. Environment Variables

```bash
export ANTHROPIC_API_KEY=sk-ant-...       # Claude NL query (optional — mock fallback exists)
export TWILIO_ACCOUNT_SID=ACxxx           # WhatsApp alerts (optional)
export TWILIO_AUTH_TOKEN=xxx
export TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

---

## Backend API — Key Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/dumps/active` | All active dump sites (GeoJSON features) |
| GET | `/api/dumps/{id}/carbon` | IPCC Tier 1 carbon credit estimate |
| GET | `/api/dumps/{id}/roi` | Deterrence intervention ranking |
| GET | `/api/dumps/{id}/water-risk` | Contamination radius + population at risk |
| GET | `/api/risk_grid` | XGBoost 552-cell risk heatmap |
| GET | `/api/wards` | WAScore leaderboard (5 wards) |
| GET | `/api/compliance/{ward_id}` | SWM Rules 2026 compliance record |
| POST | `/api/classify` | Upload image → waste stream classification |
| GET | `/api/routes/optimize` | Live 5-zone route optimization |
| GET | `/api/routes/static` | Pre-computed route (reliable for demo) |
| POST | `/api/community/upload` | GPS-tagged community photo upload |
| POST | `/api/cleanup/generate` | Generate cleanup missions |
| POST | `/api/cleanup/{id}/before` | Driver before-photo + GPS |
| POST | `/api/cleanup/{id}/after` | Driver after-photo + GPS |
| GET | `/api/anomalies` | Dump surge alerts (Isolation Forest) |
| GET | `/api/forecast` | 7-day waste forecast |
| POST | `/api/query` | Natural language query (Claude API) |
| POST | `/api/field-report` | Mobile field capture submission |
| GET | `/api/summary` | All dashboard KPIs in one call |

Full list: 34 endpoints. See `backend/app.py` or `/docs` when running.

---

## ML Models Summary

| ID | File | Algorithm | Output |
|----|------|-----------|--------|
| ML-1 | `ml/dump_detector.py` | Random Forest on Sentinel-2 pixels | `data/detected_dumps.geojson` (48 sites) |
| ML-2 | `ml/risk_predictor.py` | XGBoost, 8 features, 552 grid cells | `data/risk_grid_predicted.geojson` |
| ML-3 | `ml/classifier_api.py` | MobileNetV3-Small (TACO-finetuned) | 5-class waste stream + recyclable value |
| ML-4 | `ml/volume_estimator.py` | Geometric formula | Weight (tonnes) + truck count |
| ML-5 | `ml/carbon_estimator.py` | IPCC Tier 1 FOD | CO₂-eq tonnes + ₹ credit value |
| ML-6 | `ml/waste_forecaster.py` | Prophet + WMA fallback | 7-day zone-level forecast |
| ML-7 | `ml/anomaly_detector.py` | Isolation Forest | Surge alerts per zone |
| ML-8 | `ml/deterrence_roi.py` | ROI formula | 5 interventions ranked by payback |
| ML-9 | `ml/water_risk.py` | Contamination radius model | Population at risk, contamination index |

---

## Data Files (do not delete or overwrite without re-running ML)

| File | Records | Description |
|------|---------|-------------|
| `data/detected_dumps.geojson` | 48 features | Sentinel-2A detected dump site centroids |
| `data/risk_grid_predicted.geojson` | 552 features | XGBoost risk scores per 100m cell |
| `data/route_solution.json` | 5 zones | Pre-computed 5-zone optimised route plan |
| `data/cleanup_missions.json` | variable | Active before/after cleanup missions |
| `data/anomaly_alerts.json` | variable | Isolation Forest surge alerts |
| `data/waste_forecast.json` | 28 records | 7-day × 4 zones forecast |
| `data/recyclers.geojson` | 7 features | Kabadiwala / recycler locations |
| `data/water_bodies.geojson` | variable | Lakes + ponds with contamination risk |

---

## Frontend Structure

```
frontend/src/
├── app/
│   ├── page.tsx          # Main dashboard — tabs: Overview / Routes / Cleanup / ML Intel / AI Chat
│   ├── qr/page.tsx       # Mobile QR field capture page
│   ├── mobile/           # Mobile-optimised capture flow
│   └── api/              # Next.js route handlers (if any)
├── components/
│   ├── MapView.tsx        # Leaflet map — 6 overlay layers
│   ├── WardLeaderboard.tsx
│   ├── RouteOptimizer.tsx
│   ├── CleanupTracker.tsx
│   ├── CommunityUpload.tsx
│   ├── RetrainStatus.tsx
│   ├── MLInfo.tsx
│   ├── ChatBox.tsx        # TruckSimulation — CVRP live demo (used by /qr page)
│   ├── AIChat.tsx         # Multi-turn NL chat via /api/query (Claude Haiku + prompt caching)
│   ├── CarbonCounter.tsx
│   ├── ForecastChart.tsx
│   ├── DumpList.tsx
│   ├── ROIList.tsx
│   ├── WasteClassifier.tsx
│   └── Header.tsx
├── types/index.ts         # 31 TypeScript interfaces
└── lib/data.ts            # Hardcoded seed data (6 dumps, 5 wards, routes)
```

---

## WAScore Formula

Higher = worse (0–100 scale, displayed as ward leaderboard):

```
WAScore = 2.5 × active_dumps
        + 0.8 × collection_gap_hrs
        + 1.2 × avg_dump_age_days
        − 30  × (pct_resolved / 100)
        + 30  (baseline)
        [clamped 0–100]
```

Current standings: Kodigehalli F (92.2) · Thanisandra D (61.0) · Hebbal C (45.0) · Yelahanka B (19.8) · Jakkur A (7.9)

---

## Key Business Rules / Constants

- **Fleet sizing**: `max(ceil(households/750), ceil(daily_wet_kg/500))` per zone
- **Route length**: `sqrt(zone_area_km²) × 3.5` (serpentine traversal estimate)
- **Community verification**: 3 independent reports within 200m confirms a dump
- **Auto-retrain threshold**: 50 community photos triggers `ml/auto_retrain.py`
- **Cleanup GPS tolerance**: 150m (before/after photo must be within 150m of mission coords)
- **Carbon credit price**: ₹2,000 per tonne CO₂-eq (VCM market rate used)
- **Collection frequency** (SWM 2026): Wet daily, Dry 3×/week, Sanitary 2×/week, Reject 2×/week

---

## SWM Rules 2026 Compliance Mapping

| Rule | OrbitClean Feature |
|------|--------------------|
| 4-stream mandatory segregation | ML-3 MobileNetV3 classifier → 4 SWM streams |
| Digital SWM portal | FastAPI + Leaflet dashboard |
| Polluter Pays penalties | Satellite GPS evidence (S2-DUMP-xxx IDs) |
| Stream-specific vehicle dispatch | Route optimizer assigns tipper type per stream |
| Bulk generator monitoring | Risk grid flags sites >200 m² for EBWGR follow-up |
| 24-hour collection target | WAScore flags wards with collection_gap > 24 hrs |

---

## Ground Truth Validation

Field survey conducted 7 March 2026, Thanisandra Ward (PIN 560077):

| Site | Coordinates | Matched satellite cluster | Distance |
|------|-------------|--------------------------|---------|
| GT-001 | 13.056306°N, 77.62965°E | S2-DUMP-237 | 73 m |
| GT-002 | 13.056467°N, 77.629216°E | S2-DUMP-237 | 82 m |

Both ground-truth sites matched within 10m pixel tolerance. Detection accuracy: 2/2 (100%).

---

## Important Notes for Agents

- The backend has 3-layer fallback in `ml/route_optimizer.py` — it never throws 500 in demo mode.
- `backend/nl_query.py` has a mock fallback when `ANTHROPIC_API_KEY` is not set.
- `frontend/src/lib/data.ts` contains hardcoded seed data used when the backend is unreachable.
- All ML scripts support `--demo` flag to run without real satellite data.
- GeoJSON files use WGS84 (EPSG:4326). Never convert to UTM without explicit reason.
- The Sentinel-2A `.SAFE` archive is not tracked in git (too large). Regenerate from Copernicus if needed.
- `data/detected_dumps.geojson` and `data/risk_grid_predicted.geojson` are pre-committed outputs — do not delete.
