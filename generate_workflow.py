import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
import matplotlib.patheffects as pe
import numpy as np

fig, ax = plt.subplots(figsize=(20, 28))
ax.set_xlim(0, 20)
ax.set_ylim(0, 28)
ax.axis('off')

# Background
fig.patch.set_facecolor('#0A0E1A')
ax.set_facecolor('#0A0E1A')

# ─── Color palette ───────────────────────────────────────────────────────────
C_SPACE   = '#1B2A6B'   # dark blue  — space layer
C_GEO     = '#0D4F3C'   # dark green — geospatial layer
C_AI      = '#4A1A6B'   # dark purple— AI/ML layer
C_ROUTE   = '#6B2D00'   # dark orange— routing layer
C_DASH    = '#00395A'   # dark teal  — dashboard layer
C_BORDER  = '#FFFFFF'
C_TEXT    = '#FFFFFF'
C_ACC1    = '#00D4FF'   # cyan accent
C_ACC2    = '#7CFC00'   # green accent
C_ACC3    = '#FF6B35'   # orange accent
C_ACC4    = '#C77DFF'   # purple accent
C_ACC5    = '#FFD700'   # gold accent

ARROW_C   = '#AAAAAA'

# ─── Helper: rounded box ──────────────────────────────────────────────────────
def draw_box(ax, cx, cy, w, h, fill, border, label, sublabel=None,
             icon=None, label_size=11, sub_size=8.5, radius=0.4, alpha=0.92):
    x, y = cx - w/2, cy - h/2
    box = FancyBboxPatch((x, y), w, h,
                         boxstyle=f"round,pad=0,rounding_size={radius}",
                         facecolor=fill, edgecolor=border,
                         linewidth=1.8, alpha=alpha, zorder=3)
    ax.add_patch(box)
    if icon:
        ax.text(cx, cy + h*0.18, icon, ha='center', va='center',
                fontsize=18, zorder=5)
        ax.text(cx, cy - 0.05, label, ha='center', va='center',
                fontsize=label_size, fontweight='bold', color=C_TEXT,
                zorder=5, wrap=True)
    else:
        ax.text(cx, cy + (0.2 if sublabel else 0), label,
                ha='center', va='center', fontsize=label_size,
                fontweight='bold', color=C_TEXT, zorder=5)
    if sublabel:
        ax.text(cx, cy - 0.38, sublabel, ha='center', va='center',
                fontsize=sub_size, color='#CCCCCC', zorder=5, style='italic')

def arrow(ax, x1, y1, x2, y2, color=ARROW_C):
    ax.annotate('', xy=(x2, y2), xytext=(x1, y1),
                arrowprops=dict(arrowstyle='->', color=color, lw=2.0),
                zorder=4)

def hline(ax, x1, x2, y, color=ARROW_C):
    ax.annotate('', xy=(x2, y), xytext=(x1, y),
                arrowprops=dict(arrowstyle='->', color=color, lw=2.0),
                zorder=4)

# ═══════════════════════════════════════════════════════════════════════
#  TITLE
# ═══════════════════════════════════════════════════════════════════════
ax.text(10, 27.3, 'OrbitClean — Methodology & Workflow',
        ha='center', va='center', fontsize=22, fontweight='bold',
        color=C_ACC1, zorder=6,
        path_effects=[pe.withStroke(linewidth=4, foreground='#0A0E1A')])
ax.text(10, 26.75, 'Space-Enabled Waste Intelligence for Bengaluru · Team Resonance · AWI SpaceTech Hackathon 2026',
        ha='center', va='center', fontsize=10, color='#AAAAAA', zorder=6)

# ═══════════════════════════════════════════════════════════════════════
#  LAYER LABELS (left spine)
# ═══════════════════════════════════════════════════════════════════════
layers = [
    (26.1, 'LAYER 1', 'Space & Remote Sensing', C_ACC1),
    (21.7, 'LAYER 2', 'Geospatial Analysis', C_ACC2),
    (17.0, 'LAYER 3', 'AI & Classification', C_ACC4),
    (12.4, 'LAYER 4', 'Routing & Logistics', C_ACC3),
    ( 7.5, 'LAYER 5', 'Platform & Delivery', C_ACC5),
]
for yy, l1, l2, col in layers:
    ax.text(0.35, yy, l1, ha='center', va='center', fontsize=7,
            fontweight='bold', color=col, rotation=90, zorder=6)
    ax.text(0.75, yy, l2, ha='center', va='center', fontsize=6.5,
            color='#AAAAAA', rotation=90, zorder=6)

# ═══════════════════════════════════════════════════════════════════════
#  LAYER 1 — Space & Remote Sensing  (y ≈ 24.5 – 27.5)
# ═══════════════════════════════════════════════════════════════════════
# Three input nodes side by side
draw_box(ax,  4.0, 25.6, 5.0, 1.6, C_SPACE, C_ACC1,
         'Sentinel-2 Satellite', 'Copernicus Open Access Hub\n10 m resolution · 5-day revisit',
         label_size=10.5)
