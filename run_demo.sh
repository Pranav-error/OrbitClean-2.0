#!/bin/bash
# OrbitClean 2.0 — Quick Demo Runner
# Run all ML components with demo data, then start the backend

set -e
cd "$(dirname "$0")"

echo "============================================"
echo "   OrbitClean 2.0 — Team Resonance"
echo "   AWI SpaceTech Hackathon 2026"
echo "============================================"
echo ""

echo "[1/6] Running Satellite Dump Detector (demo mode)..."
python ml/dump_detector.py --demo

echo ""
echo "[2/6] Running XGBoost Risk Predictor..."
python ml/risk_predictor.py --demo

echo ""
echo "[3/6] Running Carbon Credit Estimator..."
python ml/carbon_estimator.py --demo

echo ""
echo "[4/6] Running Water Risk Analyser..."
python ml/water_risk.py --demo

echo ""
echo "[5/6] Running Anomaly Detector (Isolation Forest)..."
python ml/anomaly_detector.py --demo

echo ""
echo "[6/6] Running Waste Forecaster (7-day)..."
python ml/waste_forecaster.py --demo

echo ""
echo "[7/7] Running Deterrence ROI Calculator..."
python ml/deterrence_roi.py --demo

echo ""
echo "[8/8] Running Drone Mission Planner..."
python ml/drone_planner.py --demo

echo ""
echo "[9/9] Running Ward Accountability Scorer..."
python backend/ward_scorer.py

echo ""
echo "============================================"
echo "   All demos complete."
echo ""
echo "   To start the API server:"
echo "   uvicorn backend.app:app --reload --port 8000"
echo ""
echo "   Then open: frontend/index.html"
echo "   API docs:  http://localhost:8000/docs"
echo "============================================"
