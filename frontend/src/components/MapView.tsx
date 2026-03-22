"use client";

import { useEffect, useRef, useState } from "react";
import type { DumpSite, Recycler, RiskCell, FieldReport, CollectionZone, CleanedSite, CommunityPhoto } from "@/types";

interface Props {
  dumps: DumpSite[];
  recyclers: Recycler[];
  riskGrid: RiskCell[];
  fieldReports: FieldReport[];
  selectedDump: DumpSite | null;
  showHeatmap: boolean;
  showRecyclers: boolean;
  showWater: boolean;
  zones?: CollectionZone[];
  showRoutes?: boolean;
  cleanedSites?: CleanedSite[];
  communityPhotos?: CommunityPhoto[];
}

const RISK_COLOR = (score: number) =>
  score >= 0.85 ? "#ef4444" : score >= 0.7 ? "#f97316" : "#eab308";

const STREAM_DOTS: Record<string, string> = {
  "Dry/Blue": "#2563eb", "Wet/Green": "#10b981",
  "Sanitary/Red": "#ef4444", "Hazardous/Black": "#374151",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LeafletMap = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LeafletLayer = any;

export default function MapView(props: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const LRef = useRef<any>(null);
  const layers = useRef<Record<string, LeafletLayer | null>>({
    heatmap: null, dumps: null, routes: null,
    field: null, community: null, cleaned: null,
  });
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // ── Init map once ──
  useEffect(() => {
    if (!mounted || !containerRef.current || mapRef.current) return;
    import("leaflet").then((L) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });
      const map = L.map(containerRef.current!, { center: [13.059, 77.630], zoom: 14, zoomControl: false });
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://osm.org/">OSM</a>',
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;
      LRef.current = L;
      setReady(true);
    });
  }, [mounted]);

  // ── Heatmap layer — only when showHeatmap or cleanedSites changes ──
  useEffect(() => {
    if (!ready || !mapRef.current || !LRef.current) return;
    const L = LRef.current; const map = mapRef.current;
    layers.current.heatmap?.removeFrom(map);
    layers.current.heatmap = null;
    if (!props.showHeatmap) return;
    const cleaned = props.cleanedSites || [];
    const g = L.layerGroup();
    props.riskGrid.forEach((c) => {
      let score = c.score;
      for (const cs of cleaned) {
        const dist = Math.sqrt((c.lat - cs.lat) ** 2 + (c.lon - cs.lon) ** 2) * 111000;
        if (dist < 200) { score = Math.max(score - cs.risk_reduction, 0.05); break; }
      }
      if (score < 0.65) return;
      const color = RISK_COLOR(score);
      const t = Math.min((score - 0.65) / 0.35, 1);
      L.circleMarker([c.lat, c.lon], { radius: 12 + t * 8, fillColor: color, color: "transparent", weight: 0, fillOpacity: 0.12 + t * 0.15 }).addTo(g);
      L.circleMarker([c.lat, c.lon], { radius: 4 + t * 3, fillColor: color, color: "white", weight: 0.5, fillOpacity: 0.5 + t * 0.3 })
        .bindTooltip(`<div style="font-size:11px;font-weight:600;color:${color}">Risk ${(score * 100).toFixed(0)}%</div><div style="font-size:9px;color:#94a3b8;margin-top:2px">ML-predicted</div>`).addTo(g);
    });
    g.addTo(map);
    layers.current.heatmap = g;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, props.showHeatmap, props.cleanedSites]);

  // ── Dump markers — only when dumps or cleanedSites changes ──
  useEffect(() => {
    if (!ready || !mapRef.current || !LRef.current) return;
    const L = LRef.current; const map = mapRef.current;
    layers.current.dumps?.removeFrom(map);
    const g = L.layerGroup();
    props.dumps.forEach((dump) => {
      if (dump.status === "Resolved") return;
      const color = RISK_COLOR(dump.risk_score);
      const r = Math.max(6, Math.min(Math.sqrt(dump.area_sqm) * 1.5, 14));
      if (dump.risk_score >= 0.85)
        L.circleMarker([dump.lat, dump.lon], { radius: r + 6, fillColor: "transparent", color, weight: 1.5, opacity: 0.25, dashArray: "3,3" }).addTo(g);
      L.circleMarker([dump.lat, dump.lon], { radius: r, fillColor: color, color: "#ffffff", fillOpacity: 0.8, weight: 2.5 })
        .bindPopup(buildPopup(dump), { maxWidth: 280 }).addTo(g);
      if (dump.community_verified)
        L.circleMarker([dump.lat, dump.lon], { radius: 4, fillColor: "#10b981", color: "#ffffff", fillOpacity: 0.95, weight: 2 })
          .bindTooltip("Community Verified", { direction: "top", offset: [0, -10] }).addTo(g);
    });
    const cleaned = props.cleanedSites || [];
    if (cleaned.length > 0) {
      cleaned.forEach((cs) => {
        L.marker([cs.lat, cs.lon], {
          icon: L.divIcon({
            className: "",
            html: `<div style="background:#10b981;color:white;font-size:11px;font-weight:700;width:22px;height:22px;border-radius:6px;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.2);transform:translate(-11px,-11px)">&#10003;</div>`,
            iconSize: [0, 0],
          }),
        }).bindTooltip(
          `<div style="font-size:11px"><div style="font-weight:700;color:#10b981">Cleaned${cs.verified ? " & Verified" : ""}</div>
           <div style="font-size:10px;color:#64748b;margin-top:3px">${Math.round(cs.risk_before * 100)}% → ${Math.round(cs.risk_after * 100)}% risk</div></div>`,
          { direction: "top", offset: [0, -14] }
        ).addTo(g);
      });
    }
    g.addTo(map);
    layers.current.dumps = g;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, props.dumps, props.cleanedSites]);

  // ── Zone coverage — only when showRoutes or zones changes ──
  useEffect(() => {
    if (!ready || !mapRef.current || !LRef.current) return;
    const L = LRef.current; const map = mapRef.current;
    layers.current.routes?.removeFrom(map);
    layers.current.routes = null;
    if (!props.showRoutes || !props.zones?.length) return;
    const g = L.layerGroup();
    props.zones.forEach((zone) => {
      // Zone territory rectangle
      if (zone.zone_bounds) {
        const b = zone.zone_bounds;
        L.polygon([
          [b.lat_min, b.lon_min], [b.lat_min, b.lon_max],
          [b.lat_max, b.lon_max], [b.lat_max, b.lon_min],
        ], {
          color: zone.color, weight: 2, opacity: 0.65,
          fill: true, fillColor: zone.color, fillOpacity: 0.09,
          dashArray: "8,5",
        }).bindTooltip(
          `<div style="font-size:11px;min-width:180px">
            <div style="font-weight:700;font-size:13px;color:${zone.color}">${zone.zone_name}</div>
            <div style="margin-top:4px;display:grid;grid-template-columns:1fr 1fr;gap:3px">
              <div style="background:#f8fafc;padding:3px 6px;border-radius:4px"><div style="font-size:8px;color:#94a3b8">TIPPERS</div><div style="font-weight:700;color:${zone.color}">${zone.tippers_assigned}</div></div>
              <div style="background:#f8fafc;padding:3px 6px;border-radius:4px"><div style="font-size:8px;color:#94a3b8">DUMP SITES</div><div style="font-weight:700;color:#ef4444">${zone.dump_sites_count}</div></div>
              <div style="background:#f8fafc;padding:3px 6px;border-radius:4px"><div style="font-size:8px;color:#94a3b8">CW ROUTE</div><div style="font-weight:700;color:#10b981">${zone.route_length_km}km</div></div>
              <div style="background:#f8fafc;padding:3px 6px;border-radius:4px"><div style="font-size:8px;color:#94a3b8">NAIVE</div><div style="font-weight:700;color:#ef4444">${zone.naive_route_km}km</div></div>
            </div>
            <div style="margin-top:4px;font-size:9px;color:#64748b">${zone.waste.estimated_households.toLocaleString()} HH · ${zone.accumulated_waste_tonnes}T accumulated waste</div>
          </div>`,
          { sticky: true }
        ).addTo(g);
      }
      // Zone label at center
      L.marker([zone.zone_center.lat, zone.zone_center.lon], {
        icon: L.divIcon({
          className: "",
          html: `<div style="background:${zone.color};color:white;font-size:10px;font-weight:700;padding:3px 10px;border-radius:6px;white-space:nowrap;transform:translate(-50%,-50%);box-shadow:0 2px 6px rgba(0,0,0,0.2)">${zone.zone_id} · ${zone.dump_sites_count} dumps</div>`,
          iconSize: [0, 0],
        }),
        interactive: false,
      }).addTo(g);
    });
    g.addTo(map);
    layers.current.routes = g;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, props.showRoutes, props.zones]);

  // ── Field reports — only when fieldReports changes ──
  useEffect(() => {
    if (!ready || !mapRef.current || !LRef.current) return;
    const L = LRef.current; const map = mapRef.current;
    layers.current.field?.removeFrom(map);
    layers.current.field = null;
    if (!props.fieldReports.length) return;
    const g = L.layerGroup();
    props.fieldReports.forEach((r, i) => {
      if (i === 0) L.circleMarker([r.lat, r.lon], { radius: 14, fillColor: "transparent", color: "#7c3aed", weight: 1, opacity: 0.3 }).addTo(g);
      L.circleMarker([r.lat, r.lon], { radius: 6, fillColor: "#7c3aed", color: "#ffffff", fillOpacity: 0.85, weight: 2 })
        .bindPopup(`<div style="font-size:12px;min-width:160px"><div style="font-weight:700;color:#7c3aed">${r.id}</div><div style="color:#94a3b8;font-size:10px;margin:2px 0">Field capture · ${r.timestamp}</div><div style="margin-top:4px;font-size:11px;font-weight:600">${r.dominant_stream}</div></div>`, { maxWidth: 220 }).addTo(g);
    });
    g.addTo(map);
    layers.current.field = g;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, props.fieldReports]);

  // ── Community photos — only when communityPhotos changes ──
  useEffect(() => {
    if (!ready || !mapRef.current || !LRef.current) return;
    const L = LRef.current; const map = mapRef.current;
    layers.current.community?.removeFrom(map);
    layers.current.community = null;
    if (!props.communityPhotos?.length) return;
    const g = L.layerGroup();
    props.communityPhotos.forEach((photo) => {
      L.circleMarker([photo.lat, photo.lon], { radius: 5, fillColor: "#f59e0b", color: "#ffffff", fillOpacity: 0.9, weight: 2 })
        .bindPopup(`<div style="font-size:11px;min-width:140px"><div style="font-weight:700;color:#f59e0b">Community Report</div><div style="font-size:9px;color:#94a3b8;margin-top:2px">${photo.id}</div>${photo.matched_dump ? `<div style="font-size:10px;margin-top:4px">Near <b>${photo.matched_dump}</b> (${photo.match_distance_m}m)</div>` : ""}</div>`, { maxWidth: 200 }).addTo(g);
    });
    g.addTo(map);
    layers.current.community = g;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, props.communityPhotos]);

  // ── Fly to selected dump ──
  useEffect(() => {
    if (!mapRef.current || !props.selectedDump) return;
    mapRef.current.flyTo([props.selectedDump.lat, props.selectedDump.lon], 17, { duration: 0.8 });
  }, [props.selectedDump]);

  function buildPopup(dump: DumpSite): string {
    const rc = RISK_COLOR(dump.risk_score);
    const sc = STREAM_DOTS[dump.swm_stream] ?? "#64748b";
    const accW = (dump.area_sqm * 15 / 1000).toFixed(1);
    return `
      <div style="font-size:12px;line-height:1.5;min-width:220px">
        <div style="font-weight:700;font-size:14px;color:#0f172a;margin-bottom:4px">${dump.name}</div>
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
          <span style="background:${sc}15;color:${sc};font-size:10px;padding:2px 10px;border-radius:6px;font-weight:600">${dump.swm_stream}</span>
          <span style="font-size:13px;font-weight:700;color:${rc}">${Math.round(dump.risk_score * 100)}%</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
          ${[
            ["Area", `${dump.area_sqm}m²`],
            ["Acc. Weight", `~${accW}T`],
            ["Detected", dump.detected_date],
            ["Water Risk", dump.water_risk],
          ].map(([label, value]) =>
            `<div style="background:#f8fafc;padding:5px 8px;border-radius:6px;border:1px solid #f1f5f9">
              <div style="font-size:8px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px">${label}</div>
              <div style="font-weight:600;font-size:11px;color:#334155">${value}</div>
            </div>`
          ).join("")}
        </div>
        <div style="margin-top:6px;font-size:9px;color:#94a3b8;background:#f8fafc;padding:4px 8px;border-radius:4px">
          Acc. weight = ${dump.area_sqm}m² × 15 kg/m² (0.15m depth · 0.7 fill · 150 kg/m³)
        </div>
      </div>`;
  }

  if (!mounted) return null;
  return <div ref={containerRef} className="w-full h-full" />;
}
