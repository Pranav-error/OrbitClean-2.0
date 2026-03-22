/* TruckSimulation — CVRP live demo for OrbitClean route optimization
 * Fetches actual road-following path from OSRM, animates a truck collecting
 * household waste and clearing illegal dump sites with capacity tracking.
 */
"use client";
import { useEffect, useRef, useState, useCallback } from "react";

interface Stop { id:string; lat:number; lon:number; type:"depot"|"residential"|"dump"; name:string; households:number; waste_kg:number; risk?:number; }
export interface TruckStats { households:number; waste_kg:number; cap_pct:number; status:"idle"|"running"|"paused"|"done"; events:{time:string;msg:string;type:"info"|"dump"|"depot"|"warn"}[]; }

// ZONE-N route — Clarke-Wright CVRP computed from detected_dumps.geojson (295 real sites)
// Stops = NN-ordered cluster centroids of actual satellite-detected dumps in North Thanisandra
// Naive (8 dedicated trucks, star): 13.79 km → CW (1 truck, 8 stops): 4.35 km = 68% savings
// Each stop capped at 60 kg daily fresh deposit; total 480 kg ≤ 500 kg tipper capacity
const STOPS:Stop[]=[
  {id:"depot",lat:13.0601,lon:77.6310,type:"depot",name:"BBMP DWCC Depot — ZONE-N",households:0,waste_kg:0},
  {id:"s1",lat:13.05991,lon:77.63118,type:"dump",name:"Cluster S1 — 1 site · 1,100m² · 16.5T acc.",households:0,waste_kg:60,risk:0.91},
  {id:"s2",lat:13.06070,lon:77.63124,type:"dump",name:"Cluster S2 — 6 sites · 7,300m² · 109.5T acc.",households:0,waste_kg:60,risk:0.94},
  {id:"s3",lat:13.06062,lon:77.63036,type:"dump",name:"Cluster S3 — 3 sites · 700m² · 10.5T acc.",households:0,waste_kg:60,risk:0.88},
  {id:"s4",lat:13.06108,lon:77.62836,type:"dump",name:"Cluster S4 — 2 sites · 200m² · 3T acc.",households:0,waste_kg:60,risk:0.85},
  {id:"s5",lat:13.05965,lon:77.62732,type:"dump",name:"Cluster S5 — 2 sites · 600m² · 9T acc.",households:0,waste_kg:60,risk:0.89},
  {id:"s6",lat:13.05934,lon:77.62762,type:"dump",name:"Cluster S6 — 4 sites · 1,800m² · 27T acc.",households:0,waste_kg:60,risk:0.92},
  {id:"s7",lat:13.06023,lon:77.62587,type:"dump",name:"Cluster S7 — 4 sites · 800m² · 12T acc.",households:0,waste_kg:60,risk:0.87},
  {id:"s8",lat:13.05994,lon:77.62522,type:"dump",name:"Cluster S8 — 5 sites · 1,200m² · 18T acc.",households:0,waste_kg:60,risk:0.90},
  {id:"return",lat:13.0601,lon:77.6310,type:"depot",name:"BBMP DWCC — Unload (480kg collected)",households:0,waste_kg:0},
];

function geodist(la1:number,lo1:number,la2:number,lo2:number){const R=6371000,dL=(la2-la1)*Math.PI/180,dO=(lo2-lo1)*Math.PI/180,a=Math.sin(dL/2)**2+Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dO/2)**2;return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}

const INIT:TruckStats={households:0,waste_kg:0,cap_pct:0,status:"idle",events:[{time:"06:00",msg:"Truck ready at BBMP DWCC — ZONE-N route (8 real CW stops)",type:"depot"}]};

