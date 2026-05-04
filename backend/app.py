"""
OrbitClean 2.0 — FastAPI Backend
Serves all ML outputs as REST API with Swagger UI.
Aligns with SWM Rules 2026 mandatory digital audit trail.

Run:
    pip install fastapi uvicorn
    uvicorn backend.app:app --reload --port 8000
    Swagger UI: http://localhost:8000/docs
"""

import json
import os
import sys
import random
import math
from datetime import datetime, timedelta
from typing import Optional, List

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from fastapi import FastAPI, HTTPException, UploadFile, File, Query, Body
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import JSONResponse, HTMLResponse
    from fastapi.staticfiles import StaticFiles
    from pydantic import BaseModel
    HAS_FASTAPI = True
except ImportError:
    HAS_FASTAPI = False
    print("[WARN] FastAPI not installed. Run: pip install fastapi uvicorn")

from backend.ward_scorer import get_leaderboard, compute_all_scores
from backend.nl_query import query_claude, load_context_data, summarise_context, mock_response
from backend.kabadiwala_alert import process_dump_for_alerts, load_recyclers, find_nearest_recycler
from ml.carbon_estimator import estimate_dump_carbon
from ml.water_risk import compute_contamination_radius, contamination_index, haversine_m
from ml.deterrence_roi import rank_interventions_for_site, INTERVENTIONS
from ml.anomaly_detector import generate_synthetic_timeseries, analyse_timeseries
from ml.waste_forecaster import format_forecast_output, ZONES
from ml.classifier_api import classify_image_mock
from ml.volume_estimator import estimate as vol_estimate, ward_total as vol_ward_total
from ml.route_optimizer import optimize_ward
from ml.community_validator import upload_photo, get_verification_status, get_stats as community_stats
from ml.auto_retrain import get_status as retrain_status, mock_retrain, check_retrain_needed
from ml.cleanup_tracker import (
    generate_missions, upload_before_photo, upload_after_photo,
    get_all_missions, get_cleaned_sites, get_active_community_photos,
)

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data')


def load_json(filename):
    path = os.path.join(DATA_DIR, filename)
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return None


def file_meta(filename):
    path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(path):
        return {"filename": filename, "exists": False}
    stat = os.stat(path)
    return {
        "filename": filename,
        "exists": True,
        "size_bytes": stat.st_size,
        "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
    }


# ── App setup ──────────────────────────────────────────────────────────────

