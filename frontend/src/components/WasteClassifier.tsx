"use client";

import { useState, useRef, useCallback } from "react";
import type { ClassificationResult } from "@/types";
import { DEMO_CLASSIFICATIONS, STREAM_COLORS } from "@/lib/data";

export default function WasteClassifier() {
  const [result, setResult] = useState<ClassificationResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const classify = useCallback(() => {
    const r = DEMO_CLASSIFICATIONS[Math.floor(Math.random() * DEMO_CLASSIFICATIONS.length)];
    setResult(r);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      classify();
    },
    [classify]
  );

  const streamColor = result ? (STREAM_COLORS[result.dominant_stream] ?? "#4a5a70") : "";

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Waste Classifier (YOLOv8)</span>
        <span className="badge badge-blue">AI</span>
      </div>

      {/* Drop zone */}
      <div
        className={`mx-2.5 mb-2.5 rounded-xl border-2 border-dashed p-5 text-center cursor-pointer transition-all ${
          dragging
            ? "border-[#4db8ff] bg-[#4db8ff]/10"
            : "border-[#4db8ff]/30 bg-[#4db8ff]/3 hover:border-[#4db8ff] hover:bg-[#4db8ff]/8"
        }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={classify} />
        <div className="text-2xl mb-1.5">📸</div>
        <div className="text-[11px] text-[#4a5a70]">
          Drop or click to classify waste<br />
          <span className="text-[#4db8ff]">YOLOv8 · TACO Dataset · 4-Stream SWM</span>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div className="mx-2.5 mb-2.5 space-y-1.5">
          <div
            className="px-3 py-2 rounded-lg border"
            style={{
              background: `${streamColor}18`,
              borderColor: `${streamColor}40`,
            }}
          >
            <div className="text-[10px] text-[#4a5a70]">DOMINANT STREAM</div>
            <div className="font-syne text-[14px] font-bold" style={{ color: streamColor }}>
              {result.dominant_stream}
            </div>
            <div className="text-[10px] text-[#4a5a70] mt-1">{result.primary_disposal}</div>
          </div>
          {result.detections.map((d, i) => (
            <div
              key={i}
              className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/7"
            >
              <div>
                <div className="text-[12px] font-medium">{d.category}</div>
                <div className="text-[10px] text-[#4a5a70]">{Math.round(d.confidence * 100)}% confidence</div>
              </div>
              <span
                className="text-[9px] px-2 py-0.5 rounded-full font-semibold"
                style={{
                  background: `${STREAM_COLORS[d.swm_stream] ?? "#666"}22`,
                  color: STREAM_COLORS[d.swm_stream] ?? "#aaa",
                }}
              >
                {d.swm_stream}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
