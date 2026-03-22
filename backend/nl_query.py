"""
Advanced-1: LLM Natural Language Intelligence Interface
Uses Claude API to interpret spatial queries about dump sites and return answers.

Usage:
    python nl_query.py --query "Show dump sites within 500m of a school in Thanisandra"
    python nl_query.py --interactive
"""

import json
import os
import sys
import argparse
from datetime import datetime

try:
    import anthropic
    HAS_ANTHROPIC = True
except ImportError:
    HAS_ANTHROPIC = False


SYSTEM_PROMPT = """You are OrbitClean's spatial intelligence assistant for BBMP (Bruhat Bengaluru Mahanagara Palike).
You have access to real-time data on illegal dump sites, waste risk predictions, and recycler locations in Bengaluru.

Your role: Answer natural-language questions about dump sites, enforcement priorities, and SWM compliance.
Be concise, data-driven, and action-oriented. Always cite specific GPS coordinates, distances, or risk scores when relevant.
Suggest concrete next steps for BBMP officers.

When generating enforcement reports, use this structure:
- Site ID and location
- Waste type and volume estimate
- Risk score and recurrence probability
- Recommended intervention with ROI
- Nearest recycler for circular economy routing

Today's date: {today}
"""


def load_context_data():
    """Load all available data files for LLM context."""
    context = {}
    data_files = {
        'dumps': 'data/thanisandra_dumps.geojson',
        'risk_grid': 'data/risk_grid.geojson',
        'recyclers': 'data/recyclers.geojson',
        'ward_scores': 'data/ward_scores.json',
        'water_bodies': 'data/water_bodies.geojson',
    }
    for key, path in data_files.items():
        if os.path.exists(path):
            with open(path) as f:
                context[key] = json.load(f)
        else:
            context[key] = None
    return context


def summarise_context(context):
    """Create a compact text summary of the data for the LLM context window."""
    lines = []

    # Dump sites
    dumps = context.get('dumps')
    if dumps and dumps.get('features'):
        lines.append(f"=== ACTIVE DUMP SITES ({len(dumps['features'])} sites) ===")
        for f in dumps['features']:
            p = f['properties']
            c = f['geometry']['coordinates']
            lines.append(
                f"  {p.get('id','?')}: {p.get('name','?')} | GPS: {c[1]:.4f},{c[0]:.4f} | "
                f"Type: {p.get('waste_type','?')} | Status: {p.get('status','?')} | "
                f"Risk: {p.get('risk_score','?')} | Area: {p.get('area_sqm','?')}m² | "
                f"CO2: {p.get('co2_eq_tonnes','?')}T | "
                f"Nearest recycler: {p.get('nearest_recycler','?')} ({p.get('recycler_distance_km','?')}km) | "
                f"Water risk: {p.get('water_risk','?')} | CCTV: {p.get('cctv_coverage','?')}"
            )
    lines.append("")

    # Risk grid summary
    risk = context.get('risk_grid')
    if risk and risk.get('features'):
        high_risk = [f for f in risk['features'] if f['properties'].get('risk_score', 0) > 0.8]
        lines.append(f"=== RISK GRID: {len(risk['features'])} cells, {len(high_risk)} critical (score>0.8) ===")
        for f in high_risk[:5]:
            p = f['properties']
            c = f['geometry']['coordinates']
            lines.append(f"  {p.get('cell_id','?')}: GPS {c[1]:.4f},{c[0]:.4f} | Ward: {p.get('ward','?')} | Score: {p.get('risk_score','?')}")
    lines.append("")

    # Recyclers
    recyclers = context.get('recyclers')
    if recyclers and recyclers.get('features'):
        lines.append(f"=== RECYCLERS/KABADIWALA ({len(recyclers['features'])} registered) ===")
        for f in recyclers['features']:
            p = f['properties']
            c = f['geometry']['coordinates']
            lines.append(f"  {p.get('id','?')}: {p.get('name','?')} ({p.get('type','?')}) | "
                        f"GPS: {c[1]:.4f},{c[0]:.4f} | Accepts: {','.join(p.get('accepts',[]))}")
    lines.append("")

    # Ward scores
    scores = context.get('ward_scores')
    if scores and scores.get('all'):
        lines.append("=== WARD ACCOUNTABILITY SCORES (WAScore — higher = WORSE) ===")
        for w in scores['all']:
            lines.append(f"  Ward {w['ward_id']} {w['ward_name']}: WAScore={w['wascore']} ({w['grade_label']}) | "
                        f"Active dumps: {w['active_dumps']} | Trend: {w['trend']}")
    lines.append("")

    # Water bodies
    water = context.get('water_bodies')
    if water and water.get('features'):
        lines.append("=== WATER BODIES (contamination risk) ===")
        for f in water['features']:
            p = f['properties']
            lines.append(f"  {p.get('name','?')} ({p.get('type','?')}) | "
                        f"Pop. at risk: {p.get('population_at_risk','?')} | CI: {p.get('contamination_index','?')}")

    return "\n".join(lines)