if HAS_FASTAPI:
    app = FastAPI(
        title="OrbitClean 2.0 API",
        description=(
            "Space-AI-Community intelligence platform for illegal dump detection, "
            "risk prediction, and SWM Rules 2026 compliance. Team Resonance — REVA University."
        ),
        version="2.0.0",
        contact={"name": "Team Resonance", "email": "team@resonance.dev"},
        license_info={"name": "MIT"},
        docs_url="/docs",
        redoc_url="/redoc",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Serve frontend
    frontend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'frontend')
    if os.path.exists(frontend_dir):
        app.mount("/static", StaticFiles(directory=frontend_dir), name="static")

    # ── Request models ──────────────────────────────────────────────────────

    class NLQueryRequest(BaseModel):
        query: str
        use_claude: bool = True

    class ComplianceRecord(BaseModel):
        ward_id: int
        dump_id: str
        gps_lat: float
        gps_lon: float
        waste_type: str
        swm_stream: str
        area_sqm: float
        detected_at: str
        reported_by: str = "OrbitClean AI"

    # ── Routes ──────────────────────────────────────────────────────────────

    @app.get("/", include_in_schema=False)
    async def root():
        return HTMLResponse("""
        <html><body style="font-family:monospace;background:#06080d;color:#00e5a0;padding:40px">
        <h1>OrbitClean 2.0 API</h1>
        <p>Space · AI · Community intelligence for Bengaluru SWM</p>
        <p><a href="/docs" style="color:#4db8ff">📚 Swagger UI</a> &nbsp;|&nbsp;
           <a href="/redoc" style="color:#4db8ff">📖 ReDoc</a> &nbsp;|&nbsp;
           <a href="/api/dumps/active" style="color:#4db8ff">🗑️ Active Dumps</a></p>
        <p>Team Resonance — REVA University | AWI SpaceTech Hackathon 2026</p>
        </body></html>
        """)

    # ── Dump sites ──────────────────────────────────────────────────────────

    @app.get("/api/dumps/active", tags=["Dump Sites"],
             summary="Get all active illegal dump sites")
    async def get_active_dumps():
        """Returns GeoJSON of all currently active detected illegal dump sites."""
        gj = load_json("detected_dumps.geojson")
        if not gj:
            raise HTTPException(404, "Dump data not found")
        active = [f for f in gj['features'] if f['properties'].get('status') == 'Active']
        return {"type": "FeatureCollection", "features": active, "count": len(active)}

    @app.get("/api/dumps/{dump_id}", tags=["Dump Sites"],
             summary="Get details for a specific dump site")
    async def get_dump(dump_id: str):
        gj = load_json("detected_dumps.geojson")
        if not gj:
            raise HTTPException(404, "Dump data not found")
        dump = next((f for f in gj['features']
                     if f['properties'].get('id') == dump_id), None)
        if not dump:
            raise HTTPException(404, f"Dump {dump_id} not found")
        return dump

    @app.get("/api/dumps/{dump_id}/carbon", tags=["Dump Sites"],
             summary="Get carbon credit estimate for a dump site")
    async def get_carbon(dump_id: str):
        gj = load_json("detected_dumps.geojson")
        if not gj:
            raise HTTPException(404, "Data not found")
        dump = next((f for f in gj['features']
                     if f['properties'].get('id') == dump_id), None)
        if not dump:
            raise HTTPException(404, f"Dump {dump_id} not found")
        p = dump['properties']
        return estimate_dump_carbon(p.get('area_sqm', 100), waste_type=p.get('waste_type', 'Mixed'))

    @app.get("/api/dumps/{dump_id}/roi", tags=["Dump Sites"],
             summary="Get deterrence ROI analysis for a dump site")
    async def get_roi(dump_id: str):
        gj = load_json("detected_dumps.geojson")
        if not gj:
            raise HTTPException(404, "Data not found")
        dump = next((f for f in gj['features']
                     if f['properties'].get('id') == dump_id), None)
        if not dump:
            raise HTTPException(404, f"Dump {dump_id} not found")
        return rank_interventions_for_site(dump)

    @app.get("/api/dumps/{dump_id}/water-risk", tags=["Dump Sites"],
             summary="Get water contamination risk for a dump site")
    async def get_water_risk(dump_id: str):
        gj    = load_json("detected_dumps.geojson")
        water = load_json("water_bodies.geojson")
        if not gj:
            raise HTTPException(404, "Data not found")
        dump = next((f for f in gj['features']
                     if f['properties'].get('id') == dump_id), None)
        if not dump:
            raise HTTPException(404, f"Dump {dump_id} not found")

        p = dump['properties']
        cont_radius = compute_contamination_radius(p.get('area_sqm', 100), p.get('waste_type', 'Mixed'))
        risks = []
        if water:
            coords = dump['geometry']['coordinates']
            for wb in water['features']:
                wc = wb['geometry']['coordinates']
                if wb['geometry']['type'] == 'Point':
                    wb_lat, wb_lon = wc[1], wc[0]
                elif wb['geometry']['type'] == 'Polygon':
                    pts = wc[0]
                    wb_lat = sum(p_[1] for p_ in pts)/len(pts)
                    wb_lon = sum(p_[0] for p_ in pts)/len(pts)
                else:
                    continue
                dist = haversine_m(coords[1], coords[0], wb_lat, wb_lon)
                ci = contamination_index(dump, dist, cont_radius)
                if ci > 0:
                    risks.append({
                        'water_body': wb['properties'].get('name'),
                        'distance_m': round(dist, 1),
                        'contamination_index': ci,
                        'population_at_risk': int(wb['properties'].get('population_at_risk', 0) * ci),
                    })
        return {'dump_id': dump_id, 'contamination_radius_m': cont_radius, 'water_risks': risks}

    # ── Risk grid ───────────────────────────────────────────────────────────

    @app.get("/api/risk_grid", tags=["Risk Prediction"],
             summary="Get XGBoost risk prediction heatmap")
    async def get_risk_grid(
        min_score: float = Query(0.0, description="Minimum risk score filter"),
        ward: Optional[str] = Query(None, description="Filter by ward name"),
    ):
        gj = load_json("risk_grid_predicted.geojson")
        if not gj:
            raise HTTPException(404, "Risk grid not found. Run ml/risk_predictor.py first.")
        features = gj['features']
        if min_score > 0:
            features = [f for f in features if f['properties'].get('risk_score', 0) >= min_score]
        if ward:
            features = [f for f in features if f['properties'].get('ward', '').lower() == ward.lower()]
        return {"type": "FeatureCollection", "features": features, "count": len(features)}

    # ── Ward accountability ──────────────────────────────────────────────────

    @app.get("/api/wards", tags=["Ward Accountability"],
             summary="Get WAScore leaderboard for all wards")
    async def get_wards():
        return get_leaderboard()

    @app.get("/api/compliance/{ward_id}", tags=["Ward Accountability", "SWM Compliance"],
             summary="Get SWM Rules 2026 compliance record for a ward")
    async def get_compliance(ward_id: int):
        all_wards = compute_all_scores()
        ward = next((w for w in all_wards if w['ward_id'] == ward_id), None)
        if not ward:
            raise HTTPException(404, f"Ward {ward_id} not found")

        gj = load_json("detected_dumps.geojson") or {"features": []}
        ward_dumps = [f for f in gj['features']
                      if f['properties'].get('ward_id') == ward_id]

        return {
            'ward_id': ward_id,
            'ward_name': ward['ward_name'],
            'wascore': ward['wascore'],
            'grade': ward['grade'],
            'swm_compliance': {
                'collection_target_hrs': 24,
                'actual_frequency_hrs': ward['collection_frequency_hrs'],
                'compliant': ward['collection_frequency_hrs'] <= 24,
                'last_inspection': ward['last_inspection'],
                'active_violations': ward['active_dumps'],
                'pct_resolved': ward['pct_resolved'],
            },
            'active_dumps': len([d for d in ward_dumps if d['properties'].get('status') == 'Active']),
            'dump_details': ward_dumps,
            'generated_at': datetime.now().isoformat(),
            'swm_rule_ref': 'SWM Rules 2026, Rule 4(1)(b): Digital audit trail mandatory',
        }

    # ── Waste classifier ────────────────────────────────────────────────────

    @app.post("/api/classify", tags=["Waste Classifier"],
              summary="Classify waste from uploaded image (YOLOv8)")
    async def classify_waste(file: UploadFile = File(...)):
        image_data = await file.read()
        result = classify_image_mock(image_data, filename=file.filename)
        return result

    @app.get("/api/classify/demo", tags=["Waste Classifier"],
             summary="Demo waste classification (no image required)")
    async def classify_demo():
        return classify_image_mock(filename="demo_waste.jpg")

    # ── Recycler matching ────────────────────────────────────────────────────

    @app.get("/api/recyclers", tags=["Recycler Network"],
             summary="Get all registered recyclers and kabadiwala")
    async def get_recyclers():
        gj = load_json("recyclers.geojson")
        if not gj:
            raise HTTPException(404, "Recycler data not found")
        return gj

    @app.get("/api/recyclers/nearest", tags=["Recycler Network"],
             summary="Find nearest recycler to a GPS location")
    async def nearest_recycler(
        lat: float = Query(..., description="Latitude"),
        lon: float = Query(..., description="Longitude"),
        waste_type: str = Query("Dry/Blue"),
        max_km: float = Query(3.0),
    ):
        recyclers_gj = load_json("recyclers.geojson")
        if not recyclers_gj:
            raise HTTPException(404, "Recycler data not found")
        recyclers = [{**f['properties'], 'lat': f['geometry']['coordinates'][1],
                      'lon': f['geometry']['coordinates'][0]}
                     for f in recyclers_gj['features']]
        nearest = find_nearest_recycler(lat, lon, recyclers, waste_type, max_km)
        return {'query': {'lat': lat, 'lon': lon, 'waste_type': waste_type}, 'results': nearest}

    # ── Volume estimation ────────────────────────────────────────────────────

    @app.get("/api/volume/summary", tags=["Volume Estimation"],
             summary="Get waste weight estimates for all active dumps + trucks needed")
    async def get_volume_summary():
        gj = load_json("detected_dumps.geojson")
        if not gj:
            raise HTTPException(404, "Dump data not found")
        active = [f for f in gj['features'] if f['properties'].get('status') == 'Active']
        dumps_flat = []
        for f in active:
            p = f['properties']
            coords = f['geometry']['coordinates']
            dumps_flat.append({**p, 'lat': coords[1], 'lon': coords[0]})
        return vol_ward_total(dumps_flat)

    # ── Route optimization ────────────────────────────────────────────────────

    @app.get("/api/routes/optimize", tags=["Route Optimization"],
             summary="Ward-level micro-route optimization with zone breakdown")
    async def get_optimized_routes():
        return optimize_ward()

    @app.get("/api/routes/static", tags=["Route Optimization"],
             summary="Get pre-computed route solution (cached for reliable demo)")
    async def get_static_routes():
        solution = load_json("route_solution.json")
        if not solution:
            raise HTTPException(404, "Route solution not found. Run ml/route_optimizer.py first.")
        return solution

    # ── Community upload ────────────────────────────────────────────────────

    @app.post("/api/community/upload", tags=["Community Validation"],
              summary="Upload a community photo with GPS for dump verification")
    async def community_upload(
        file: UploadFile = File(...),
        lat: float = Query(..., description="Latitude"),
        lon: float = Query(..., description="Longitude"),
    ):
        image_data = await file.read()
        classification = classify_image_mock(image_data, filename=file.filename)
        gj = load_json("detected_dumps.geojson") or {"features": []}
        active = [f for f in gj['features'] if f['properties'].get('status') == 'Active']
        dumps_flat = []
        for f in active:
            p = f['properties']
            coords = f['geometry']['coordinates']
            dumps_flat.append({**p, 'lat': coords[1], 'lon': coords[0]})
        record = upload_photo(lat, lon, classification, dumps_flat, image_data, file.filename)
        return record

    @app.get("/api/community/photos", tags=["Community Validation"],
             summary="List all community photo contributions")
    async def get_community_photos():
        from ml.community_validator import _load_photos
        return {"photos": _load_photos()}

    @app.get("/api/community/stats", tags=["Community Validation"],
             summary="Get community upload statistics and verification counts")
    async def get_community_stats():
        return community_stats()

    @app.get("/api/community/verification", tags=["Community Validation"],
             summary="Get community verification status for all dumps")
    async def get_community_verification():
        gj = load_json("detected_dumps.geojson") or {"features": []}
        active = [f for f in gj['features'] if f['properties'].get('status') == 'Active']
        dumps_flat = []
        for f in active:
            p = f['properties']
            coords = f['geometry']['coordinates']
            dumps_flat.append({**p, 'lat': coords[1], 'lon': coords[0]})
        return {"dumps": get_verification_status(dumps_flat)}

    # ── Auto-retrain ────────────────────────────────────────────────────────

    @app.get("/api/retrain/status", tags=["Auto-Retrain"],
             summary="Get model version history, accuracy trend, retrain readiness")
    async def get_retrain_status():
        return retrain_status()

    @app.get("/api/pipeline/status", tags=["Pipeline"],
             summary="Get latest model refresh status and output timestamps")
    async def get_pipeline_status():
        status = load_json("live_pipeline_status.json")
        sentinel = load_json("s2_fetch_metadata.json")
        return {
            "refresh": status,
            "sentinel": sentinel,
            "outputs": {
                "detected_dumps": file_meta("detected_dumps.geojson"),
                "risk_grid": file_meta("risk_grid_predicted.geojson"),
                "s2_prev": file_meta("s2_prev.tif"),
                "s2_curr": file_meta("s2_curr.tif"),
                "s2_metadata": file_meta("s2_fetch_metadata.json"),
            },
            "queried_at": datetime.now().isoformat(),
        }

    @app.post("/api/retrain/trigger", tags=["Auto-Retrain"],
              summary="Trigger model retraining if threshold met")
    async def trigger_retrain():
        check = check_retrain_needed()
        if not check["needed"]:
            return {
                "status": "not_needed",
                "images_until_retrain": check["images_until_retrain"],
                "message": f"Need {check['images_until_retrain']} more community photos before retrain",
            }
        return mock_retrain()

    # ── Cleanup tracker ────────────────────────────────────────────────────

    @app.post("/api/cleanup/generate", tags=["Cleanup Tracker"],
              summary="Generate cleanup missions from active dumps + critical risk cells")
    async def generate_cleanup_missions():
        gj = load_json("detected_dumps.geojson") or {"features": []}
        active = [f for f in gj['features'] if f['properties'].get('status') == 'Active']
        dumps_flat = []
        for f in active:
            p = f['properties']
            coords = f['geometry']['coordinates']
            dumps_flat.append({**p, 'lat': coords[1], 'lon': coords[0]})
        risk_gj = load_json("risk_grid_predicted.geojson")
        risk_cells = risk_gj.get("features", []) if risk_gj else []
        return generate_missions(dumps_flat, risk_cells)

    @app.get("/api/cleanup/missions", tags=["Cleanup Tracker"],
             summary="Get all cleanup missions with status breakdown")
    async def get_cleanup_missions():
        return get_all_missions()

    @app.post("/api/cleanup/{mission_id}/before", tags=["Cleanup Tracker"],
              summary="Driver uploads BEFORE photo with GPS verification")
    async def cleanup_before(
        mission_id: str,
        lat: float = Query(...),
        lon: float = Query(...),
        driver_id: str = Query("DRIVER-001"),
        file: UploadFile = File(None),
    ):
        image_bytes = await file.read() if file else None
        return upload_before_photo(mission_id, lat, lon, driver_id, image_bytes)

    @app.post("/api/cleanup/{mission_id}/after", tags=["Cleanup Tracker"],
              summary="Driver uploads AFTER photo — completes cleanup verification")
    async def cleanup_after(
        mission_id: str,
        lat: float = Query(...),
        lon: float = Query(...),
        file: UploadFile = File(None),
    ):
        image_bytes = await file.read() if file else None
        return upload_after_photo(mission_id, lat, lon, image_bytes)

    @app.get("/api/cleanup/cleaned", tags=["Cleanup Tracker"],
             summary="Get cleaned sites for dynamic risk reduction on map")
    async def get_cleaned():
        return {"cleaned_sites": get_cleaned_sites()}

    @app.get("/api/community/active-photos", tags=["Community Validation"],
             summary="Get non-archived community photos (vanish after cleanup)")
    async def get_active_photos():
        return {"photos": get_active_community_photos()}

    # ── Anomaly detection ────────────────────────────────────────────────────

    @app.get("/api/anomalies", tags=["Anomaly Detection"],
             summary="Get dump surge anomaly alerts (Isolation Forest)")
    async def get_anomalies():
        alerts = load_json("anomaly_alerts.json")
        if not alerts:
            series = generate_synthetic_timeseries(n_weeks=12)
            alerts_list = analyse_timeseries(series, os.path.join(DATA_DIR, "anomaly_alerts.json"))
            return {'alerts': alerts_list, 'total': len(alerts_list)}
        return alerts

    # ── Waste forecast ────────────────────────────────────────────────────────

    @app.get("/api/forecast", tags=["Waste Forecast"],
             summary="7-day waste generation forecast (with Ugadi surge)")
    async def get_forecast(zone: Optional[str] = Query(None)):
        forecast_data = load_json("waste_forecast.json")
        if not forecast_data:
            forecast_data = [format_forecast_output(z, None, 7) for z in ZONES]
        if zone:
            forecast_data = [f for f in forecast_data if f['zone_name'].lower() == zone.lower()]
        return {'forecast': forecast_data}

    # ── NL Query ────────────────────────────────────────────────────────────

    @app.post("/api/query", tags=["NL Intelligence"],
              summary="Natural language query interface (Claude API)")
    async def nl_query(body: NLQueryRequest):
        context = load_context_data()
        ctx_summary = summarise_context(context)
        if body.use_claude and os.environ.get('ANTHROPIC_API_KEY'):
            response = query_claude(body.query, ctx_summary, stream=False)
        else:
            response = mock_response(body.query)
        return {
            'query': body.query,
            'response': response,
            'model': 'claude-haiku-4-5-20251001' if body.use_claude else 'mock',
            'timestamp': datetime.now().isoformat(),
        }

    # ── Field reports (iPhone drone simulation) ──────────────────────────────

    FIELD_REPORTS_PATH = os.path.join(DATA_DIR, "field_reports.json")

    def _load_field_reports():
        if os.path.exists(FIELD_REPORTS_PATH):
            with open(FIELD_REPORTS_PATH) as f:
                return json.load(f)
        return []

    def _save_field_reports(reports):
        with open(FIELD_REPORTS_PATH, "w") as f:
            json.dump(reports, f, indent=2)

    class FieldReport(BaseModel):
        id: str
        lat: float
        lon: float
        dominant_stream: str
        detections: list
        timestamp: str
        image_note: Optional[str] = None

    @app.post("/api/field-report", tags=["Field Operations"],
              summary="Submit a field capture from the mobile drone-sim page")
    async def post_field_report(report: FieldReport):
        reports = _load_field_reports()
        entry = report.model_dump()
        entry["received_at"] = datetime.now().isoformat()
        entry["source"] = "iphone_field_capture"
        # Auto-classify waste volume estimate (rough: assume 50m² area)
        carbon = estimate_dump_carbon(50, waste_type=report.dominant_stream)
        entry["carbon_co2_eq_tonnes"] = carbon["co2_eq_tonnes"]
        entry["carbon_credit_inr"] = carbon["carbon_credit_inr"]
        reports.insert(0, entry)
        _save_field_reports(reports)
        return {"status": "logged", "id": entry["id"], "total_reports": len(reports)}

    @app.get("/api/field-reports", tags=["Field Operations"],
             summary="Get all field captures from the mobile drone-sim session")
    async def get_field_reports(limit: int = Query(50)):
        reports = _load_field_reports()
        return {
            "reports": reports[:limit],
            "total": len(reports),
            "fetched_at": datetime.now().isoformat(),
        }

    @app.delete("/api/field-reports", tags=["Field Operations"],
                summary="Clear all field reports (reset session)")
    async def clear_field_reports():
        _save_field_reports([])
        return {"status": "cleared"}

    # ── Summary dashboard data ────────────────────────────────────────────────

    @app.get("/api/summary", tags=["Dashboard"],
             summary="Single endpoint for dashboard: all KPIs in one call")
    async def get_summary():
        dumps_gj = load_json("detected_dumps.geojson") or {"features": []}
        active   = [f for f in dumps_gj['features'] if f['properties'].get('status') == 'Active']
        total_co2 = sum(f['properties'].get('co2_eq_tonnes', 0) for f in active)
        total_cc  = sum(f['properties'].get('carbon_credit_inr', 0) for f in active)

        ward_lb      = get_leaderboard()
        forecast     = load_json("waste_forecast.json") or []
        anomalies    = load_json("anomaly_alerts.json") or {"alerts": []}
        field_reports = _load_field_reports()

        return {
            'kpis': {
                'active_dumps': len(active),
                'total_co2_eq_tonnes': round(total_co2, 2),
                'total_carbon_credits_inr': round(total_cc),
                'high_risk_zones': 3,
                'kabadiwala_alerts_active': 3,
                'wards_monitored': len(ward_lb['all']),
                'field_captures_today': len(field_reports),
            },
            'top_worst_wards': ward_lb['worst'][:3],
            'top_best_wards': ward_lb['best'][:3],
            'active_dump_sites': active,
            'field_reports': field_reports[:20],
            'anomaly_alerts': anomalies.get('alerts', [])[:3],
            'forecast_surge_days': [
                p for z in forecast for p in z.get('forecast', []) if p.get('surge')
            ],
            'generated_at': datetime.now().isoformat(),
        }

else:
    # Fallback: plain dict for import purposes
    app = None


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app:app", host="0.0.0.0", port=8000, reload=True)
