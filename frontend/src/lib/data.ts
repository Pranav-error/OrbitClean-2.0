import type {
  DumpSite, WardScore, Recycler,
  RiskCell, ClassificationResult, ForecastDay, WardRouteSolution,
} from "@/types";

export const DUMPS: DumpSite[] = [
  {
    id: "DUMP-001", name: "Thanisandra Main Road Dump",
    waste_type: "Mixed", swm_stream: "Dry/Blue",
    risk_score: 0.87, area_sqm: 145, volume_m3: 12.3,
    detected_date: "2026-03-18", status: "Active",
    recurrence_risk: 0.72, carbon_co2_eq_tonnes: 2.1,
    carbon_credit_inr: 4200, nearest_recycler: "SAAHAS 80ft Road",
    recycler_distance_km: 1.2, water_risk: "Low",
    cctv_coverage: false, ward: "Thanisandra", ward_id: 26,
    best_intervention: "Motion Sensor Light", intervention_cost_inr: 25000, roi_weeks: 6,
    lat: 13.056306, lon: 77.629650,
    estimated_weight_tonnes: 4.6,
  },
  {
    id: "DUMP-002", name: "Residential Colony Dump",
    waste_type: "Organic", swm_stream: "Wet/Green",
    risk_score: 0.74, area_sqm: 89, volume_m3: 7.8,
    detected_date: "2026-03-17", status: "Active",
    recurrence_risk: 0.65, carbon_co2_eq_tonnes: 1.4,
    carbon_credit_inr: 2800, nearest_recycler: "BBMP DWCC Thanisandra",
    recycler_distance_km: 0.8, water_risk: "Medium",
    cctv_coverage: false, ward: "Thanisandra", ward_id: 26,
    best_intervention: "Community Bin Installation", intervention_cost_inr: 80000, roi_weeks: 9,
    lat: 13.056467, lon: 77.629216,
    estimated_weight_tonnes: 2.7,
  },
  {
    id: "DUMP-003", name: "Market Area Dump (Hebbal)",
    waste_type: "Hazardous", swm_stream: "Hazardous/Black",
    risk_score: 0.93, area_sqm: 210, volume_m3: 18.5,
    detected_date: "2026-03-19", status: "Active",
    recurrence_risk: 0.81, carbon_co2_eq_tonnes: 3.8,
    carbon_credit_inr: 7600, nearest_recycler: "Hasiru Dala Hebbal",
    recycler_distance_km: 2.1, water_risk: "High",
    cctv_coverage: false, ward: "Hebbal", ward_id: 4,
    best_intervention: "Solar IoT Camera", intervention_cost_inr: 60000, roi_weeks: 4,
    lat: 13.051234, lon: 77.597680,
    estimated_weight_tonnes: 5.6,
  },
  {
    id: "DUMP-004", name: "Road Junction Dump",
    waste_type: "Dry Recyclable", swm_stream: "Dry/Blue",
    risk_score: 0.68, area_sqm: 62, volume_m3: 5.2,
    detected_date: "2026-03-16", status: "Resolved",
    recurrence_risk: 0.58, carbon_co2_eq_tonnes: 0.9,
    carbon_credit_inr: 1800, nearest_recycler: "Kabadiwala Network",
    recycler_distance_km: 0.5, water_risk: "Low",
    cctv_coverage: true, ward: "Thanisandra", ward_id: 26,
    best_intervention: "No Dumping Signage", intervention_cost_inr: 5000, roi_weeks: 3,
    lat: 13.058900, lon: 77.632100,
    estimated_weight_tonnes: 0.4,
  },
  {
    id: "DUMP-005", name: "Vacant Plot Dump (Yelahanka)",
    waste_type: "Construction Debris", swm_stream: "Dry/Blue",
    risk_score: 0.79, area_sqm: 320, volume_m3: 28.0,
    detected_date: "2026-03-20", status: "Active",
    recurrence_risk: 0.77, carbon_co2_eq_tonnes: 5.1,
    carbon_credit_inr: 10200, nearest_recycler: "SAAHAS Yelahanka",
    recycler_distance_km: 3.4, water_risk: "Low",
    cctv_coverage: false, ward: "Yelahanka", ward_id: 3,
    best_intervention: "Solar IoT Camera", intervention_cost_inr: 60000, roi_weeks: 5,
    lat: 13.101200, lon: 77.598500,
    estimated_weight_tonnes: 10.1,
  },
  {
    id: "DUMP-006", name: "Storm Drain Adjacent Dump",
    waste_type: "Mixed Plastic", swm_stream: "Dry/Blue",
    risk_score: 0.85, area_sqm: 178, volume_m3: 15.6,
    detected_date: "2026-03-19", status: "Active",
    recurrence_risk: 0.69, carbon_co2_eq_tonnes: 2.8,
    carbon_credit_inr: 5600, nearest_recycler: "BBMP DWCC Kodigehalli",
    recycler_distance_km: 1.7, water_risk: "High",
    cctv_coverage: false, ward: "Kodigehalli", ward_id: 6,
    best_intervention: "Motion Sensor Light", intervention_cost_inr: 25000, roi_weeks: 5,
    lat: 13.071500, lon: 77.618900,
    estimated_weight_tonnes: 5.6,
  },
];

