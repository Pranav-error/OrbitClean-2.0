"""
Advanced-4: Kabadiwala Integration + Alert Pipeline
Matches detected recyclable waste dumps to nearest registered recycler/kabadiwala.
Sends WhatsApp alerts via Twilio (or mock for demo).

Usage:
    python kabadiwala_alert.py --demo
    python kabadiwala_alert.py --dump DUMP-001 --geojson data/thanisandra_dumps.geojson
"""

import json
import os
import math
import argparse
from datetime import datetime

# Recyclable waste value estimates (₹/kg)
WASTE_VALUES = {
    'Dry Recyclable': 7.0,
    'Dry/Blue':       6.5,
    'Mixed':          4.0,
    'Mixed Plastic':  5.5,
}

# Twilio config (from environment)
TWILIO_SID    = os.environ.get('TWILIO_ACCOUNT_SID', 'DEMO_SID')
TWILIO_TOKEN  = os.environ.get('TWILIO_AUTH_TOKEN',  'DEMO_TOKEN')
TWILIO_FROM   = os.environ.get('TWILIO_WHATSAPP_FROM', 'whatsapp:+14155238886')


def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return 2 * R * math.asin(math.sqrt(a))


def load_recyclers(recyclers_path="data/recyclers.geojson"):
    with open(recyclers_path) as f:
        gj = json.load(f)
    recyclers = []
    for feat in gj['features']:
        coords = feat['geometry']['coordinates']
        recyclers.append({
            **feat['properties'],
            'lat': coords[1],
            'lon': coords[0],
        })
    return recyclers


def estimate_waste_value(area_sqm, waste_type, density_kg_m3=150):
    """Estimate recyclable market value from dump area."""
    volume_m3 = area_sqm * 0.4   # avg depth 0.4m
    mass_kg   = volume_m3 * density_kg_m3
    rate      = WASTE_VALUES.get(waste_type, 4.0)
    return round(mass_kg * rate), round(mass_kg)


def find_nearest_recycler(dump_lat, dump_lon, recyclers, waste_type, max_km=3.0):
    """Find nearest recycler that accepts the waste stream."""
    stream_map = {
        'Dry Recyclable': 'Dry/Blue', 'Mixed Plastic': 'Dry/Blue',
        'Mixed': 'Dry/Blue', 'Organic': 'Wet/Green',
        'Hazardous': 'Hazardous/Black', 'Construction Debris': 'Dry/Blue',
    }
    target_stream = stream_map.get(waste_type, 'Dry/Blue')

    candidates = []
    for r in recyclers:
        if target_stream not in r.get('accepts', []):
            continue
        dist = haversine_km(dump_lat, dump_lon, r['lat'], r['lon'])
        if dist <= max_km:
            candidates.append({**r, 'distance_km': round(dist, 2)})

    candidates.sort(key=lambda c: c['distance_km'])
    return candidates[:3]  # Top 3 nearest


def format_whatsapp_message(dump, recycler, value_inr, mass_kg):
    """Format WhatsApp alert message (Twilio-friendly)."""
    dump_props = dump['properties']
    coords     = dump['geometry']['coordinates']
    maps_url   = f"https://maps.google.com/?q={coords[1]},{coords[0]}"

    msg = (
        f"🗑️ *OrbitClean Alert* — New Recyclable Waste Detected\n\n"
        f"📍 Location: {dump_props.get('name', 'Unknown')}\n"
        f"   GPS: {coords[1]:.4f}, {coords[0]:.4f}\n"
        f"   Maps: {maps_url}\n\n"
        f"📦 Waste type: {dump_props.get('waste_type', 'Unknown')}\n"
        f"⚖️ Estimated weight: ~{mass_kg:,} kg\n"
        f"💰 Estimated value: ₹{value_inr:,}\n\n"
        f"📏 Distance from you: {recycler['distance_km']} km\n"
        f"⏰ Collect within *4 hours* for best availability\n\n"
        f"_Powered by OrbitClean 2.0 — Team Resonance_"
    )
    return msg


