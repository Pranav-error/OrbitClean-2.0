export interface DumpSite {
  id: string;
  name: string;
  waste_type: string;
  swm_stream: string;
  risk_score: number;
  area_sqm: number;
  volume_m3: number;
  detected_date: string;
  status: "Active" | "Resolved";
  recurrence_risk: number;
  carbon_co2_eq_tonnes: number;
  carbon_credit_inr: number;
  nearest_recycler: string;
  recycler_distance_km: number;
  water_risk: "Low" | "Medium" | "High";
  cctv_coverage: boolean;
  ward: string;
  ward_id: number;
  best_intervention: string;
  intervention_cost_inr: number;
  roi_weeks: number;
  lat: number;
  lon: number;
  estimated_weight_tonnes?: number;
  community_reports?: number;
  community_verified?: boolean;
}

export interface WardScore {
  ward_id: number;
  ward_name: string;
  wascore: number;
  grade: string;
  grade_label: string;
  grade_color: string;
  active_dumps: number;
  pct_resolved: number;
  trend: "worsening" | "improving";
  collection_frequency_hrs: number;
  last_inspection: string;
}

export interface CollectionZone {
  zone_id: string;
  zone_name: string;
  color: string;
  depot: { lat: number; lon: number; name: string };
  zone_center: { lat: number; lon: number };
  zone_area_sqkm: number;
  tippers_assigned: number;
  tipper_capacity_kg: number;
  wet_trips_per_day: number;
  dry_trips_per_collection: number;
  collection_frequency: string;
  collection_freq_per_week: number;
  route_length_km: number;
  polyline: [number, number][];
  zone_bounds: { lat_min: number; lat_max: number; lon_min: number; lon_max: number };
  dump_sites_count: number;
  accumulated_waste_tonnes: number;
  daily_collection_kg: number;
  naive_route_km: number;
  stops?: Array<{ id: string; name: string; lat: number; lon: number; order: number; priority: "high" | "medium" | "low" }>;
  waste: {
    total_cells: number;
    residential_cells: number;
    market_cells: number;
    high_risk_cells: number;
    estimated_households: number;
    daily_waste_kg: number;
    daily_wet_kg: number;
    daily_dry_kg: number;
    weekly_waste_kg: number;
  };
}

export interface WardRouteSolution {
  ward: { name: string; ward_id: number; area_sqkm: number; population: number; households: number; grid_cells: number };
  zones: CollectionZone[];
  fleet_summary: {
    total_auto_tippers: number;
    tipper_capacity_kg: number;
    bbmp_rule: string;
    total_daily_waste_kg: number;
    total_daily_waste_tonnes: number;
    waste_composition: Record<string, number>;
    wet_collection: string;
    dry_collection: string;
    total_route_km_per_day: number;
    depots: number;
  };
  savings: {
    naive_total_km: number;
    optimized_total_km: number;
    distance_saved_km: number;
    pct_distance_saved: number;
    fuel_saved_litres: number;
    co2_saved_kg: number;
  };
  benchmarks: Record<string, { reduction_pct: number; label: string }>;
}

export interface CommunityPhoto {
  id: string;
  lat: number;
  lon: number;
  classification: unknown;
  matched_dump: string | null;
  match_distance_m: number | null;
  timestamp: string;
}

export interface ModelVersion {
  version: string;
  accuracy: number;
  training_images: number;
  community_images_added: number;
  trained_at: string;
  notes: string;
}

export interface CleanupMission {
  mission_id: string;
  target_id: string;
  target_type: "dump_site" | "risk_cell";
  target_name: string;
  lat: number;
  lon: number;
  waste_type: string;
  area_sqm: number;
  risk_score: number;
  status: "assigned" | "in_progress" | "before_uploaded" | "after_uploaded" | "verified" | "cleaned" | "cancelled";
  assigned_at: string;
  driver_id: string | null;
  before_photo: string | null;
  before_gps: { lat: number; lon: number; distance_m: number } | null;
  before_time: string | null;
  after_photo: string | null;
  after_gps: { lat: number; lon: number; distance_m: number } | null;
  after_time: string | null;
  gps_verified: boolean;
  risk_reduction: number;
  new_risk_score?: number;
  verified_at?: string;
}

export interface CleanedSite {
  target_id: string;
  target_type: string;
  lat: number;
  lon: number;
  risk_before: number;
  risk_after: number;
  risk_reduction: number;
  verified: boolean;
  cleaned_at: string | null;
}

export interface Recycler {
  id: string;
  name: string;
  type: string;
  lat: number;
  lon: number;
  accepts: string[];
  color: string;
}

export interface RiskCell {
  id?: string;
  lat: number;
  lon: number;
  score: number;
  risk_level?: string;
  ward?: string;
  land_use?: string;
  dist_road_m?: number;
  dist_collection_m?: number;
  hist_dump_density?: number;
  generated_at?: string;
  source?: string;
}

export interface SatelliteSceneMetadata {
  id?: string;
  datetime?: string;
  cloud_cover?: number;
}

export interface PipelineStatus {
  refresh?: {
    status?: string;
    mode?: string;
    auto_fetch?: boolean;
    started_at?: string;
    finished_at?: string;
    steps?: Array<{
      name?: string;
      exit_code?: number;
      stdout_tail?: string;
      stderr_tail?: string;
    }>;
    outputs?: Record<string, { exists?: boolean; modified_at?: string; size_bytes?: number; path?: string }>;
  } | null;
  sentinel?: {
    status?: string;
    mode?: string;
    scenes_found?: number;
    scene_selected?: SatelliteSceneMetadata | null;
    bands_downloaded?: number;
    output_file?: string;
    prev_file?: string;
    error?: string | null;
  } | null;
  outputs?: Record<string, { exists?: boolean; modified_at?: string; size_bytes?: number; path?: string }>;
  queried_at?: string;
}

export interface WasteDetection {
  category: string;
  confidence: number;
  swm_stream: string;
  stream_color?: string;
  disposal_instruction?: string;
  recyclable?: boolean;
  market_value_per_kg_inr?: number;
}

export interface ClassificationResult {
  detections: WasteDetection[];
  dominant_stream: string;
  primary_disposal: string;
}

export interface ChatMessage {
  role: "user" | "ai";
  text: string;
}

export interface ForecastDay {
  day: string;
  value: number;
  festival?: string;
  surge?: boolean;
}

export interface FieldReport {
  id: string;
  lat: number;
  lon: number;
  dominant_stream: string;
  detections: Array<{ category: string; confidence: number; swm_stream: string }>;
  timestamp: string;
  received_at: string;
  carbon_co2_eq_tonnes?: number;
  carbon_credit_inr?: number;
}