export const WARDS: WardScore[] = [
  { ward_id: 6, ward_name: "Kodigehalli", wascore: 92.2, grade: "F", grade_label: "Critical", grade_color: "#ef4444", active_dumps: 5, pct_resolved: 0, trend: "worsening", collection_frequency_hrs: 72, last_inspection: "2026-03-15" },
  { ward_id: 26, ward_name: "Thanisandra", wascore: 61.0, grade: "D", grade_label: "Poor", grade_color: "#f97316", active_dumps: 4, pct_resolved: 20, trend: "worsening", collection_frequency_hrs: 48, last_inspection: "2026-03-19" },
  { ward_id: 4, ward_name: "Hebbal", wascore: 45.0, grade: "C", grade_label: "Fair", grade_color: "#f59e0b", active_dumps: 6, pct_resolved: 42.9, trend: "improving", collection_frequency_hrs: 30, last_inspection: "2026-03-20" },
  { ward_id: 3, ward_name: "Yelahanka", wascore: 19.8, grade: "B", grade_label: "Good", grade_color: "#84cc16", active_dumps: 3, pct_resolved: 80, trend: "improving", collection_frequency_hrs: 26, last_inspection: "2026-03-21" },
  { ward_id: 8, ward_name: "Jakkur", wascore: 7.9, grade: "A", grade_label: "Excellent", grade_color: "#22c55e", active_dumps: 2, pct_resolved: 100, trend: "improving", collection_frequency_hrs: 22, last_inspection: "2026-03-21" },
];

