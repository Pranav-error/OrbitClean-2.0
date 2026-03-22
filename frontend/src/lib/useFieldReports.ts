"use client";

import { useState, useEffect, useRef } from "react";
import type { FieldReport } from "@/types";

const API_BASE = "http://localhost:8000";
const POLL_INTERVAL_MS = 4000;

export function useFieldReports() {
  const [reports, setReports] = useState<FieldReport[]>([]);
  const [newCount, setNewCount] = useState(0);
  const prevLengthRef = useRef(0);

  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/field-reports?limit=50`, {
          signal: AbortSignal.timeout(2000),
        });
        if (!res.ok || !active) return;
        const data = await res.json();
        const incoming: FieldReport[] = data.reports ?? [];
        if (incoming.length !== prevLengthRef.current) {
          setNewCount(Math.max(0, incoming.length - prevLengthRef.current));
          prevLengthRef.current = incoming.length;
          setReports(incoming);
        }
      } catch {
        // API offline — silently skip
      }
    };

    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => { active = false; clearInterval(id); };
  }, []);

  return { reports, newCount };
}
