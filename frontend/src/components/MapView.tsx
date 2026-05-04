"use client";

import { useEffect, useRef, useState } from "react";
import type { DumpSite, Recycler, RiskCell, FieldReport, CollectionZone, CleanedSite, CommunityPhoto } from "@/types";

interface Props {
  dumps: DumpSite[];
  recyclers: Recycler[];
  riskGrid: RiskCell[];
  fieldReports: FieldReport[];
  selectedDump: DumpSite | null;
  inspectedPoint?: {
    lat: number;
    lon: number;
    found: boolean;
    nearestDump?: DumpSite | null;
    nearestRiskCell?: RiskCell | null;
    dumpDistanceMeters?: number | null;
    riskDistanceMeters?: number | null;
  } | null;
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

function computeBounds(props: Props) {
  const points: Array<{ lat: number; lon: number }> = [];

  props.dumps.forEach((dump) => points.push({ lat: dump.lat, lon: dump.lon }));
  props.riskGrid.forEach((cell) => points.push({ lat: cell.lat, lon: cell.lon }));

  if (points.length === 0) {
    return {
      minLat: 13.048,
      maxLat: 13.070,
      minLon: 77.618,
      maxLon: 77.641,
    };
  }

  const minLat = Math.min(...points.map((p) => p.lat));
  const maxLat = Math.max(...points.map((p) => p.lat));
  const minLon = Math.min(...points.map((p) => p.lon));
  const maxLon = Math.max(...points.map((p) => p.lon));

  const latPad = Math.max((maxLat - minLat) * 0.12, 0.001);
  const lonPad = Math.max((maxLon - minLon) * 0.12, 0.001);

  return {
    minLat: minLat - latPad,
    maxLat: maxLat + latPad,
    minLon: minLon - lonPad,
    maxLon: maxLon + lonPad,
  };
}

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
    inspect: null,
  });
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);
  const bounds = computeBounds(props);

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
      if (score < 0.5) return;
      const color = RISK_COLOR(score);
      const t = Math.min((score - 0.5) / 0.5, 1);
      L.circleMarker([c.lat, c.lon], { radius: 18 + t * 12, fillColor: color, color, weight: 1, opacity: 0.22, fillOpacity: 0.14 + t * 0.12 }).addTo(g);
      L.circleMarker([c.lat, c.lon], { radius: 6 + t * 5, fillColor: color, color: "white", weight: 2, fillOpacity: 0.78 + t * 0.12 })
        .bindTooltip(
          `<div style="font-size:11px;min-width:170px">
            <div style="font-weight:700;color:${color}">${c.id || "Predicted dump hotspot"} · ${(score * 100).toFixed(0)}%</div>
            <div style="font-size:9px;color:#94a3b8;margin-top:2px">Sentinel-2 + urban risk model</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px;margin-top:5px">
              <div style="background:#f8fafc;padding:3px 5px;border-radius:4px"><span style="font-size:8px;color:#94a3b8">LAND</span><br/><b style="font-size:10px;color:#334155">${c.land_use || "Unknown"}</b></div>
              <div style="background:#f8fafc;padding:3px 5px;border-radius:4px"><span style="font-size:8px;color:#94a3b8">ROAD</span><br/><b style="font-size:10px;color:#334155">${Math.round(c.dist_road_m || 0)}m</b></div>
              <div style="background:#f8fafc;padding:3px 5px;border-radius:4px"><span style="font-size:8px;color:#94a3b8">COLL.</span><br/><b style="font-size:10px;color:#334155">${Math.round(c.dist_collection_m || 0)}m</b></div>
              <div style="background:#f8fafc;padding:3px 5px;border-radius:4px"><span style="font-size:8px;color:#94a3b8">HIST.</span><br/><b style="font-size:10px;color:#334155">${c.hist_dump_density || 0}</b></div>
            </div>
          </div>`,
          { direction: "top", offset: [0, -8], sticky: true }
        ).addTo(g);
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

  // ── Fly to inspected coordinate and mark the lookup point ──
  useEffect(() => {
    if (!ready || !mapRef.current || !LRef.current) return;
    const L = LRef.current; const map = mapRef.current;
    layers.current.inspect?.removeFrom(map);
    layers.current.inspect = null;

    if (!props.inspectedPoint) return;

    const g = L.layerGroup();
    const { lat, lon, found, nearestDump, nearestRiskCell, dumpDistanceMeters, riskDistanceMeters } = props.inspectedPoint;

    L.circleMarker([lat, lon], {
      radius: 10,
      fillColor: found ? "#2563eb" : "#64748b",
      color: "#ffffff",
      weight: 2,
      fillOpacity: 0.95,
    }).bindTooltip(
      `<div style="font-size:11px;min-width:160px">
        <div style="font-weight:700;color:${found ? "#2563eb" : "#7c3aed"}">Checked coordinate</div>
        <div style="font-size:10px;color:#64748b;margin-top:2px">${lat.toFixed(6)}, ${lon.toFixed(6)}</div>
        ${nearestRiskCell ? `<div style="margin-top:4px;font-size:10px">Nearest hotspot: <b>${nearestRiskCell.id || "Risk cell"}</b> · ${Math.round(nearestRiskCell.score * 100)}%</div>` : ""}
        ${typeof riskDistanceMeters === "number" ? `<div style="font-size:10px;color:#64748b">Hotspot distance: ${Math.round(riskDistanceMeters)} m</div>` : ""}
        ${nearestDump ? `<div style="margin-top:4px;font-size:10px">Nearest confirmed dump: <b>${nearestDump.id}</b></div>` : ""}
        ${typeof dumpDistanceMeters === "number" ? `<div style="font-size:10px;color:#64748b">Confirmed distance: ${Math.round(dumpDistanceMeters)} m</div>` : ""}
      </div>`,
      { sticky: true }
    ).addTo(g);

    if (nearestRiskCell) {
      L.circleMarker([nearestRiskCell.lat, nearestRiskCell.lon], {
        radius: 14,
        fillColor: RISK_COLOR(nearestRiskCell.score),
        color: "#ffffff",
        weight: 2,
        fillOpacity: 0.22,
      }).addTo(g);
    }

    if (nearestDump) {
      L.circleMarker([nearestDump.lat, nearestDump.lon], {
        radius: 12,
        fillColor: found ? "#10b981" : "#ef4444",
        color: "#ffffff",
        weight: 2,
        fillOpacity: 0.18,
      }).addTo(g);
    }

    g.addTo(map);
    layers.current.inspect = g;
    map.flyTo([lat, lon], nearestRiskCell || nearestDump ? 17 : 16, { duration: 0.8 });
  }, [ready, props.inspectedPoint]);

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
  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute inset-0 z-[320] pointer-events-none">
        {props.dumps.map((dump) => {
          const left = ((dump.lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * 100;
          const top = ((bounds.maxLat - dump.lat) / (bounds.maxLat - bounds.minLat)) * 100;
          const color = RISK_COLOR(dump.risk_score);
          return (
            <div
              key={`fallback-${dump.id}`}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${left}%`, top: `${top}%` }}
            >
              <div
                className="flex items-center gap-2 px-2 py-1 rounded-full shadow-md border bg-white/95"
                style={{ borderColor: `${color}40` }}
              >
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                <span className="text-[10px] font-semibold text-[#0f172a] whitespace-nowrap">{dump.name}</span>
                <span className="text-[9px] font-bold" style={{ color }}>{Math.round(dump.risk_score * 100)}%</span>
              </div>
            </div>
          );
        })}
      </div>
      {!ready && (
        <div className="absolute top-3 left-3 z-[380] px-3 py-1.5 rounded-lg bg-white/90 border border-[#e2e8f0] text-[10px] text-[#64748b] shadow-sm">
          Loading map...
        </div>
      )}
    </div>
  );
}

