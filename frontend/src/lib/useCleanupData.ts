"use client";

import { useState, useEffect, useCallback } from "react";
import type { CleanedSite, CommunityPhoto } from "@/types";

const API_BASE = "http://localhost:8000";

// Mock data for offline demo
const MOCK_CLEANED: CleanedSite[] = [
  {
    target_id: "DUMP-005", target_type: "dump_site",
    lat: 13.065432, lon: 77.621890,
    risk_before: 0.82, risk_after: 0.246,
    risk_reduction: 0.574, verified: true,
    cleaned_at: "2026-03-20T16:30:00",
  },
];

const MOCK_PHOTOS: CommunityPhoto[] = [
  {
    id: "CPH-001", lat: 13.0564, lon: 77.6297,
    classification: { dominant_stream: "Dry/Blue" },
    matched_dump: "DUMP-001", match_distance_m: 45,
    timestamp: "2026-03-21T08:30:00",
  },
  {
    id: "CPH-002", lat: 13.0515, lon: 77.5978,
    classification: { dominant_stream: "Hazardous/Black" },
    matched_dump: "DUMP-003", match_distance_m: 120,
    timestamp: "2026-03-21T09:15:00",
  },
];

export function useCleanupData() {
  const [cleanedSites, setCleanedSites] = useState<CleanedSite[]>(MOCK_CLEANED);
  const [communityPhotos, setCommunityPhotos] = useState<CommunityPhoto[]>(MOCK_PHOTOS);

  const refresh = useCallback(async () => {
    try {
      const [cleanedRes, photosRes] = await Promise.all([
        fetch(`${API_BASE}/api/cleanup/cleaned`),
        fetch(`${API_BASE}/api/community/active-photos`),
      ]);
      if (cleanedRes.ok) {
        const data = await cleanedRes.json();
        setCleanedSites(data.cleaned_sites || []);
      }
      if (photosRes.ok) {
        const data = await photosRes.json();
        setCommunityPhotos(data.photos || []);
      }
    } catch {
      // Keep mock data for offline
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15000); // poll every 15s
    return () => clearInterval(interval);
  }, [refresh]);

  return { cleanedSites, communityPhotos, refresh };
}