// Ward-level route solution — 3 real geographic zones from actual grid data
// Zones derived from detected_dumps.geojson (295 sites) + risk_grid_predicted.geojson (552 cells)
// Grid bounds: lat 13.048-13.070, lon 77.618-77.641
// Split: Thanisandra Main Road at lon 77.630, N-S split at lat 13.059
// Single depot: BBMP DWCC Thanisandra at 13.0601, 77.6310
// Waste formula: accumulated_weight_kg = area_sqm × 15 (0.15m depth × 0.7 fill × 150 kg/m³)
export const WARD_ROUTES: WardRouteSolution = {
  ward: { name: "Thanisandra", ward_id: 26, area_sqkm: 8.2, population: 52000, households: 13000, grid_cells: 552 },
  zones: [
    {
      // ZONE-N: North Thanisandra — above lat 13.059
      // 253 grid cells, 5,958 households, 8 tippers
      // 155 detected dump sites, total area 133,100 m², accumulated 1,996.5T
      // CW route: 4.35 km (vs naive 13.79 km = 68% savings)
      zone_id: "ZONE-N", zone_name: "North Thanisandra", color: "#2563eb",
      depot: { lat: 13.0601, lon: 77.6310, name: "BBMP DWCC Thanisandra" },
      zone_center: { lat: 13.0645, lon: 77.6295 }, zone_area_sqkm: 3.0,
      tippers_assigned: 8, tipper_capacity_kg: 500,
      wet_trips_per_day: 7, dry_trips_per_collection: 3,
      collection_frequency: "Daily (highest density)", collection_freq_per_week: 7,
      route_length_km: 4.35,
      zone_bounds: { lat_min: 13.059, lat_max: 13.070, lon_min: 77.618, lon_max: 77.641 },
      dump_sites_count: 155,
      accumulated_waste_tonnes: 1996.5,
      daily_collection_kg: 480,
      naive_route_km: 13.79,
      stops: [
        { id: "N-S1", name: "Dump Cluster — 1 site · 1,100m²", lat: 13.05991, lon: 77.63118, order: 1, priority: "high" },
        { id: "N-S2", name: "Dump Cluster — 6 sites · 7,300m²", lat: 13.06070, lon: 77.63124, order: 2, priority: "high" },
        { id: "N-S3", name: "Dump Cluster — 3 sites · 700m²", lat: 13.06062, lon: 77.63036, order: 3, priority: "high" },
        { id: "N-S4", name: "Dump Cluster — 2 sites · 200m²", lat: 13.06108, lon: 77.62836, order: 4, priority: "medium" },
        { id: "N-S5", name: "Dump Cluster — 2 sites · 600m²", lat: 13.05965, lon: 77.62732, order: 5, priority: "high" },
        { id: "N-S6", name: "Dump Cluster — 4 sites · 1,800m²", lat: 13.05934, lon: 77.62762, order: 6, priority: "high" },
        { id: "N-S7", name: "Dump Cluster — 4 sites · 800m²", lat: 13.06023, lon: 77.62587, order: 7, priority: "high" },
        { id: "N-S8", name: "Dump Cluster — 5 sites · 1,200m²", lat: 13.05994, lon: 77.62522, order: 8, priority: "high" },
      ],
      // Polygon outline of zone territory (4 corners of zone_bounds)
      polyline: [
        [13.059, 77.618],
        [13.059, 77.641],
        [13.070, 77.641],
        [13.070, 77.618],
        [13.059, 77.618],
      ],
      waste: { total_cells: 253, residential_cells: 180, market_cells: 20, high_risk_cells: 155, estimated_households: 5958, daily_waste_kg: 2979, daily_wet_kg: 1907, daily_dry_kg: 834, weekly_waste_kg: 20853 },
    },
    {
      // ZONE-SE: South-East Thanisandra — lat 13.048-13.059, lon 77.630-77.641
      // 121 grid cells, 2,850 households, 4 tippers
      // 89 detected dump sites, total area 78,700 m², accumulated 1,180.5T
      // CW route: 3.10 km (vs naive 19.13 km = 84% savings)
      zone_id: "ZONE-SE", zone_name: "South-East Thanisandra", color: "#ef4444",
      depot: { lat: 13.0601, lon: 77.6310, name: "BBMP DWCC Thanisandra" },
      zone_center: { lat: 13.0515, lon: 77.6370 }, zone_area_sqkm: 1.5,
      tippers_assigned: 4, tipper_capacity_kg: 500,
      wet_trips_per_day: 4, dry_trips_per_collection: 2,
      collection_frequency: "Daily wet / 3x dry", collection_freq_per_week: 7,
      route_length_km: 3.10,
      zone_bounds: { lat_min: 13.048, lat_max: 13.059, lon_min: 77.630, lon_max: 77.641 },
      dump_sites_count: 89,
      accumulated_waste_tonnes: 1180.5,
      daily_collection_kg: 480,
      naive_route_km: 19.13,
      stops: [
        { id: "SE-S1", name: "Dump Cluster — 4 sites · 600m²", lat: 13.05253, lon: 77.63444, order: 1, priority: "high" },
        { id: "SE-S2", name: "Dump Cluster — 3 sites · 1,300m²", lat: 13.05106, lon: 77.63523, order: 2, priority: "high" },
        { id: "SE-S3", name: "Dump Cluster — 2 sites · 800m²", lat: 13.05075, lon: 77.63575, order: 3, priority: "high" },
        { id: "SE-S4", name: "Dump Cluster — 1 site · 4,300m²", lat: 13.05017, lon: 77.63677, order: 4, priority: "high" },
        { id: "SE-S5", name: "Dump Cluster — 2 sites · 1,900m²", lat: 13.05074, lon: 77.63990, order: 5, priority: "high" },
        { id: "SE-S6", name: "Dump Cluster — 1 site · 200m²", lat: 13.05161, lon: 77.63963, order: 6, priority: "medium" },
        { id: "SE-S7", name: "Dump Cluster — 5 sites · 2,800m²", lat: 13.05282, lon: 77.63934, order: 7, priority: "high" },
        { id: "SE-S8", name: "Dump Cluster — 4 sites · 6,300m²", lat: 13.05311, lon: 77.63884, order: 8, priority: "high" },
      ],
      // Polygon outline of zone territory (4 corners of zone_bounds)
      polyline: [
        [13.048, 77.630],
        [13.048, 77.641],
        [13.059, 77.641],
        [13.059, 77.630],
        [13.048, 77.630],
      ],
      waste: { total_cells: 121, residential_cells: 85, market_cells: 10, high_risk_cells: 89, estimated_households: 2850, daily_waste_kg: 1425, daily_wet_kg: 912, daily_dry_kg: 399, weekly_waste_kg: 9975 },
    },
    {
      // ZONE-SW: South-West Thanisandra — lat 13.048-13.059, lon 77.618-77.630
      // 132 grid cells, 3,109 households, 5 tippers
      // 51 detected dump sites, total area 26,300 m², accumulated 394.5T
      // CW route: 2.62 km (vs naive 15.50 km = 83% savings)
      zone_id: "ZONE-SW", zone_name: "South-West Thanisandra", color: "#10b981",
      depot: { lat: 13.0601, lon: 77.6310, name: "BBMP DWCC Thanisandra" },
      zone_center: { lat: 13.0515, lon: 77.6240 }, zone_area_sqkm: 1.5,
      tippers_assigned: 5, tipper_capacity_kg: 500,
      wet_trips_per_day: 5, dry_trips_per_collection: 2,
      collection_frequency: "Daily wet / 3x dry", collection_freq_per_week: 7,
      route_length_km: 2.62,
      zone_bounds: { lat_min: 13.048, lat_max: 13.059, lon_min: 77.618, lon_max: 77.630 },
      dump_sites_count: 51,
      accumulated_waste_tonnes: 394.5,
      daily_collection_kg: 480,
      naive_route_km: 15.50,
      stops: [
        { id: "SW-S1", name: "Dump Cluster — 5 sites · 2,200m²", lat: 13.05547, lon: 77.62965, order: 1, priority: "high" },
        { id: "SW-S2", name: "Dump Cluster — 5 sites · 3,000m²", lat: 13.05431, lon: 77.62944, order: 2, priority: "high" },
        { id: "SW-S3", name: "Dump Cluster — 1 site · 100m²", lat: 13.05359, lon: 77.62726, order: 3, priority: "medium" },
        { id: "SW-S4", name: "Dump Cluster — 4 sites · 1,400m²", lat: 13.05413, lon: 77.62598, order: 4, priority: "high" },
        { id: "SW-S5", name: "Dump Cluster — 1 site · 1,300m²", lat: 13.05472, lon: 77.62579, order: 5, priority: "high" },
        { id: "SW-S6", name: "Dump Cluster — 2 sites · 1,500m²", lat: 13.05546, lon: 77.62478, order: 6, priority: "high" },
        { id: "SW-S7", name: "Dump Cluster — 2 sites · 200m²", lat: 13.05612, lon: 77.62515, order: 7, priority: "medium" },
        { id: "SW-S8", name: "Dump Cluster — 2 sites · 600m²", lat: 13.05577, lon: 77.62396, order: 8, priority: "high" },
      ],
      // Polygon outline of zone territory (4 corners of zone_bounds)
      polyline: [
        [13.048, 77.618],
        [13.048, 77.630],
        [13.059, 77.630],
        [13.059, 77.618],
        [13.048, 77.618],
      ],
      waste: { total_cells: 132, residential_cells: 95, market_cells: 8, high_risk_cells: 51, estimated_households: 3109, daily_waste_kg: 1555, daily_wet_kg: 995, daily_dry_kg: 435, weekly_waste_kg: 10885 },
    },
  ],
  fleet_summary: {
    total_auto_tippers: 17, tipper_capacity_kg: 500,
    bbmp_rule: "1 tipper per 750 households",
    total_daily_waste_kg: 11880, total_daily_waste_tonnes: 11.88,
    waste_composition: { wet: 0.64, dry: 0.28, sanitary: 0.03, reject: 0.06 },
    wet_collection: "Daily (Green bin)", dry_collection: "Mon/Wed/Fri (Blue bin)",
    total_route_km_per_day: 10.07, depots: 1,
  },
  savings: {
    naive_total_km: 48.42, optimized_total_km: 10.07,
    distance_saved_km: 38.35, pct_distance_saved: 79.2,
    fuel_saved_litres: 9.6, co2_saved_kg: 25.7,
  },
  benchmarks: {
    seoul: { reduction_pct: 42, label: "Seoul Smart Collection" },
    amsterdam: { reduction_pct: 30, label: "Amsterdam IoT Bins" },
    barcelona: { reduction_pct: 20, label: "Barcelona Pneumatic" },
    orbitclean: { reduction_pct: 79.2, label: "OrbitClean Thanisandra" },
  },
};

