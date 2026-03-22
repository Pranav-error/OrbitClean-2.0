import { NextRequest, NextResponse } from "next/server";

const BACKEND = "http://localhost:8000";

async function handler(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const backendUrl = `${BACKEND}/${path.join("/")}`;

  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    if (!["host", "connection"].includes(k)) headers[k] = v;
  });

  const res = await fetch(backendUrl, {
    method: req.method,
    headers,
    body: req.method !== "GET" && req.method !== "HEAD" ? await req.arrayBuffer() : undefined,
  });

  const data = await res.arrayBuffer();
  return new NextResponse(data, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/json" },
  });
}

export const GET = handler;
export const POST = handler;
export const DELETE = handler;