draw_box(ax, 10.0, 25.6, 4.2, 1.6, C_SPACE, C_ACC1,
         'ISRO Bhuvan Portal', 'Indian geospatial layers\nWard & lakebed boundaries',
         label_size=10.5)
draw_box(ax, 16.0, 25.6, 3.6, 1.6, C_SPACE, C_ACC1,
         'Field Survey (GPS)', 'GPS-tagged dump sites\nThanisandra, 7 Mar 2026',
         label_size=10.5)

# Converge arrows → GEE box
for sx in [4.0, 10.0, 16.0]:
    arrow(ax, sx, 24.8, sx, 24.1)

# GEE processing box (full width)
draw_box(ax, 10.0, 23.5, 16.5, 1.1, C_SPACE, C_ACC1,
         'Google Earth Engine (GEE) — Cloud Processing',
         'Band extraction · Spectral indices (NDVI, SWIR) · Temporal compositing · Anomaly flagging',
         label_size=11)

arrow(ax, 10.0, 22.95, 10.0, 22.2)

# ═══════════════════════════════════════════════════════════════════════
#  LAYER 2 — Geospatial Analysis  (y ≈ 20.0 – 22.2)
# ═══════════════════════════════════════════════════════════════════════
draw_box(ax, 5.5, 21.5, 7.5, 1.1, C_GEO, C_ACC2,
         'QGIS Spatial Analysis',
         'Ward polygons · Road network (QuickOSM) · Water bodies overlay')
draw_box(ax, 14.5, 21.5, 7.5, 1.1, C_GEO, C_ACC2,
         'Spectral Anomaly Detection',
         'Mixed waste signature: disturbed soil + plastic + stressed vegetation')

arrow(ax,  5.5, 20.95,  5.5, 20.2)
arrow(ax, 14.5, 20.95, 14.5, 20.2)

draw_box(ax, 10.0, 19.6, 16.5, 1.1, C_GEO, C_ACC2,
         'Dump Site Hotspot Layer — GeoJSON Output',
         '6 GPS-validated dump sites · Thanisandra/Hebbal/Yelahanka/Kodigehalli wards · High-risk grid overlay')

arrow(ax, 10.0, 19.05, 10.0, 18.3)

# ═══════════════════════════════════════════════════════════════════════
#  LAYER 3 — AI & Classification  (y ≈ 14.8 – 18.3)
# ═══════════════════════════════════════════════════════════════════════
# Three parallel AI modules
draw_box(ax,  4.0, 17.5, 5.5, 1.5, C_AI, C_ACC4,
         'YOLOv8 + OpenCV',
         '4-stream waste classification\nOrganic · Recyclable · Hazardous · Residual',
         label_size=10)
draw_box(ax, 10.0, 17.5, 5.0, 1.5, C_AI, C_ACC4,
         'Random Forest Classifier',
         'Risk scoring per dump site\nFeed: spectral + temporal features',
         label_size=10)
draw_box(ax, 16.0, 17.5, 5.5, 1.5, C_AI, C_ACC4,
         'Volume Estimator',
         'Bounding box pixel area x 100 m2\n+ spectral density proxy',
         label_size=10)

for sx in [4.0, 10.0, 16.0]:
    arrow(ax, sx, 16.75, sx, 16.1)

# K-Means clustering
draw_box(ax,  6.5, 15.5, 8.0, 1.1, C_AI, C_ACC4,
         'K-Means Clustering',
         'Group hotspots by waste type · density · proximity · risk score')
draw_box(ax, 15.0, 15.5, 7.5, 1.1, C_AI, C_ACC4,
         'Carbon & Environmental Risk',
         '248T CO₂-eq estimated · ₹497K carbon credits · Water body proximity score')

arrow(ax,  6.5, 14.95,  6.5, 14.25)
arrow(ax, 15.0, 14.95, 15.0, 14.25)

draw_box(ax, 10.0, 13.65, 16.5, 1.1, C_AI, C_ACC4,
         'Anomaly Detector + XGBoost Risk Predictor — Prioritised Alert List',
         'Priority score per site · Ugadi surge forecast (+38% Apr 1) · Auto-retraining pipeline')

arrow(ax, 10.0, 13.1, 10.0, 12.35)

# ═══════════════════════════════════════════════════════════════════════
#  LAYER 4 — Routing & Logistics  (y ≈ 9.5 – 12.35)
# ═══════════════════════════════════════════════════════════════════════
draw_box(ax,  4.5, 11.6, 5.5, 1.4, C_ROUTE, C_ACC3,
         'Smart Vehicle Assignment',
         'Waste type → vehicle type\nORS Tools / QGIS dispatch',
         label_size=10)
draw_box(ax, 10.0, 11.6, 4.5, 1.4, C_ROUTE, C_ACC3,
         'Genetic Algorithm',
         'Route optimisation\nFuel · time · capacity',
         label_size=10)
