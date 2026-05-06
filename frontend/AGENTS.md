# Frontend Agent Rules — OrbitClean 2.0

> Read the root `AGENTS.md` and `CLAUDE.md` first. This file adds frontend-specific rules.

---

## Framework

- **Next.js 14 (App Router)** — not Pages Router. All routes live in `src/app/`.
- Use Server Components by default. Add `"use client"` only when the component needs browser APIs (Leaflet, camera, form state) or React hooks.
- TypeScript strict mode is enabled. Run `npx tsc --noEmit` to check types before finishing.

---

## API Integration

- All backend calls go to `http://localhost:8000` (or `process.env.NEXT_PUBLIC_API_URL`).
- The seed/fallback data in `src/lib/data.ts` is used only when the backend is unreachable. Do not treat it as the source of truth.
- Never fetch backend data inside a component render without handling loading + error states.

---

## Map (Leaflet)

- Always import `MapView` with `next/dynamic` and `ssr: false`. Leaflet requires `window`.
- Coordinate order in GeoJSON is `[longitude, latitude]` but Leaflet `LatLng` is `(lat, lon)`. Always swap when converting.
- Map layers: dump markers (risk-coloured), risk heatmap (100m grid), route polylines, cleaned sites, recyclers, water bodies. Do not add new map layers without adding a toggle control.

---

## Styling

- Tailwind CSS only. Do not add inline styles except for dynamic values (e.g., computed opacity from risk score).
- Dark theme throughout. Background: `bg-gray-900`, cards: `bg-gray-800`, borders: `border-gray-700`.
- Risk colour convention: red = critical (>0.8), orange = high (0.6–0.8), yellow = medium (<0.6), green = clean.

---

## Component Conventions

- One component per file. File name = component name (PascalCase).
- Props types defined inline with the component (no separate `types/` for component props — those live in `src/types/index.ts` for shared API types).
- The 31 shared TypeScript interfaces (dump sites, wards, routes, missions, etc.) live in `src/types/index.ts`. Add new shared types there.

---

## Key Pages

| Route | File | Purpose |
|-------|------|---------|
| `/` | `src/app/page.tsx` | Main dashboard (Overview / Routes / Cleanup / ML tabs) |
| `/qr` | `src/app/qr/page.tsx` | QR code display for mobile pairing |
| `/mobile` | `src/app/mobile/` | Mobile field capture (camera + GPS + classification) |

---

## Do Not

- Do not add a state management library (Zustand, Redux, Jotai, etc.).
- Do not add a CSS framework other than Tailwind.
- Do not SSR any Leaflet component.
- Do not rename or remove tabs in `page.tsx` without updating `CLAUDE.md`.
- Do not hardcode Bengaluru coordinates — use values from the API response or `src/lib/data.ts`.