export const RECYCLERS: Recycler[] = [
  { id: "REC-001", name: "SAAHAS Zero Waste", type: "Formal", lat: 13.0489, lon: 77.6234, accepts: ["Dry/Blue", "Hazardous/Black"], color: "#00e5a0" },
  { id: "REC-002", name: "BBMP DWCC Thanisandra", type: "BBMP", lat: 13.0601, lon: 77.6310, accepts: ["Wet/Green", "Dry/Blue"], color: "#4db8ff" },
  { id: "REC-003", name: "Hasiru Dala Hebbal", type: "Informal", lat: 13.0450, lon: 77.5940, accepts: ["Dry/Blue"], color: "#ffd166" },
  { id: "KAB-001", name: "Raju Kabadiwala", type: "Kabadiwala", lat: 13.0580, lon: 77.6270, accepts: ["Dry/Blue"], color: "#c084fc" },
  { id: "KAB-002", name: "Mohammed Kabadiwala", type: "Kabadiwala", lat: 13.0715, lon: 77.6195, accepts: ["Dry/Blue"], color: "#c084fc" },
  { id: "REC-004", name: "SAAHAS Yelahanka", type: "Formal", lat: 13.1040, lon: 77.6018, accepts: ["Dry/Blue", "Hazardous/Black"], color: "#00e5a0" },
];