export default function TruckSimulation({onStats}:{onStats?:(s:TruckStats)=>void}){
  const cRef=useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapR=useRef<any>(null),L_=useRef<any>(null),lyr=useRef<Record<string,any>>({pts:[]});
  const [mounted,setMounted]=useState(false);
  const [pts,setPts]=useState<[number,number][]>([]);
  const [osrm,setOsrm]=useState<"loading"|"ok"|"fail">("loading");
  const [stats,setStats]=useState<TruckStats>(INIT);
  const animR=useRef<ReturnType<typeof setInterval>|null>(null);
  const idxR=useRef(0),vis=useRef<Set<string>>(new Set()),sR=useRef(INIT),tR=useRef(360);

  useEffect(()=>setMounted(true),[]);

  useEffect(()=>{
    if(!mounted||!cRef.current||mapR.current)return;
    import("leaflet").then(L=>{
      L_.current=L;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete(L.Icon.Default.prototype as any)._getIconUrl;
      const map=L.map(cRef.current!,{center:[13.0575,77.6285],zoom:16,zoomControl:false});
      L.control.zoom({position:"bottomright"}).addTo(map);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",{maxZoom:19}).addTo(map);
      mapR.current=map;
      STOPS.forEach(s=>{
        if(s.type==="dump")L.circleMarker([s.lat,s.lon],{radius:9,fillColor:s.risk!>=0.85?"#ef4444":"#f97316",color:"#fff",weight:2,fillOpacity:0.85}).bindTooltip(`<b style="color:#ef4444">${s.name}</b><br><small>${s.waste_kg}kg</small>`,{direction:"top"}).addTo(map);
        if(s.id==="depot")L.marker([s.lat,s.lon],{icon:L.divIcon({className:"",html:`<div style="background:#0ea5e9;color:white;font-size:10px;font-weight:700;padding:3px 7px;border-radius:6px;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.25);white-space:nowrap;transform:translate(-50%,-100%)">DWCC Depot</div>`,iconSize:[0,0]})}).addTo(map);
      });
    });
  },[mounted]);

  useEffect(()=>{
    if(!mounted)return;
    const c=STOPS.map(s=>`${s.lon},${s.lat}`).join(";");
    fetch(`https://router.project-osrm.org/route/v1/driving/${c}?overview=full&geometries=geojson`,{signal:AbortSignal.timeout(9000)})
      .then(r=>r.json()).then(d=>{setPts(d.routes[0].geometry.coordinates.map(([lo,la]:[number,number])=>[la,lo] as [number,number]));setOsrm("ok");})
      .catch(()=>{const fb:[number,number][]=[];for(let i=0;i<STOPS.length-1;i++){const a=STOPS[i],b=STOPS[i+1];for(let j=0;j<=10;j++)fb.push([a.lat+(b.lat-a.lat)*j/10,a.lon+(b.lon-a.lon)*j/10]);}setPts(fb);setOsrm("fail");});
  },[mounted]);

  useEffect(()=>{
    if(!mapR.current||pts.length===0||!L_.current)return;
    lyr.current.rl?.remove();
    lyr.current.rl=L_.current.polyline(pts,{color:"#2563eb",weight:3,opacity:0.3,dashArray:"6,4"}).addTo(mapR.current);
  },[pts]);

  const upd=useCallback((p:Partial<TruckStats>)=>{sR.current={...sR.current,...p};const n={...sR.current};setStats(n);onStats?.(n);},[onStats]);
  const log=useCallback((msg:string,type:TruckStats["events"][0]["type"])=>{const h=String(Math.floor(tR.current/60)).padStart(2,"0"),m=String(tR.current%60|0).padStart(2,"0");sR.current={...sR.current,events:[{time:`${h}:${m}`,msg,type},...sR.current.events].slice(0,12)};setStats({...sR.current});onStats?.({...sR.current});},[onStats]);
  const halt=useCallback(()=>{if(animR.current){clearInterval(animR.current);animR.current=null;}},[]);
  const reset=useCallback(()=>{halt();idxR.current=0;vis.current=new Set();tR.current=360;sR.current=INIT;setStats(INIT);onStats?.(INIT);lyr.current.truck?.remove();lyr.current.truck=null;lyr.current.trail?.remove();lyr.current.trail=null;lyr.current.pts=[];},[halt,onStats]);

  const run=useCallback(()=>{
    if(pts.length===0)return;
    if(sR.current.status==="done")reset();
    const L=L_.current;if(!L||!mapR.current)return;
    lyr.current.pts=lyr.current.pts||[];
    if(!lyr.current.truck)lyr.current.truck=L.marker([pts[0][0],pts[0][1]],{icon:L.divIcon({className:"",html:`<div style="font-size:22px;transform:translate(-50%,-50%);filter:drop-shadow(0 2px 4px rgba(0,0,0,.3))">🚛</div>`,iconSize:[0,0]}),zIndexOffset:1000}).addTo(mapR.current);
    upd({status:"running"});log("Departed BBMP DWCC depot","depot");
    animR.current=setInterval(()=>{
      const i=idxR.current;
      if(i>=pts.length){halt();upd({status:"done"});log(`✅ ${sR.current.households} HH served · ${sR.current.waste_kg}kg collected`,"depot");return;}
      const[la,lo]=pts[i];
      lyr.current.truck?.setLatLng([la,lo]);lyr.current.pts.push([la,lo]);lyr.current.trail?.remove();
      if(lyr.current.pts.length>1)lyr.current.trail=L.polyline(lyr.current.pts,{color:"#2563eb",weight:3,opacity:0.85}).addTo(mapR.current);
      tR.current+=0.1;
      STOPS.forEach(s=>{
        if(vis.current.has(s.id))return;
        if(geodist(la,lo,s.lat,s.lon)<60){
          vis.current.add(s.id);
          const wk=Math.min(sR.current.waste_kg+s.waste_kg,500),cp=Math.round(wk/5);
          upd({households:sR.current.households+s.households,waste_kg:wk,cap_pct:cp});
          if(s.type==="dump"){log(`🚨 Cleared ${s.name} +${s.waste_kg}kg`,"dump");mapR.current.flyTo([s.lat,s.lon],17,{duration:0.4});setTimeout(()=>mapR.current?.flyTo([la,lo],16,{duration:0.3}),700);}
          else if(s.type==="residential")log(`📦 ${s.households} HH +${s.waste_kg}kg`,"info");
          else if(s.id==="return")log("🏭 Back at DWCC — unloading","depot");
          if(cp>=85&&s.type==="residential")log(`⚠️ Capacity ${cp}% — returning soon`,"warn");
        }
      });
      idxR.current=i+1;
    },200);
  },[pts,upd,log,halt,reset]);

  const pause=useCallback(()=>{if(sR.current.status==="running"){halt();upd({status:"paused"});}else if(sR.current.status==="paused")run();},[halt,upd,run]);

  if(!mounted)return null;
  return(
    <div className="relative w-full h-full">
      <div ref={cRef} className="w-full h-full"/>
      <div className="absolute top-3 left-3 z-[500]">
        {osrm==="loading"&&<div className="px-3 py-1.5 rounded-lg bg-white/90 border border-[#e2e8f0] text-[10px] text-[#64748b] shadow-sm">Fetching road network (OSRM)...</div>}
        {osrm==="ok"&&<div className="px-3 py-1.5 rounded-lg bg-[#ecfdf5] border border-[#a7f3d0] text-[10px] text-[#059669] font-semibold shadow-sm">✓ Road-following via OpenStreetMap OSRM</div>}
        {osrm==="fail"&&<div className="px-3 py-1.5 rounded-lg bg-[#fffbeb] border border-[#fde68a] text-[10px] text-[#92400e] shadow-sm">⚠ Approximate path (OSRM unavailable)</div>}
      </div>
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[500] flex gap-3">
        {stats.status==="idle"&&<button onClick={run} disabled={osrm==="loading"} className="px-5 py-2.5 rounded-xl bg-[#2563eb] text-white text-[12px] font-bold shadow-lg hover:bg-[#1d4ed8] disabled:opacity-40">▶ Start Simulation</button>}
        {stats.status==="running"&&<button onClick={pause} className="px-5 py-2.5 rounded-xl bg-[#f59e0b] text-white text-[12px] font-bold shadow-lg">⏸ Pause</button>}
        {stats.status==="paused"&&<button onClick={pause} className="px-5 py-2.5 rounded-xl bg-[#10b981] text-white text-[12px] font-bold shadow-lg">▶ Resume</button>}
        {stats.status!=="idle"&&<button onClick={reset} className="px-5 py-2.5 rounded-xl bg-white border border-[#e2e8f0] text-[#64748b] text-[12px] font-semibold shadow-lg">↺ Reset</button>}
      </div>
    </div>
  );
}