draw_box(ax, 15.5, 11.6, 5.5, 1.4, C_ROUTE, C_ACC3,
         'Kabadiwala Integration',
         '7 recyclers mapped\nWhatsApp alert dispatch',
         label_size=10)

for sx in [4.5, 10.0, 15.5]:
    arrow(ax, sx, 10.9, sx, 10.2)

draw_box(ax, 10.0, 9.65, 16.5, 1.1, C_ROUTE, C_ACC3,
         'Optimised Collection Routes — GeoJSON + Schedule Output',
         'Multi-vehicle dispatch · Stream-specific routing · SWM Rules 2026 compliant · Digital proof-of-collection')

arrow(ax, 10.0, 9.1, 10.0, 8.35)

# ═══════════════════════════════════════════════════════════════════════
#  LAYER 5 — Platform & Delivery  (y ≈ 4.5 – 8.35)
# ═══════════════════════════════════════════════════════════════════════
# FastAPI backend
draw_box(ax, 10.0, 7.8, 10.0, 1.1, C_DASH, C_ACC5,
         'FastAPI Backend — REST API + Swagger UI',
         'Ward scorer · Claude AI NL interface · ML endpoint bridge · Cleanup mission management')

arrow(ax, 10.0, 7.25, 10.0, 6.5)

# Three frontend outputs
draw_box(ax,  4.0, 5.9, 5.0, 1.5, C_DASH, C_ACC5,
         'Leaflet.js Dashboard',
         'Interactive map · Hotspot layers\nOptimised routes · Ward heatmap',
         label_size=10)
draw_box(ax, 10.0, 5.9, 4.5, 1.5, C_DASH, C_ACC5,
         'Ward Leaderboard',
         'Community gamification\nCompliance scoring',
         label_size=10)
draw_box(ax, 16.0, 5.9, 5.0, 1.5, C_DASH, C_ACC5,
         'QR Reporting Portal',
         'Citizen dump reporting\nGeo-tagged photo upload',
         label_size=10)

# ═══════════════════════════════════════════════════════════════════════
#  OUTCOMES  (y ≈ 2.0 – 4.5)
# ═══════════════════════════════════════════════════════════════════════
for sx in [4.0, 10.0, 16.0]:
    arrow(ax, sx, 5.15, sx, 4.35)

outcomes = [
    ( 3.2, 3.75, 'Early Detection',      'Proactive dump\nsite interception'),
    ( 6.8, 3.75, 'Carbon Credits',       'Rs.497K CO2-eq\nvalue recovery'),
    (10.0, 3.75, 'SWM 2026 Compliance',  'Digital audit trail\n4-stream enforcement'),
    (13.2, 3.75, 'Fuel Savings',         'Optimised routes\nreduce emissions'),
    (16.8, 3.75, 'Community Loop',       'Citizens → Data\nData → Action'),
]
for cx, cy, lab, sub in outcomes:
    draw_box(ax, cx, cy, 3.0, 1.4, '#111827', '#444444', lab, sub,
             label_size=9, sub_size=7.5, radius=0.3)

# Outcome header
ax.text(10.0, 4.5, 'EXPECTED OUTCOMES', ha='center', va='center',
        fontsize=10, fontweight='bold', color='#888888', zorder=6)

# ═══════════════════════════════════════════════════════════════════════
#  LEGEND bottom strip
# ═══════════════════════════════════════════════════════════════════════
legend_items = [
    (C_SPACE, C_ACC1, 'Space & Remote Sensing'),
    (C_GEO,   C_ACC2, 'Geospatial Analysis'),
    (C_AI,    C_ACC4, 'AI & Machine Learning'),
    (C_ROUTE, C_ACC3, 'Routing & Logistics'),
    (C_DASH,  C_ACC5, 'Platform & Dashboard'),
]
lx = 1.5
for fc, bc, label in legend_items:
    rect = FancyBboxPatch((lx, 1.0), 2.8, 0.6,
                          boxstyle='round,pad=0,rounding_size=0.15',
                          facecolor=fc, edgecolor=bc, linewidth=1.5, zorder=6)
    ax.add_patch(rect)
    ax.text(lx + 1.4, 1.3, label, ha='center', va='center',
            fontsize=8, color=C_TEXT, zorder=7)
    lx += 3.3

ax.text(10, 0.45, 'OrbitClean 2.0  ·  Team Resonance  ·  REVA University  ·  AWI SpaceTech Hackathon 2026',
        ha='center', va='center', fontsize=8.5, color='#555555', zorder=6)

plt.tight_layout(pad=0)
plt.savefig('/Users/saipranav/Documents/GitHub/AWI-SpaceTech-Hackathon/orbitclean_methodology.png',
            dpi=200, bbox_inches='tight', facecolor='#0A0E1A')
print("Saved: orbitclean_methodology.png")