// 40 critical cells — XGBoost/GradientBoosting ML predicted high-risk zones (score ≥ 0.7)
// Coords jittered ±35m from 100m grid center for natural scatter (reproducible, hash-based)
// Features: dist_road_m · dist_market_m · hist_dump_density · night_light_idx · population · land_use
export const RISK_GRID: RiskCell[] = [
  { lat: 13.056073, lon: 77.634312, score: 0.7015 },
  { lat: 13.056248, lon: 77.634674, score: 0.76 },
  { lat: 13.056712, lon: 77.636323, score: 0.7104 },
  { lat: 13.057961, lon: 77.634326, score: 0.7486 },
  { lat: 13.058006, lon: 77.63614, score: 0.7117 },
  { lat: 13.058803, lon: 77.62419, score: 0.7501 },
  { lat: 13.058969, lon: 77.624789, score: 0.7231 },
  { lat: 13.058807, lon: 77.630885, score: 0.7036 },
  { lat: 13.058684, lon: 77.632258, score: 0.8395 },
  { lat: 13.059198, lon: 77.633276, score: 0.7411 },
  { lat: 13.059136, lon: 77.634008, score: 0.8633 },
  { lat: 13.060129, lon: 77.627894, score: 0.8187 },
  { lat: 13.059657, lon: 77.630121, score: 0.8334 },
  { lat: 13.060079, lon: 77.631126, score: 0.7415 },
  { lat: 13.060326, lon: 77.632204, score: 0.7683 },
  { lat: 13.0598, lon: 77.632938, score: 0.7524 },
  { lat: 13.06023, lon: 77.634001, score: 0.7968 },
  { lat: 13.060191, lon: 77.635195, score: 0.8034 },
  { lat: 13.061337, lon: 77.628813, score: 0.763 },
  { lat: 13.060996, lon: 77.630077, score: 0.891 },
  { lat: 13.06091, lon: 77.631044, score: 0.885 },
  { lat: 13.06104, lon: 77.63281, score: 0.8051 },
  { lat: 13.060813, lon: 77.633773, score: 0.8179 },
  { lat: 13.060825, lon: 77.634916, score: 0.911 },
  { lat: 13.061279, lon: 77.636214, score: 0.7262 },
  { lat: 13.061878, lon: 77.626938, score: 0.742 },
  { lat: 13.062042, lon: 77.627912, score: 0.724 },
  { lat: 13.061764, lon: 77.629166, score: 0.881 },
  { lat: 13.062138, lon: 77.630208, score: 0.7249 },
  { lat: 13.062132, lon: 77.632179, score: 0.8266 },
  { lat: 13.061733, lon: 77.632922, score: 0.7631 },
  { lat: 13.062128, lon: 77.634269, score: 0.8191 },
  { lat: 13.061807, lon: 77.635175, score: 0.808 },
  { lat: 13.062736, lon: 77.628211, score: 0.8429 },
  { lat: 13.063282, lon: 77.628919, score: 0.812 },
  { lat: 13.063288, lon: 77.63022, score: 0.7619 },
  { lat: 13.063038, lon: 77.633307, score: 0.8858 },
  { lat: 13.06298, lon: 77.633936, score: 0.8792 },
  { lat: 13.063751, lon: 77.631958, score: 0.7843 },
  { lat: 13.064156, lon: 77.633234, score: 0.7024 },
];