def send_whatsapp_alert(to_number, message, use_twilio=False):
    """Send WhatsApp alert. Mock by default, real Twilio when configured."""
    if use_twilio and TWILIO_SID != 'DEMO_SID':
        try:
            from twilio.rest import Client
            client = Client(TWILIO_SID, TWILIO_TOKEN)
            msg = client.messages.create(
                body=message,
                from_=TWILIO_FROM,
                to=f"whatsapp:{to_number}"
            )
            return {'status': 'sent', 'sid': msg.sid, 'to': to_number}
        except Exception as e:
            return {'status': 'error', 'error': str(e), 'to': to_number}
    else:
        # Mock mode
        print(f"\n[MOCK ALERT → {to_number}]")
        print("-" * 50)
        print(message)
        print("-" * 50)
        return {'status': 'mock_sent', 'to': to_number}


def process_dump_for_alerts(dump_feature, recyclers_path="data/recyclers.geojson",
                            notify=False, output_log=None):
    props  = dump_feature['properties']
    coords = dump_feature['geometry']['coordinates']
    lat, lon = coords[1], coords[0]

    waste_type = props.get('waste_type', 'Mixed')
    area       = props.get('area_sqm', 100)

    # Only alert for recyclable waste types
    recyclable_streams = {'Dry Recyclable', 'Dry/Blue', 'Mixed Plastic', 'Mixed'}
    if waste_type not in recyclable_streams:
        return {'status': 'skipped', 'reason': f"Non-recyclable waste: {waste_type}"}

    value_inr, mass_kg = estimate_waste_value(area, waste_type)
    recyclers           = load_recyclers(recyclers_path)
    candidates          = find_nearest_recycler(lat, lon, recyclers, waste_type)

    if not candidates:
        return {'status': 'no_recyclers', 'reason': 'No eligible recyclers within 3km'}

    alerts_sent = []
    for recycler in candidates[:2]:  # Alert top 2
        message = format_whatsapp_message(dump_feature, recycler, value_inr, mass_kg)
        to = recycler.get('whatsapp', recycler.get('contact', ''))
        result = send_whatsapp_alert(to, message, use_twilio=notify)
        alerts_sent.append({
            'recycler_id':   recycler.get('id'),
            'recycler_name': recycler.get('name'),
            'distance_km':   recycler['distance_km'],
            'alert_status':  result['status'],
            'value_inr':     value_inr,
            'mass_kg':       mass_kg,
            'sent_at':       datetime.now().isoformat(),
        })

    log_entry = {
        'dump_id':    props.get('id', 'UNKNOWN'),
        'waste_type': waste_type,
        'alerts':     alerts_sent,
        'best_match': alerts_sent[0] if alerts_sent else None,
    }

    if output_log:
        existing = []
        if os.path.exists(output_log):
            with open(output_log) as f:
                existing = json.load(f)
        existing.append(log_entry)
        with open(output_log, 'w') as f:
            json.dump(existing, f, indent=2)

    return log_entry


def run_demo():
    print("[DEMO] Kabadiwala Alert System\n")
    dumps_path = "data/thanisandra_dumps.geojson"
    if not os.path.exists(dumps_path):
        print("[WARN] Dump data not found. Run from project root.")
        return

    with open(dumps_path) as f:
        dumps = json.load(f)

    results = []
    for dump in dumps['features']:
        result = process_dump_for_alerts(dump, notify=False, output_log="data/kabadiwala_log.json")
        results.append(result)

    sent = sum(1 for r in results if r.get('status') != 'skipped' and r.get('alerts'))
    print(f"\n[DEMO] Alerts sent: {sent}/{len(results)} dump sites")
    return results


def main():
    parser = argparse.ArgumentParser(description="OrbitClean Kabadiwala Alert")
    parser.add_argument("--dump",    help="Dump ID to alert for")
    parser.add_argument("--geojson", default="data/thanisandra_dumps.geojson")
    parser.add_argument("--notify",  action="store_true", help="Send real WhatsApp via Twilio")
    parser.add_argument("--demo",    action="store_true")
    args = parser.parse_args()

    if args.demo or not args.dump:
        run_demo(); return

    with open(args.geojson) as f:
        gj = json.load(f)

    dump = next((f for f in gj['features']
                 if f['properties'].get('id') == args.dump), None)
    if not dump:
        print(f"[ERROR] Dump {args.dump} not found")
        return

    result = process_dump_for_alerts(dump, notify=args.notify)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
