"""
OrbitClean live-style refresh runner.

Runs dump detection + risk prediction as a scheduled batch and writes
refresh metadata to data/live_pipeline_status.json.

Supports optional automated Sentinel-2 fetching via --auto-fetch flag.

Examples:
  python ml/live_refresh.py --mode demo
  python ml/live_refresh.py --mode rgb --rgb data/latest_rgb.tif
  python ml/live_refresh.py --mode multispectral --date1 data/s2_old.tif --date2 data/s2_new.tif
  python ml/live_refresh.py --auto-fetch --mode multispectral --max-cloud 15
    (automatically fetches latest Sentinel-2, rotates files, runs multispectral detection)
  python ml/live_refresh.py --auto-fetch --allow-demo-fallback
    (explicitly allows bundled demo imagery when the live provider is unavailable)
"""

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
STATUS_PATH = DATA_DIR / "live_pipeline_status.json"


def run_step(name: str, cmd: List[str]) -> Dict:
    started = datetime.now().isoformat()
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUTF8"] = "1"
    proc = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True, env=env)
    ended = datetime.now().isoformat()
    stdout_tail = "\n".join(proc.stdout.strip().splitlines()[-20:]) if proc.stdout else ""
    stderr_tail = "\n".join(proc.stderr.strip().splitlines()[-20:]) if proc.stderr else ""
    return {
        "name": name,
        "command": " ".join(cmd),
        "exit_code": proc.returncode,
        "started_at": started,
        "ended_at": ended,
        "stdout_tail": stdout_tail,
        "stderr_tail": stderr_tail,
    }


def file_info(path: Path) -> Dict:
    if not path.exists():
        return {"path": str(path.relative_to(ROOT)).replace("\\", "/"), "exists": False}
    stat = path.stat()
    return {
        "path": str(path.relative_to(ROOT)).replace("\\", "/"),
        "exists": True,
        "size_bytes": stat.st_size,
        "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
    }


def build_dump_command(args) -> List[str]:
    base = [sys.executable, "ml/dump_detector.py", "--out", "data/detected_dumps.geojson"]
    if args.mode == "demo":
        return [sys.executable, "ml/dump_detector.py", "--demo"]
    if args.mode == "rgb":
        if not args.rgb:
            raise ValueError("--rgb is required when --mode rgb")
        return base + ["--rgb", args.rgb]
    if args.mode == "multispectral":
        if not args.date1 or not args.date2:
            raise ValueError("--date1 and --date2 are required when --mode multispectral")
        return base + ["--date1", args.date1, "--date2", args.date2]
    raise ValueError(f"Unknown mode: {args.mode}")


def build_risk_command(args) -> List[str]:
    output = ["--output", "data/risk_grid_predicted.geojson"]
    if args.risk_real_data:
        return [sys.executable, "ml/risk_predictor.py", "--real-data", args.risk_real_data] + output
    if args.mode == "demo":
        return [sys.executable, "ml/risk_predictor.py", "--demo"] + output
    return [sys.executable, "ml/risk_predictor.py"] + output


def write_status(payload: Dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(STATUS_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)


def main() -> int:
    parser = argparse.ArgumentParser(description="OrbitClean daily refresh runner")
    parser.add_argument("--mode", choices=["demo", "rgb", "multispectral"], default="demo")
    parser.add_argument("--date1", help="Earlier 6-band GeoTIFF path")
    parser.add_argument("--date2", help="Later 6-band GeoTIFF path")
    parser.add_argument("--rgb", help="Single RGB GeoTIFF path")
    parser.add_argument("--risk-real-data", help="CSV path for risk predictor --real-data")
    parser.add_argument("--skip-risk", action="store_true", help="Skip risk prediction refresh")
    parser.add_argument("--auto-fetch", action="store_true", help="Automatically fetch latest Sentinel-2 data before running detection")
    parser.add_argument("--max-cloud", type=float, default=20, help="Max cloud cover %% for auto-fetch (default: 20)")
    parser.add_argument("--days-lookback", type=int, default=30, help="Days to search backwards for Sentinel-2 scenes (default: 30)")
    parser.add_argument("--bbox", help="AOI boundingbox for auto-fetch (default: Thanisandra)")
    parser.add_argument(
        "--allow-demo-fallback",
        action="store_true",
        help="Allow bundled demo imagery if live Sentinel-2 fetching fails",
    )
    args = parser.parse_args()

    started = datetime.now().isoformat()
    status = {
        "status": "running",
        "started_at": started,
        "mode": args.mode,
        "auto_fetch": args.auto_fetch,
        "inputs": {
            "date1": args.date1,
            "date2": args.date2,
            "rgb": args.rgb,
            "risk_real_data": args.risk_real_data,
        },
        "steps": [],
    }
    write_status(status)

    try:
        # Step 1: Auto-fetch Sentinel-2 if requested
        if args.auto_fetch:
            sentinel_cmd = [
                sys.executable,
                "ml/sentinel_fetcher.py",
                "--max-cloud",
                str(args.max_cloud),
                "--days-lookback",
                str(args.days_lookback),
                "--metadata-out",
                "data/s2_fetch_metadata.json",
            ]
            if args.bbox:
                sentinel_cmd.extend(["--bbox", args.bbox])
            if args.allow_demo_fallback:
                sentinel_cmd.append("--allow-demo-fallback")
            fetch_step = run_step("sentinel_fetcher", sentinel_cmd)
            status["steps"].append(fetch_step)
            
            if fetch_step["exit_code"] != 0:
                status["status"] = "failed"
                status["finished_at"] = datetime.now().isoformat()
                write_status(status)
                print(f"[refresh] status=failed (sentinel fetch failed)")
                return 1
            
            # After successful fetch, set mode to multispectral with fetched files
            args.mode = "multispectral"
            args.date1 = "data/s2_prev.tif"
            args.date2 = "data/s2_curr.tif"

        # Step 2: Run dump detection
        dump_step = run_step("dump_detector", build_dump_command(args))
        status["steps"].append(dump_step)

        # Step 3: Run risk prediction
        if not args.skip_risk:
            risk_step = run_step("risk_predictor", build_risk_command(args))
            status["steps"].append(risk_step)

        success = all(step["exit_code"] == 0 for step in status["steps"])
        status["status"] = "ok" if success else "failed"
    except Exception as exc:
        status["status"] = "failed"
        status["steps"].append({
            "name": "orchestrator",
            "exit_code": 1,
            "error": str(exc),
        })

    status["finished_at"] = datetime.now().isoformat()
    status["outputs"] = {
        "detected_dumps": file_info(DATA_DIR / "detected_dumps.geojson"),
        "risk_grid": file_info(DATA_DIR / "risk_grid_predicted.geojson"),
        "s2_prev": file_info(DATA_DIR / "s2_prev.tif"),
        "s2_curr": file_info(DATA_DIR / "s2_curr.tif"),
        "s2_metadata": file_info(DATA_DIR / "s2_fetch_metadata.json"),
    }

    write_status(status)

    print(f"[refresh] status={status['status']}")
    for step in status["steps"]:
        print(f"[refresh] {step.get('name')}: exit={step.get('exit_code')}")

    return 0 if status["status"] == "ok" else 1


if __name__ == "__main__":
    raise SystemExit(main())