export const FORECAST: ForecastDay[] = [
  { day: "Sun 22", value: 42.5 },
  { day: "Mon 23", value: 39.1 },
  { day: "Tue 24", value: 41.3 },
  { day: "Wed 25", value: 45.8 },
  { day: "Thu 26", value: 44.2 },
  { day: "Fri 27", value: 48.7 },
  { day: "Sat 28", value: 58.6, festival: "Good Friday", surge: true },
];

export const DEMO_CLASSIFICATIONS: ClassificationResult[] = [
  {
    detections: [
      { category: "Plastic Bottle", confidence: 0.94, swm_stream: "Dry/Blue" },
      { category: "Wrapper", confidence: 0.87, swm_stream: "Dry/Blue" },
    ],
    dominant_stream: "Dry/Blue",
    primary_disposal: "Place in BLUE bin. Segregate paper/plastic/metal.",
  },
  {
    detections: [
      { category: "Food Waste", confidence: 0.91, swm_stream: "Wet/Green" },
      { category: "Vegetable", confidence: 0.83, swm_stream: "Wet/Green" },
    ],
    dominant_stream: "Wet/Green",
    primary_disposal: "Place in GREEN bin. BBMP wet waste Mon/Wed/Fri.",
  },
  {
    detections: [
      { category: "Battery", confidence: 0.96, swm_stream: "Hazardous/Black" },
      { category: "Electronic", confidence: 0.78, swm_stream: "Hazardous/Black" },
    ],
    dominant_stream: "Hazardous/Black",
    primary_disposal: "Contact BBMP hazardous waste helpline. Do NOT mix.",
  },
];