def query_claude(user_query, context_summary=None, stream=True):
    """Send query to Claude API with spatial context."""
    if not HAS_ANTHROPIC:
        return mock_response(user_query)

    api_key = os.environ.get('ANTHROPIC_API_KEY')
    if not api_key:
        print("[WARN] ANTHROPIC_API_KEY not set. Using mock response.")
        return mock_response(user_query)

    client = anthropic.Anthropic(api_key=api_key)
    today  = datetime.now().strftime("%Y-%m-%d")

    messages = []
    if context_summary:
        messages.append({
            "role": "user",
            "content": f"Here is the current OrbitClean spatial database:\n\n{context_summary}\n\n"
                       f"User query: {user_query}"
        })
    else:
        messages.append({"role": "user", "content": user_query})

    full_response = ""
    if stream:
        with client.messages.stream(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            system=SYSTEM_PROMPT.format(today=today),
            messages=messages,
        ) as s:
            for text in s.text_stream:
                print(text, end="", flush=True)
                full_response += text
        print()
    else:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            system=SYSTEM_PROMPT.format(today=today),
            messages=messages,
        )
        full_response = response.content[0].text

    return full_response


def mock_response(query):
    """Intelligent mock response for demo when API key not available."""
    q_lower = query.lower()

    if 'school' in q_lower or '500m' in q_lower:
        return (
            "Based on the current dump site database, **DUMP-001** (Thanisandra Main Road) "
            "is located approximately 320m from Thanisandra Government School at 13.0563°N, 77.6297°E. "
            "Risk score: 0.87 (Critical). Recommended action: Deploy enforcement team within 24 hours. "
            "Install IoT camera to prevent recurrence (ROI: 4.2x over 7 years)."
        )
    elif 'worst' in q_lower or 'highest' in q_lower or 'risk' in q_lower:
        return (
            "**Hebbal Ward** (Ward 4) currently has the highest WAScore at 68.2 (Poor). "
            "6 active dump sites, including DUMP-003 at Hebbal Market area — "
            "risk score 0.93, contaminating Hebbal Lake (12,000 residents at risk). "
            "Priority action: Emergency cleanup + solar camera installation at GPS 13.0510°N, 77.5975°E."
        )
    elif 'report' in q_lower or 'enforcement' in q_lower:
        return (
            "**OrbitClean Enforcement Report — Ward 26 (Thanisandra)**\n"
            "Generated: " + datetime.now().strftime('%Y-%m-%d %H:%M') + "\n\n"
            "DUMP-001 | 13.0563°N, 77.6297°E | Mixed waste, 145m² | Risk: 0.87\n"
            "  → Recommended: Solar IoT camera (₹60K investment saves ₹108K over 3 years)\n"
            "  → Nearest recycler: SAAHAS 80ft Rd (1.2km) — alert sent\n\n"
            "DUMP-002 | 13.0565°N, 77.6292°E | Organic, 89m² | Risk: 0.74\n"
            "  → Recommended: Community bin installation (₹80K, 95% dump reduction)\n\n"
            "SWM Rules 2026 compliance: ⚠️ Ward 26 missed 48-hr collection target on 3 occasions this week."
        )
    elif 'carbon' in q_lower or 'co2' in q_lower:
        return (
            "Current active dump sites in Thanisandra ward generate an estimated **16.1 tonnes CO₂-eq** "
            "through methane emissions (IPCC Tier 1 calculation). At current carbon credit prices (₹2,000/tonne), "
            "remediation would generate **₹32,200 in carbon credits**. "
            "Hebbal Market dump alone contributes 3.8 tonnes CO₂-eq — prioritise for immediate cleanup."
        )
    elif 'kabadiwala' in q_lower or 'recycler' in q_lower:
        return (
            "3 kabadiwala alerts are currently active:\n"
            "• Raju Kabadiwala (0.5km from DUMP-004): Notified of 5.2T dry recyclable waste (est. ₹36,400)\n"
            "• Mohammed Kabadiwala (0.8km from DUMP-002): Notified of mixed dry waste\n"
            "• SAAHAS 80ft Road: 1.2km from DUMP-001 — waiting for confirmation\n\n"
            "Total circular economy value recovered this week: **₹52,800**"
        )
    else:
        return (
            f"Query received: '{query}'\n\n"
            "I can answer questions about:\n"
            "• Active dump sites and their locations\n"
            "• Ward risk scores and accountability (WAScore)\n"
            "• Carbon credit quantification\n"
            "• Nearest recycler/kabadiwala matching\n"
            "• Enforcement report generation\n"
            "• Water contamination risk\n\n"
            "Example: 'Generate an enforcement report for Ward 26' or "
            "'Which sites are near water bodies?'"
        )


def interactive_mode():
    print("\nOrbitClean NL Query Interface (type 'exit' to quit)")
    print("=" * 60)
    context = load_context_data()
    ctx_summary = summarise_context(context)

    while True:
        try:
            query = input("\nQuery: ").strip()
            if query.lower() in ('exit', 'quit', 'q'):
                break
            if not query:
                continue
            print("\nResponse:")
            query_claude(query, ctx_summary)
        except KeyboardInterrupt:
            break


def main():
    parser = argparse.ArgumentParser(description="OrbitClean NL Query Interface")
    parser.add_argument("--query",       help="Single query string")
    parser.add_argument("--interactive", action="store_true")
    parser.add_argument("--no-context",  action="store_true", help="Skip loading GeoJSON context")
    args = parser.parse_args()

    context     = load_context_data() if not args.no_context else {}
    ctx_summary = summarise_context(context) if context else None

    if args.interactive:
        interactive_mode()
    elif args.query:
        print(f"\nQuery: {args.query}")
        print("Response:")
        query_claude(args.query, ctx_summary)
    else:
        # Demo queries
        demo_queries = [
            "Which ward has the highest recurrence risk this week?",
            "Generate a brief enforcement report for Thanisandra",
        ]
        for q in demo_queries:
            print(f"\nQ: {q}")
            print(f"A: {mock_response(q)}\n")
            print("-" * 60)


if __name__ == "__main__":
    main()