export const ROI_ITEMS = [
  { name: "Solar IoT Camera", cost: "₹60K", roi: "4.2x", sites: "DUMP-003, DUMP-005" },
  { name: "Motion Sensor Light", cost: "₹25K", roi: "3.8x", sites: "DUMP-001, DUMP-006" },
  { name: "Community Bin Install", cost: "₹80K", roi: "3.1x", sites: "DUMP-002" },
  { name: "Barricade + Landscaping", cost: "₹35K", roi: "2.9x", sites: "All zones" },
  { name: "No Dumping Signage", cost: "₹5K", roi: "1.6x", sites: "DUMP-004" },
];

export const NL_MOCK: Record<string, string> = {
  school: "DUMP-001 (Thanisandra Main Road) is ~320m from Thanisandra Govt School. Risk: 0.87 Critical. Recommend: IoT camera + 24hr enforcement response.",
  worst: "Kodigehalli Ward (WAScore 92.2, Grade F – Critical) is worst-performing this week. 5 active dumps, 0 resolved. Urgent BBMP commissioner review needed.",
  report: "Enforcement Report – Ward 26 (Thanisandra)\nDUMP-001: Mixed, 145m², Risk 0.87 → Motion light (₹25K, 6wk payback)\nDUMP-002: Organic, 89m², Risk 0.74 → Community bin (₹80K, 9wk payback)\nSWM 2026 compliance: ⚠️ 48hr collection breach on 3 occasions this week.",
  carbon: "Active sites generate 16.1T CO₂-eq via methane (IPCC Tier 1). Carbon credit value: ₹32,200. Hebbal Market dump alone = 3.8T CO₂-eq. Immediate cleanup = highest carbon ROI.",
  kabadiwala: "3 kabadiwala alerts sent this week. DUMP-004 (62m² dry recyclable) matched to Raju Kabadiwala (0.5km) – est. ₹36,400 value. Total circular economy recovered: ₹52,800.",
  water: "DUMP-003 (Hebbal, Hazardous) contamination radius 96m. Distance to Hebbal Lake: 380m. Contamination index: 0.74 (HIGH). 12,000 residents at risk.",
  routes: "CVRP optimization: 3 geographic zones, 17 auto-tippers (500kg each). Optimized tour: 10.07km vs 48.42km naive. 79.2% distance savings → 9.6L fuel saved → 25.7kg CO₂ saved. Source: 295 satellite-detected sites from detected_dumps.geojson.",
  default: "I can help with: dump sites, risk scores, carbon credits, recycler matching, enforcement reports, water contamination, route optimization, and ward accountability. Try: 'Which ward has highest risk?' or 'Generate enforcement report for Thanisandra'",
};

export function getMockResponse(query: string): string {
  const q = query.toLowerCase();
  if (q.includes("school") || q.includes("500m")) return NL_MOCK.school;
  if (q.includes("worst") || q.includes("highest risk")) return NL_MOCK.worst;
  if (q.includes("report") || q.includes("enforcement")) return NL_MOCK.report;
  if (q.includes("carbon") || q.includes("co2")) return NL_MOCK.carbon;
  if (q.includes("kabadiwala") || q.includes("recycler")) return NL_MOCK.kabadiwala;
  if (q.includes("water") || q.includes("lake")) return NL_MOCK.water;
  if (q.includes("route") || q.includes("truck") || q.includes("collection")) return NL_MOCK.routes;
  return NL_MOCK.default;
}

export function getRiskColor(score: number): string {
  if (score >= 0.85) return "#ef4444";
  if (score >= 0.70) return "#fb923c";
  if (score >= 0.55) return "#ffd166";
  return "#22c55e";
}

export const STREAM_COLORS: Record<string, string> = {
  "Wet/Green": "#22c55e",
  "Dry/Blue": "#3b82f6",
  "Sanitary/Red": "#ef4444",
  "Hazardous/Black": "#6b7280",
};
