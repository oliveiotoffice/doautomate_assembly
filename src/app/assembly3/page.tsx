"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { CSSProperties } from "react";
import Image from "next/image";
import { Activity, AlarmClock, CheckCircle2, Gauge, Maximize2, Moon, PackageCheck, QrCode, RefreshCcw, ShieldAlert, Sun, X } from "lucide-react";
import { useTheme } from "./components/ThemeContext";
import Header from "./components/Header";
/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   TYPES
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
interface Param {
  name: string;
  method: string;
  required: string;
  tolerance: string;
  unit: string;
}

interface Station {
  id: number;
  name: string;
  code: string;
  seqLabel: string;
  params: Param[];
}

type LiveActuals = Record<number, Record<number, number>>;
type SummaryIcon = typeof PackageCheck;
type ForceDepthSelection = {
  forceIndex: number;
  depthIndex: number;
};
type SvgValueStatus = "normal" | "pass" | "fail";
type AssemblyApiPayload = {
  actuals?: Record<string, Record<string, number | null | undefined>>;
  common?: {
    modelNo?: string | number;
    componentNo?: string | number;
    partsProcessed?: number;
    good?: number;
    scrap?: number;
    rework?: number;
    cycleTime?: { actual?: number };
    activeAlarms?: string;
  };
  componentNo?: string | number;
  modelNo?: string | number;
  modelNumber?: string | number;
  summary?: {
    total?: number;
    ok?: number;
    ng?: number;
    scrap?: number;
    rework?: number;
  };
  source?: {
    connected?: boolean;
    message?: string;
  };
  plc?: {
    connected?: boolean;
    message?: string;
  };
};

const LIVE_REFRESH_MS = 1000;

function apiConnected(payload: AssemblyApiPayload | null): boolean {
  return payload?.source?.connected === true || payload?.plc?.connected === true;
}

function apiMessage(payload: AssemblyApiPayload | null): string {
  return payload?.source?.message || payload?.plc?.message || "PLC not connected";
}

function normalizeApiActuals(actuals: AssemblyApiPayload["actuals"]): LiveActuals {
  if (!actuals) return {};
  const normalized: LiveActuals = {};
  Object.entries(actuals).forEach(([stationId, values]) => {
    normalized[Number(stationId)] = {};
    Object.entries(values || {}).forEach(([index, value]) => {
      if (typeof value === "number" && Number.isFinite(value)) normalized[Number(stationId)][Number(index)] = value;
    });
  });
  return normalized;
}

function completedStationIdsFromApi(payload: AssemblyApiPayload | null, stations: Station[]): number[] {
  if (!apiConnected(payload)) return [];
  const actuals = normalizeApiActuals(payload?.actuals);
  return stations
    .filter((station) => {
      const stationActuals = actuals[station.id] || {};
      const params = station.id === 11 ? INSPECTION_PARAMS : station.params;
      if (params.length === 0) return false;
      return params.every((param, index) =>
        typeof stationActuals[index] === "number" && checkPass(param, stationActuals[index])
      );
    })
    .map((station) => station.id);
}


type AssemblyTheme = {
  bg: string;
  panel: string;
  panelAlt: string;
  surface: string;
  border: string;
  borderSoft: string;
  text: string;
  textMid: string;
  muted: string;
  accent: string;
  accentSoft: string;
  ok: string;
  okSoft: string;
  okBorder: string;
  ng: string;
  ngSoft: string;
  ngBorder: string;
  info: string;
  infoSoft: string;
  infoBorder: string;
  disabled: string;
  imageBg: string;
  svgLine: string; svgRing: string;
  svgCardMid: string; svgCardMidAlt: string;
  svgCardValue: string; svgCardBorder: string; svgCardText: string;
};

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   DATA
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const STATIONS: Station[] = [
  {
    id: 7, name: "STATION 7 - Plug Press Station", code: "STATION 7", seqLabel: "Plugs\nFed",
    params: [
      { name: "Ball L Force", method: "Force Sensor", required: "4.21 kN", tolerance: "Â±0.1", unit: "kN" },
      { name: "Ball L Depth", method: "Laser Distance", required: "15.68 mm", tolerance: "Â±0.05", unit: "mm" },
      { name: "Ball R Force", method: "Force Sensor", required: "4.24 kN", tolerance: "Â±0.1", unit: "kN" },
      { name: "Ball R Depth", method: "Laser Distance", required: "15.65 mm", tolerance: "Â±0.05", unit: "mm" },
    ],
  },
  {
    id: 9, name: "STATION 9 - Dowel Pin Press Station", code: "STATION 9", seqLabel: "Dowel\nPress",
    params: [
      { name: "Dowel L Force", method: "Force Sensor", required: "2.85 kN", tolerance: "+/-0.1", unit: "kN" },
      { name: "Dowel L Height", method: "LVDT", required: "4.50 mm", tolerance: "+/-0.25", unit: "mm" },
      { name: "Dowel R Force", method: "Force Sensor", required: "2.88 kN", tolerance: "+/-0.1", unit: "kN" },
      { name: "Dowel R Depth", method: "LVDT", required: "23.00 mm", tolerance: "+/-0.1", unit: "mm" },
    ],
  },
  { id: 10, name: "Part Rotation", code: "STATION 10", seqLabel: "Rotate", params: [] },
  {
    id: 11, name: "STATION 11 - Final Inspection", code: "STATION 11", seqLabel: "Inspect",
    params: [
      { name: "Dowel Height Left", method: "LVDT", required: "4.5 mm", tolerance: "Â±0.25", unit: "mm" },
      { name: "Dowel Height Right", method: "LVDT", required: "4.5 mm", tolerance: "Â±0.25", unit: "mm" },
      { name: "Outer Dia.", method: "LVDT", required: "26.5 mm", tolerance: "Â±0.1", unit: "mm" },
    ],
  },
];

const PLUG_PRESS_PARAMS: Param[] = [
  { name: "Plug L Force", method: "Force Sensor", required: "3.55 kN", tolerance: "+/-0.1", unit: "kN" },
  { name: "Plug L Depth", method: "Laser Distance", required: "16.10 mm", tolerance: "+/-0.05", unit: "mm" },
  { name: "Plug R Force", method: "Force Sensor", required: "3.57 kN", tolerance: "+/-0.1", unit: "kN" },
  { name: "Plug R Depth", method: "Laser Distance", required: "16.10 mm", tolerance: "+/-0.05", unit: "mm" },
];


const DISPLAY_STATIONS = STATIONS.map((station) => {
  if (station.id === 7) return { ...station, name: "Plug Press", code: "STATION 7", seqLabel: "Plug\nPress", params: PLUG_PRESS_PARAMS };
  if (station.id === 9) return { ...station, name: "Dowel Press", code: "STATION 9", seqLabel: "Dowel\nPress" };
  return station;
});

const PARAM_STATIONS = DISPLAY_STATIONS.filter((station) => station.params.length > 0 && station.id !== 10);

const INSPECTION_PARAMS: Param[] = [
  { name: "Left Dowel Height", method: "LVDT", required: "4.50 mm", tolerance: "+/-0.25", unit: "mm" },
  { name: "Right Dowel Height", method: "LVDT", required: "4.50 mm", tolerance: "+/-0.25", unit: "mm" },
  { name: "Dowel Length", method: "LVDT", required: "448.0 mm", tolerance: "+/-0.5", unit: "mm" },
  { name: "Overall Length", method: "LVDT", required: "466.05 mm", tolerance: "+/-0.1", unit: "mm" },
  { name: "Left Overall Diameter", method: "Air Gauge", required: "35.00 mm", tolerance: "+/-0.05", unit: "mm" },
  { name: "Right Overall Diameter", method: "Air Gauge", required: "35.00 mm", tolerance: "+/-0.05", unit: "mm" },
  { name: "Left Milling Height", method: "LVDT", required: "23.00 mm", tolerance: "+/-0.1", unit: "mm" },
  { name: "Right Milling Height", method: "LVDT", required: "23.00 mm", tolerance: "+/-0.1", unit: "mm" },
  { name: "Plug Left Depth", method: "Laser", required: "16.10 mm", tolerance: "+/-0.05", unit: "mm" },
  { name: "Plug Right Depth", method: "Laser", required: "16.10 mm", tolerance: "+/-0.05", unit: "mm" },
  { name: "Ball Left Depth", method: "Laser", required: "15.66 mm", tolerance: "+/-0.05", unit: "mm" },
  { name: "Ball Right Depth", method: "Laser", required: "15.66 mm", tolerance: "+/-0.05", unit: "mm" },
  { name: "Dowel Left Depth", method: "LVDT", required: "4.50 mm", tolerance: "+/-0.25", unit: "mm" },
  { name: "Dowel Right Depth", method: "LVDT", required: "4.50 mm", tolerance: "+/-0.25", unit: "mm" },
  { name: "QR Grade", method: "Vision", required: "1.00", tolerance: "+/-0.2", unit: "grade" },
];

const SEQ_STEPS = [
  "Plug\nPress",
  "Dowel\nPress",
];

const SEQ_DESCRIPTIONS = [
  "Press Fit Plugs",
  "Press Fit Dowel",
];

const SEQ_IMAGES = [
  "/images/plugpress1.png",
  "/images/dowelpress1.png",
];

const SEQ_IMAGE_SIZES = [
  { width: 1254, height: 1254 },
  { width: 1254, height: 1254 },
];

const PROG_STEPS = ["Pallet Pos.", "Loading", "Servo Press"];
const PROCESS_MS = 1800;

const fs = {
  xs: "calc(clamp(9px, 0.54vw, 11px) * var(--h-scale))",
  sm: "calc(clamp(10px, 0.62vw, 13px) * var(--h-scale))",
  base: "calc(clamp(11px, 0.70vw, 14px) * var(--h-scale))",
  md: "calc(clamp(12px, 0.78vw, 15px) * var(--h-scale))",
  lg: "calc(clamp(13px, 0.88vw, 17px) * var(--h-scale))",
  xl: "calc(clamp(15px, 1.02vw, 20px) * var(--h-scale))",
  hdr: "calc(clamp(17px, 1.16vw, 23px) * var(--h-scale))",
  value: "calc(clamp(23px, 1.72vw, 35px) * var(--h-scale))",
  stat: "calc(clamp(25px, 1.96vw, 39px) * var(--h-scale))",
  summary: "calc(clamp(25px, 1.86vw, 39px) * var(--h-scale))",
};

const MONO: CSSProperties = {
  fontFamily: "'Montserrat', sans-serif",
  letterSpacing: 0,
};

function cleanTolerance(value: string): string {
  return value.replace("Ã‚Â±", "+/-").replace("Â±", "+/-");
}

function stationActionName(station: Station): string {
  if (station.name.toLowerCase().includes("plug")) return "Plug Assembly";
  if (station.name.toLowerCase().includes("ball")) return "Ball Assembly";
  if (station.name.toLowerCase().includes("dowel")) return "Dowel Pin Press";
  return station.name;
}

function stationSubtitle(station: Station): string {
  if (station.name.toLowerCase().includes("plug")) return "Press Fit Plugs at Both Ends";
  if (station.name.toLowerCase().includes("ball")) return "Press Fit Spherical Balls at Ends";
  if (station.name.toLowerCase().includes("dowel")) return "Left and Right Pin Force / Height Control";
  return station.seqLabel.replace("\n", " ");
}

function stationNumberLabel(station: Station): string {
  return String(station.id);
}

function makeAssemblyTheme(dark: boolean): AssemblyTheme {
  if (dark) {
    return {
      bg: "#111418",
      panel: "#1f252d",
      panelAlt: "#28313b",
      surface: "#303a46",
      border: "#46515f",
      borderSoft: "#3a4653",
      text: "#f8fafc",
      textMid: "#cbd5e1",
      muted: "#94a3b8",
      accent: "#ff6200",
      accentSoft: "rgba(255,98,0,0.16)",
      ok: "#31c878",
      okSoft: "rgba(49,200,120,0.16)",
      okBorder: "rgba(49,200,120,0.34)",
      ng: "#ef4444",
      ngSoft: "rgba(239,68,68,0.16)",
      ngBorder: "rgba(239,68,68,0.34)",
      info: "#7bb7ff",
      infoSoft: "rgba(123,183,255,0.16)",
      infoBorder: "rgba(123,183,255,0.34)",
      disabled: "#64748b",
      imageBg: "#141a21", svgLine: "#e5eef8",
      svgRing: "#31c878",
      svgCardMid: "#2a3440",
      svgCardMidAlt: "#344150",
      svgCardValue: "#0f4c8a",
      svgCardBorder: "#64748b",
      svgCardText: "#f8fafc",
    };
  }

  return {
    bg: "#eef3f8",
    panel: "#ffffff",
    panelAlt: "#f6f8fb",
    surface: "#e6edf4",
    border: "#aebdcc",
    borderSoft: "#d9e2eb",
    text: "#071b33",
    textMid: "#334760",
    muted: "#8a9bae",
    accent: "#ff5b13",
    accentSoft: "#fff1e8",
    ok: "#008a3d",
    okSoft: "#f4fbf7",
    okBorder: "#71b98c",
    ng: "#e11919",
    ngSoft: "#fff7f7",
    ngBorder: "#f09a9a",
    info: "#0f4c8a",
    infoSoft: "#f3f8ff",
    infoBorder: "#9eb9dc",
    disabled: "#aab7c5",
    imageBg: "#f8fafc", svgLine: "#071b33",
    svgRing: "#008a3d",
    svgCardMid: "#e6edf4",
    svgCardMidAlt: "#d9e2eb",
    svgCardValue: "#0f4c8a",
    svgCardBorder: "#aebdcc",
    svgCardText: "#071b33",
  };
}
/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   HELPERS
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function parseReq(r: string): number {
  const m = r.match(/-?\d+\.?\d*/);
  return m ? parseFloat(m[0]) : 0;
}

function getTol(t: string): { lo: number; hi: number } {
  if (!t || t === "â€”") return { lo: -Infinity, hi: Infinity };
  const tr = cleanTolerance(t).trim().replace("âˆ’", "-");
  if (tr.includes("+/-")) { const v = Math.abs(parseFloat(tr.replace("+/-", ""))); return { lo: -v, hi: v }; }
  if (tr.includes("Â±")) { const v = parseFloat(tr.replace("Â±", "")); return { lo: -v, hi: v }; }
  const m = tr.match(/-?\d+\.?\d*/);
  const v = m ? parseFloat(m[0]) : 0.1;
  return v < 0 ? { lo: v, hi: 0 } : { lo: -v, hi: v };
}

function checkPass(param: Param, actual: number): boolean {
  const req = parseReq(param.required);
  const { lo, hi } = getTol(param.tolerance);
  return actual >= req + lo && actual <= req + hi;
}

function formatToleranceRange(param: Param): string {
  const req = parseReq(param.required);
  const { lo, hi } = getTol(param.tolerance);
  const decimals = param.unit === "kN" ? 2 : param.unit === "grade" ? 2 : 3;
  const low = req + lo;
  const high = req + hi;
  return `${low.toFixed(decimals)} - ${high.toFixed(decimals)}`;
}

function inspectionSvgValues(name: string, actuals: Record<number, number>, plcConnected: boolean) {
  const param = INSPECTION_PARAMS.find((item) => item.name === name);
  if (!param || !plcConnected) return { high: "-", low: "-", value: "-", status: "normal" as SvgValueStatus };

  const index = INSPECTION_PARAMS.indexOf(param);
  const req = parseReq(param.required);
  const { lo, hi } = getTol(param.tolerance);
  const liveActual = actuals[index];
  const hasActual = typeof liveActual === "number";
  const actual = hasActual ? liveActual : req;

  return {
    high: String(req + hi),
    low: String(req + lo),
    value: String(actual),
    status: hasActual ? (checkPass(param, actual) ? "pass" : "fail") : "normal",
  };
}

function formatUnit(unit: string): string {
  return unit.toLowerCase();
}

function paramSide(name: string): string {
  if (/\bL\b|Left/i.test(name)) return "LEFT";
  if (/\bR\b|Right/i.test(name)) return "RIGHT";
  return "CHECK";
}

function metricLabel(name: string): string {
  return name
    .replace(/\s+/g, " ")
    .trim() || name;
}

function isForceParam(param: Param): boolean {
  return param.name.toLowerCase().includes("force") || param.unit === "kN";
}

function isDepthParam(param: Param): boolean {
  const name = param.name.toLowerCase();
  return name.includes("depth") || name.includes("height") || param.unit === "mm";
}

function getForceDepthPair(params: Param[], forceIndex: number): ForceDepthSelection | null {
  const forceParam = params[forceIndex];
  if (!forceParam || !isForceParam(forceParam)) return null;

  const side = paramSide(forceParam.name);
  const depthIndex = params.findIndex((param, index) =>
    index !== forceIndex &&
    paramSide(param.name) === side &&
    !isForceParam(param) &&
    isDepthParam(param)
  );

  if (depthIndex >= 0) return { forceIndex, depthIndex };

  const nextDepthIndex = params.findIndex((param, index) =>
    index > forceIndex &&
    !isForceParam(param) &&
    isDepthParam(param)
  );

  return nextDepthIndex >= 0 ? { forceIndex, depthIndex: nextDepthIndex } : null;
}

function forceSparkPoints(actual: number, req: number, tol: number): string {
  const width = 112;
  const height = 30;
  const spread = Math.max(tol * 2.6, Math.abs(req) * 0.035, 0.2);
  const values = Array.from({ length: 18 }, (_, i) => {
    const settle = 1 - i / 24;
    const wave = Math.sin(i * 0.9 + actual) * spread * 0.28;
    const pressRamp = i < 5 ? (i - 4) * spread * 0.34 : 0;
    return actual + wave * settle + pressRamp;
  });
  const lo = req - spread;
  const hi = req + spread;

  return values.map((value, i) => {
    const x = (i / (values.length - 1)) * width;
    const pct = Math.max(0, Math.min(1, (value - lo) / (hi - lo || 1)));
    const y = height - pct * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function getVisibleStations(completedIds: number[]): Station[] {
  if (completedIds.length >= PARAM_STATIONS.length) return PARAM_STATIONS;
  return PARAM_STATIONS;
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   MINI ICONS
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const CheckSVG = ({ s = 14, sw = 3 }: { s?: number; sw?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const SpinSVG = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
    style={{ animation: "dash-spin .7s linear infinite" }}>
    <path strokeLinecap="round" d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
  </svg>
);
const PlaySVG = ({ s = 13 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   PROGRESS BAR
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ProgressBar({ loading, C }: { loading: boolean; C: AssemblyTheme }) {
  const [width, setWidth] = useState(100);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    startRef.current = null;
    if (!loading) {
      rafRef.current = requestAnimationFrame(() => setWidth(100));
      return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }
    const tick = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      const pct = Math.max(0, 100 - ((ts - startRef.current) / PROCESS_MS) * 100);
      setWidth(pct);
      if (pct > 0) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [loading]);

  return (
    <div style={{ height: 3, background: C.border, borderRadius: 4, overflow: "hidden", flexShrink: 0 }}>
      <div style={{ height: "100%", borderRadius: 4, width: `${width}%`, background: loading ? C.accent : C.ok }} />
    </div>
  );
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   SEQ BAR
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function SeqBar({
  completedCount,
  C,
  steps,
  showTitle = false,
  border = "bottom",
}: {
  completedCount: number;
  C: AssemblyTheme;
  steps: number[];
  showTitle?: boolean;
  border?: "top" | "bottom";
}) {
  return (
    <div
      style={{
        flex: showTitle ? "0 0 clamp(178px, 22vh, 232px)" : "0 0 clamp(142px, 18vh, 184px)",
        borderTop: border === "top" ? `1px solid ${C.border}` : undefined,
        borderBottom: border === "bottom" ? `1px solid ${C.border}` : undefined,
        background: C.panel,
        overflow: "hidden",
        padding: showTitle ? "8px 12px 10px" : "7px 12px 10px",
      }}
    >
      {showTitle && (
        <div style={{ ...MONO, fontSize: fs.md, fontWeight: 900, color: C.accent, textTransform: "uppercase" as const, marginBottom: 6 }}>Assembly Sequence</div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`, gap: 0, alignItems: "center", width: "100%", height: showTitle ? "calc(100% - 24px)" : "100%", minHeight: 0 }}>
        {steps.map((i, rowStepIndex) => {
          const lbl = SEQ_STEPS[i];
          const done = i < completedCount;
          const active = i === completedCount;
          const clr = done ? C.ok : active ? C.accent : C.disabled;
          const bg = done ? C.okSoft : active ? C.accentSoft : C.panelAlt;
          const bdr = done ? C.ok : active ? C.accent : C.border;
          const arrowColor = done ? C.ok : C.accent;
          return (
            <div key={i} style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0, minHeight: 0 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 24px 1fr", alignItems: "center", width: "100%", height: 22, marginBottom: 4, flexShrink: 0 }}>
                <div style={{ height: 2, background: arrowColor, opacity: rowStepIndex === 0 ? 0 : 1 }} />
                <div style={{
                  width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                  background: bg, border: `2px solid ${bdr}`, color: bdr,
                  animation: active ? "dash-ring 1.2s infinite" : "none", zIndex: 1,
                }}>
                  <span style={{ ...MONO, fontSize: fs.xs, fontWeight: 900, color: clr }}>{String(i + 1).padStart(2, "0")}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", height: 2 }}>
                  <div style={{ height: 2, flex: 1, background: arrowColor, opacity: rowStepIndex === steps.length - 1 ? 0 : 1 }} />
                  {rowStepIndex < steps.length - 1 && (
                    <div style={{ width: 0, height: 0, borderTop: "4px solid transparent", borderBottom: "4px solid transparent", borderLeft: `7px solid ${arrowColor}` }} />
                  )}
                </div>
              </div>

              <div
                style={{
                  width: "clamp(260px, 28vw, 480px)",
                  height: "clamp(72px, 7.6vw, 108px)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 5,
                  opacity: 1,
                  filter: "none",
                  overflow: "hidden",
                  flexShrink: 1,
                }}
              >
                <Image
                  src={SEQ_IMAGES[i]}
                  alt={lbl.replace("\n", " ")}
                  width={SEQ_IMAGE_SIZES[i].width}
                  height={SEQ_IMAGE_SIZES[i].height}
                  sizes="(max-width: 768px) 150px, 205px"
                  style={{
                    width: "100%",
                    height: "100%",
                    maxWidth: "100%",
                    maxHeight: "100%",
                    objectFit: "contain",
                    imageRendering: "auto",
                  }}
                  quality={100}
                  priority
                />
              </div>
              {rowStepIndex < steps.length - 1 && (
                <div style={{ position: "absolute", top: "calc(22px + 4px + clamp(72px, 7.6vw, 108px) / 2)", right: 0, transform: "translate(50%, -50%)", width: "clamp(24px, 3.2vw, 46px)", height: 12, display: "flex", alignItems: "center", pointerEvents: "none" }}>
                  <div style={{ height: 2, flex: 1, background: C.accent }} />
                  <div style={{ width: 0, height: 0, borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderLeft: `8px solid ${C.accent}` }} />
                </div>
              )}
              <div style={{ minHeight: "calc(30px * var(--h-scale))", color: clr, textAlign: "center", textTransform: "uppercase" as const, lineHeight: 1.08, flexShrink: 0 }}>
                <div style={{ ...MONO, fontSize: fs.xs, fontWeight: 900, whiteSpace: "pre-line" }}>{lbl}</div>
                {SEQ_DESCRIPTIONS[i] && (
                  <div style={{ ...MONO, fontSize: fs.xs, fontWeight: 700, marginTop: 2, color: C.textMid, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{SEQ_DESCRIPTIONS[i]}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   STEPPER ROW
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function StepRow({ station, completedIds, processingId, activeIds, onClick }: {
  station: Station;
  completedIds: number[];
  processingId: number | null;
  activeIds: number[];
  onClick: (id: number) => void;
}) {
  const done = completedIds.includes(station.id);
  const loading = processingId === station.id;
  const active = activeIds.includes(station.id) && !done;
  const pending = !done && !active;

  const nodeBg = "#e5e7eb";
  const nodeColor = done || active ? "#fff" : "#9ca3af";
  const labelColor = done ? "#16a34a" : active ? "#ff6200" : "#9ca3af";
  const badgeBg = done ? "#f0fdf4" : active ? "rgba(255,98,0,.1)" : "#f3f4f6";
  const badgeColor = done ? "#16a34a" : active ? "#ff6200" : "#9ca3af";
  const badgeText = done ? "Done" : loading ? "Processingâ€¦" : active ? "Click to Run" : "Pending";

  return (
    <div
      onClick={active && !loading ? () => onClick(station.id) : undefined}
      className={active && !loading ? "step-hover" : ""}
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "11px 14px",
        borderBottom: "1px solid #f3f4f6", background: active ? "#fff7ed" : "#fff",
        cursor: active && !loading ? "pointer" : pending ? "not-allowed" : "default",
        opacity: pending ? 0.5 : 1, transition: "background .2s", userSelect: "none" as const,
      }}
    >
      <div style={{
        width: 30, height: 30, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
        background: nodeBg, color: nodeColor, fontSize: 12, fontWeight: 700, flexShrink: 0, transition: "all .3s",
        boxShadow: active ? "0 0 0 4px rgba(255,98,0,.18)" : "none",
      }}>
        {done && <CheckSVG s={14} />}
        {loading && <SpinSVG s={12} />}
        {!done && !loading && station.id}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: labelColor, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
          {station.name}
        </p>
        <span style={{ ...MONO, fontSize: fs.xs, fontWeight: 700, textTransform: "uppercase" as const, color: "#d1d5db", marginTop: 2, display: "block" }}>
          {station.code}
        </span>
      </div>
      <span style={{ ...MONO, borderRadius: 20, padding: "4px 10px", fontSize: fs.xs, fontWeight: 800, textTransform: "uppercase" as const, whiteSpace: "nowrap" as const, background: badgeBg, color: badgeColor, marginLeft: "auto" }}>
        {badgeText}
      </span>
    </div>
  );
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   STATION PANEL
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function StationPanel({ station, done, loading, actuals, onRun, C }: {
  station: Station;
  done: boolean;
  loading: boolean;
  actuals: Record<number, number>;
  onRun: (id: number) => void;
  C: AssemblyTheme;
}) {
  const progDone = done ? 3 : loading ? 2 : 1;

  return (
    <div style={{ flex: 1, borderRadius: 8, border: `1px solid ${C.border}`, background: C.panel, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: `1px solid ${C.border}`, background: C.surface, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ ...MONO, fontSize: fs.xl, fontWeight: 900, color: C.accent }}>{stationNumberLabel(station)}</span>
          <div>
            <div style={{ ...MONO, fontSize: fs.sm, fontWeight: 800, color: C.textMid }}>{station.name}</div>
            <div style={{ ...MONO, fontSize: fs.xs, fontWeight: 700, textTransform: "uppercase" as const, color: C.muted, marginTop: 1 }}>{station.code}</div>
          </div>
        </div>
        {done && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, background: C.okSoft, border: `1px solid ${C.okBorder}`, borderRadius: 8, padding: "4px 10px", fontSize: 10, fontWeight: 700, color: C.ok, animation: "badge-pop .3s cubic-bezier(.34,1.56,.64,1)" }}>
            <CheckSVG s={11} /> Complete
          </div>
        )}
      </div>

      {/* 3-step progress */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderBottom: `1px solid ${C.borderSoft}`, flexShrink: 0 }}>
        {PROG_STEPS.map((lbl, i) => {
          const pDone = i < progDone;
          const pActive = i === progDone - 1 && !done;
          const dotBg = pDone ? C.ok : pActive ? C.accent : C.border;
          const dotClr = pDone || pActive ? "#fff" : C.muted;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: dotBg, color: dotClr, fontSize: 8, fontWeight: 700, animation: pActive ? "dash-ring 1.2s infinite" : "none", transition: "all .4s" }}>
                {pDone ? <CheckSVG s={8} /> : i + 1}
              </div>
              <span style={{ fontSize: 8, color: C.muted, marginRight: 2 }}>{lbl}</span>
              {i < PROG_STEPS.length - 1 && (
                <div style={{ width: 16, height: 2, borderRadius: 2, background: i < progDone - 1 ? C.ok : C.border, transition: "background .4s" }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Params */}
      {station.params.length === 0 ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: C.muted, fontWeight: 600 }}>No parameters</div>
      ) : (
        <div style={{ flex: 1, overflowY: "auto" }}>
          <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" as const }}>
            <thead>
              <tr>
                {["Parameter", "Method", "Req.", "Actual", "Status"].map(h => (
                  <th key={h} style={{ ...MONO, fontSize: fs.xs, fontWeight: 800, textTransform: "uppercase" as const, color: C.muted, padding: "6px 10px", background: C.surface, borderBottom: `1px solid ${C.border}`, textAlign: "left" as const, whiteSpace: "nowrap" as const }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {station.params.map((p, i) => {
                const actual = actuals[i] ?? parseReq(p.required);
                const pass = checkPass(p, actual);
                return (
                  <tr key={i} style={{ borderBottom: i < station.params.length - 1 ? `1px solid ${C.borderSoft}` : "none" }}>
                    <td style={{ padding: "7px 10px", fontWeight: 600, color: C.text, fontSize: 10.5 }}>{p.name}</td>
                    <td style={{ padding: "7px 10px", color: C.textMid, fontSize: 10 }}>{p.method}</td>
                    <td style={{ ...MONO, padding: "7px 10px", color: C.textMid, fontSize: fs.xs }}>{p.required}</td>
                    <td style={{ ...MONO, padding: "7px 10px", fontWeight: 800, fontSize: fs.sm, color: pass ? C.ok : C.ng, transition: "color .3s" }}>{actual.toFixed(3)}</td>
                    <td style={{ padding: "7px 10px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 20, fontSize: 9, fontWeight: 700, whiteSpace: "nowrap" as const, background: pass ? C.okSoft : C.ngSoft, color: pass ? C.ok : C.ng }}>
                        {pass ? <><CheckSVG s={9} /> OK</> : <>âœ• NG</>}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Complete banner */}
      {done && (
        <div style={{ ...MONO, background: C.ok, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: 8, fontSize: fs.sm, fontWeight: 800, textTransform: "uppercase" as const, flexShrink: 0, animation: "slide-up .4s ease" }}>
          <CheckSVG s={14} /> {station.name} Complete
        </div>
      )}

      {/* Run button */}
      <button
        className={!done && !loading ? "run-btn" : ""}
        onClick={!done && !loading ? () => onRun(station.id) : undefined}
        disabled={done || loading}
        style={{ ...MONO, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", padding: "9px 14px", border: "none", flexShrink: 0, fontSize: fs.sm, fontWeight: 800, textTransform: "uppercase" as const, cursor: done || loading ? "not-allowed" : "pointer", background: done || loading ? C.border : C.accent, color: done || loading ? C.muted : "#fff", borderRadius: "0 0 8px 8px", transition: "background .2s" }}
      >
        {loading ? <><SpinSVG /> Processingâ€¦</> : done ? <><CheckSVG s={13} /> Complete</> : <><PlaySVG /> Run Station</>}
      </button>
    </div>
  );
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   MAIN
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function MetricReadout({
  param,
  actual,
  pass,
  C,
  style,
  graphPair,
  onOpenGraph,
}: {
  param: Param;
  actual: number | null;
  pass: boolean;
  C: AssemblyTheme;
  style?: CSSProperties;
  graphPair?: ForceDepthSelection | null;
  onOpenGraph?: (selection: ForceDepthSelection) => void;
}) {
  const hasActual = typeof actual === "number";
  const tone = !hasActual ? C.muted : pass ? C.ok : C.ng;
  const side = paramSide(param.name);
  const label = metricLabel(param.name);
  const decimals = param.unit === "kN" ? 2 : 3;
  const canOpenGraph = Boolean(graphPair && onOpenGraph);
  const openGraph = () => {
    if (graphPair && onOpenGraph) onOpenGraph(graphPair);
  };
  const cardBg = C.panel;
  const headerBg = C.surface;
  const valueBg = C.panelAlt;

  return (
    <div className="metric-readout" style={{
      minWidth: 0,
      minHeight: 0,
      containerType: "inline-size",
      display: "grid",
      gridTemplateRows: "auto minmax(0, 1fr) auto",
      gap: 0,
      padding: 0,
      borderRadius: 3,
      border: `1.5px solid ${C.border}`,
      borderTop: `3px solid ${tone}`,
      background: cardBg,
      overflow: "hidden",
      boxShadow: "0 1px 2px rgba(0,0,0,0.22)",
      cursor: canOpenGraph ? "pointer" : "default",
      ...style,
    }}
      role={canOpenGraph ? "button" : undefined}
      tabIndex={canOpenGraph ? 0 : undefined}
      title={canOpenGraph ? "Open full graph" : undefined}
      onClick={canOpenGraph ? openGraph : undefined}
      onKeyDown={canOpenGraph ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openGraph();
        }
      } : undefined}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, minWidth: 0, padding: "4px 6px", borderBottom: `1px solid ${C.border}`, background: headerBg }}>
        <div style={{ minWidth: 0, flex: "1 1 auto", display: "grid", gridTemplateRows: "auto auto", gap: 2, overflow: "hidden" }}>
          <span style={{ ...MONO, fontSize: "calc(clamp(6.5px, 0.34vw, 8px) * var(--h-scale))", fontWeight: 900, color: C.textMid, lineHeight: 1, letterSpacing: "0.06em", textTransform: "uppercase" as const, whiteSpace: "nowrap" }}>
            {side}
          </span>
          <span style={{ ...MONO, fontSize: "calc(clamp(8px, 0.46vw, 10px) * var(--h-scale))", fontWeight: 900, color: C.text, lineHeight: 1.05, whiteSpace: "normal", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
            {label}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <span style={{ ...MONO, minWidth: 35, textAlign: "center", borderRadius: 3, padding: "3px 6px", background: !hasActual ? C.panelAlt : pass ? C.okSoft : C.ngSoft, border: `1px solid ${tone}`, color: tone, fontSize: "clamp(7px, min(3.9cqw, .86vh), 9px)", fontWeight: 900 }}>
            {!hasActual ? "-" : pass ? "OK" : "NG"}
          </span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", alignItems: "stretch", gap: 4, minWidth: 0, padding: "4px 6px", background: valueBg }}>
        <div style={{ minWidth: 0, minHeight: 0, display: "flex", alignItems: "baseline", gap: 5, paddingLeft: 6, overflow: "hidden" }}>
          <span style={{ ...MONO, minWidth: 0, alignSelf: "center", fontSize: "calc(clamp(28px, min(13.5cqw, 3.35dvh), 46px) * var(--h-scale))", fontWeight: 900, color: C.info, lineHeight: 0.9, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", transformOrigin: "left center" }}>
            {hasActual ? actual.toFixed(decimals) : "-"}
          </span>
          <span style={{ ...MONO, flexShrink: 0, fontSize: "calc(clamp(12px, min(5.8cqw, 1.35dvh), 16px) * var(--h-scale))", fontWeight: 900, color: C.textMid, lineHeight: 1, textTransform: "lowercase", whiteSpace: "nowrap" }}>
            {formatUnit(param.unit)}
          </span>
        </div>
      </div>

      <div style={{ minWidth: 0, minHeight: "calc(22px * var(--h-scale))", padding: "4px 6px", borderTop: `1px solid ${C.borderSoft}`, background: C.panel, display: "flex", alignItems: "center" }}>
        <span style={{ ...MONO, display: "block", minWidth: 0, fontSize: "calc(clamp(9px, 0.48vw, 12px) * var(--h-scale))", fontWeight: 900, color: C.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          TOL : {formatToleranceRange(param)} {formatUnit(param.unit)}
        </span>
      </div>
    </div>
  );
}

function forceDepthCurveData(forceActual: number, depthActual: number): Array<{ force: number; depth: number }> {
  const peakForce = Math.max(forceActual, 0.1);
  const peakDepth = Math.max(depthActual, 0.1);

  return Array.from({ length: 44 }, (_, i) => {
    const t = i / 43;
    const force = peakForce * (0.04 * t + 0.96 * Math.pow(t, 0.72));
    const depthRamp = 0.08 * t + 0.92 * (1 - Math.cos((t * Math.PI) / 2));
    const settleWave = Math.sin(t * Math.PI * 5 + peakForce) * peakDepth * 0.008 * (1 - t);
    return {
      force,
      depth: Math.max(0, Math.min(peakDepth * 1.08, peakDepth * depthRamp + settleWave)),
    };
  });
}

function formatMetricValue(param: Param, value: number): string {
  return value.toFixed(param.unit === "kN" ? 2 : 3);
}

function ForceDepthGraph({
  forceParam,
  depthParam,
  forceActual,
  depthActual,
  C,
}: {
  forceParam: Param;
  depthParam: Param;
  forceActual: number;
  depthActual: number;
  C: AssemblyTheme;
}) {
  const width = 780;
  const height = 390;
  const pad = { top: 24, right: 28, bottom: 62, left: 72 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const forceSet = parseReq(forceParam.required);
  const depthSet = parseReq(depthParam.required);
  const forceMax = Math.max(forceActual, forceSet, 0.1) * 1.18;
  const depthMax = Math.max(depthActual, depthSet, 0.1) * 1.14;
  const xOf = (force: number) => pad.left + (Math.max(0, Math.min(force, forceMax)) / forceMax) * plotWidth;
  const yOf = (depth: number) => pad.top + plotHeight - (Math.max(0, Math.min(depth, depthMax)) / depthMax) * plotHeight;
  const curvePoints = forceDepthCurveData(forceActual, depthActual)
    .map((point) => `${xOf(point.force).toFixed(1)},${yOf(point.depth).toFixed(1)}`)
    .join(" ");
  const xTicks = Array.from({ length: 5 }, (_, i) => (forceMax / 4) * i);
  const yTicks = Array.from({ length: 5 }, (_, i) => (depthMax / 4) * i);
  const targetX = xOf(forceSet);
  const targetY = yOf(depthSet);
  const actualX = xOf(forceActual);
  const actualY = yOf(depthActual);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${forceParam.name} and ${depthParam.name} force depth graph`} style={{ width: "100%", height: "100%", display: "block" }}>
      <rect x="0" y="0" width={width} height={height} fill={C.panel} />
      <rect x={pad.left} y={pad.top} width={plotWidth} height={plotHeight} rx="4" fill={C.imageBg} stroke={C.border} />

      {xTicks.map((tick) => {
        const x = xOf(tick);
        return (
          <g key={`x-${tick.toFixed(2)}`}>
            <line x1={x} y1={pad.top} x2={x} y2={pad.top + plotHeight} stroke={C.borderSoft} strokeWidth="1" />
            <text x={x} y={pad.top + plotHeight + 22} textAnchor="middle" fill={C.textMid} fontSize="12" fontWeight="800">
              {tick.toFixed(1)}
            </text>
          </g>
        );
      })}

      {yTicks.map((tick) => {
        const y = yOf(tick);
        return (
          <g key={`y-${tick.toFixed(2)}`}>
            <line x1={pad.left} y1={y} x2={pad.left + plotWidth} y2={y} stroke={C.borderSoft} strokeWidth="1" />
            <text x={pad.left - 12} y={y + 4} textAnchor="end" fill={C.textMid} fontSize="12" fontWeight="800">
              {tick.toFixed(1)}
            </text>
          </g>
        );
      })}

      <line x1={pad.left} y1={pad.top + plotHeight} x2={pad.left + plotWidth} y2={pad.top + plotHeight} stroke={C.text} strokeWidth="2" />
      <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + plotHeight} stroke={C.text} strokeWidth="2" />

      <line x1={targetX} y1={pad.top} x2={targetX} y2={pad.top + plotHeight} stroke={C.accent} strokeWidth="1.5" strokeDasharray="6 6" opacity="0.68" />
      <line x1={pad.left} y1={targetY} x2={pad.left + plotWidth} y2={targetY} stroke={C.accent} strokeWidth="1.5" strokeDasharray="6 6" opacity="0.68" />
      <polyline points={curvePoints} fill="none" stroke={C.info} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={actualX} cy={actualY} r="7" fill={C.accent} stroke={C.panel} strokeWidth="3" />

      <text x={pad.left + plotWidth / 2} y={height - 14} textAnchor="middle" fill={C.text} fontSize="15" fontWeight="900">
        X Axis Force ({formatUnit(forceParam.unit)})
      </text>
      <text transform={`translate(20 ${pad.top + plotHeight / 2}) rotate(-90)`} textAnchor="middle" fill={C.text} fontSize="15" fontWeight="900">
        Y Axis Depth ({formatUnit(depthParam.unit)})
      </text>
    </svg>
  );
}

function ForceDepthValueCard({
  param,
  actual,
  C,
}: {
  param: Param;
  actual: number;
  C: AssemblyTheme;
}) {
  const pass = checkPass(param, actual);
  const tone = pass ? C.ok : C.ng;

  return (
    <div style={{
      minWidth: 0,
      border: `1.5px solid ${C.border}`,
      borderTop: `4px solid ${tone}`,
      borderRadius: 4,
      background: C.panel,
      overflow: "hidden",
      display: "grid",
      gridTemplateRows: "auto minmax(0, 1fr) auto",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 11px", borderBottom: `1px solid ${C.border}`, background: C.surface }}>
        <div style={{ ...MONO, minWidth: 0, fontSize: fs.md, fontWeight: 900, color: C.text, textTransform: "uppercase" as const, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {param.name}
        </div>
        <span style={{ ...MONO, flexShrink: 0, borderRadius: 3, padding: "4px 9px", background: pass ? C.okSoft : C.ngSoft, border: `1px solid ${tone}`, color: tone, fontSize: fs.xs, fontWeight: 900 }}>
          {pass ? "OK" : "NG"}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "13px 12px", background: C.imageBg }}>
        <span style={{ ...MONO, fontSize: "clamp(28px, 4.2vw, 48px)", fontWeight: 900, lineHeight: 1, color: C.info, fontVariantNumeric: "tabular-nums" }}>
          {formatMetricValue(param, actual)}
        </span>
        <span style={{ ...MONO, fontSize: fs.lg, fontWeight: 900, color: C.textMid }}>
          {formatUnit(param.unit)}
        </span>
      </div>
      <div style={{ padding: "8px 11px", borderTop: `1px solid ${C.border}`, background: C.panelAlt }}>
        <span style={{ ...MONO, display: "block", minWidth: 0, fontSize: fs.sm, fontWeight: 800, color: C.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          TOL : {formatToleranceRange(param)} {formatUnit(param.unit)}
        </span>
      </div>
    </div>
  );
}

function ForceDepthRow({
  forceParam,
  depthParam,
  forceIndex,
  depthIndex,
  actuals,
  plcConnected,
  C,
  onOpenGraph,
}: {
  forceParam: Param;
  depthParam: Param;
  forceIndex: number;
  depthIndex: number;
  actuals: Record<number, number>;
  plcConnected: boolean;
  C: AssemblyTheme;
  onOpenGraph?: (selection: ForceDepthSelection) => void;
}) {
  const forceActual = plcConnected ? actuals[forceIndex] ?? parseReq(forceParam.required) : null;
  const depthActual = plcConnected ? actuals[depthIndex] ?? parseReq(depthParam.required) : null;
  const forcePass = forceActual !== null && checkPass(forceParam, forceActual);
  const depthPass = depthActual !== null && checkPass(depthParam, depthActual);
  const graphSelection = { forceIndex, depthIndex };

  return (
    <div
      style={{
        minWidth: 0,
        minHeight: 0,
        display: "grid",
        gridTemplateRows: "minmax(0, 1fr)",
        border: `1.5px solid ${C.border}`,
        borderRadius: 3,
        background: C.panel,
        overflow: "hidden",
      }}
    >
      <div style={{ minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}>
        <MetricReadout
          param={forceParam}
          actual={forceActual}
          pass={forcePass}
          C={C}
          style={{
            border: "none",
            borderRight: `1px solid ${C.border}`,
            borderTop: `3px solid ${forcePass ? C.ok : C.ng}`,
            borderRadius: 0,
          }}
          graphPair={plcConnected ? graphSelection : null}
          onOpenGraph={onOpenGraph}
        />
        <MetricReadout
          param={depthParam}
          actual={depthActual}
          pass={depthPass}
          C={C}
          style={{
            border: "none",
            borderTop: `3px solid ${depthPass ? C.ok : C.ng}`,
            borderRadius: 0,
          }}
          graphPair={plcConnected ? graphSelection : null}
          onOpenGraph={onOpenGraph}
        />
      </div>
    </div>
  );
}

function ForceDepthModal({
  station,
  selection,
  actuals,
  C,
  onClose,
}: {
  station: Station;
  selection: ForceDepthSelection;
  actuals: Record<number, number>;
  C: AssemblyTheme;
  onClose: () => void;
}) {
  const params = station.id === 11 ? INSPECTION_PARAMS : station.params;
  const forceParam = params[selection.forceIndex];
  const depthParam = params[selection.depthIndex];
  if (!forceParam || !depthParam) return null;

  const forceActual = actuals[selection.forceIndex] ?? parseReq(forceParam.required);
  const depthActual = actuals[selection.depthIndex] ?? parseReq(depthParam.required);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${forceParam.name} full graph`}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,
        background: "rgba(2,6,23,0.78)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(14px, 2vw, 28px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(96vw, 1320px)",
          height: "min(90vh, 860px)",
          display: "grid",
          gridTemplateRows: "auto minmax(0, 1fr)",
          borderRadius: 10,
          border: `1px solid ${C.border}`,
          background: C.panel,
          boxShadow: "0 28px 70px rgba(0,0,0,0.42)",
          overflow: "hidden",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 12px",
          borderBottom: `1px solid ${C.border}`,
          background: C.surface,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ ...MONO, fontSize: fs.hdr, fontWeight: 900, color: C.text, textTransform: "uppercase" as const, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {station.code} Force Depth Full View
            </div>
            <div style={{ ...MONO, marginTop: 3, fontSize: fs.sm, fontWeight: 800, color: C.textMid, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {forceParam.name} / {depthParam.name}
            </div>
          </div>
          <button
            type="button"
            aria-label="Close full graph"
            title="Close"
            onClick={onClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: 7,
              border: `1px solid ${C.border}`,
              background: C.panelAlt,
              color: C.text,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <X size={20} strokeWidth={2.7} />
          </button>
        </div>

        <div style={{ minHeight: 0, padding: 14, display: "grid", gridTemplateRows: "minmax(0, 1fr) auto", gap: 12, background: C.imageBg }}>
          <div style={{ minHeight: 0, border: `1px solid ${C.border}`, borderRadius: 4, background: C.panel, overflow: "hidden" }}>
            <ForceDepthGraph forceParam={forceParam} depthParam={depthParam} forceActual={forceActual} depthActual={depthActual} C={C} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, minWidth: 0 }}>
            <ForceDepthValueCard param={forceParam} actual={forceActual} C={C} />
            <ForceDepthValueCard param={depthParam} actual={depthActual} C={C} />
          </div>
        </div>
      </div>
    </div>
  );
}

function QRTile({ C, pass, style }: { C: AssemblyTheme; pass: boolean; style?: CSSProperties }) {
  const tone = pass ? C.ok : C.ng;
  const grade = pass ? "A" : "C";

  return (
    <div className="qr-tile" style={{ minHeight: 0, border: `1.5px solid ${C.border}`, borderTop: `3px solid ${tone}`, borderRadius: 3, background: C.panel, display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,0.22)", ...style }}>
      <div style={{ ...MONO, minWidth: 0, padding: "6px 8px", borderBottom: `1px solid ${C.borderSoft}`, background: C.surface, fontSize: fs.md, fontWeight: 900, color: C.text, textTransform: "uppercase" as const, lineHeight: 1, whiteSpace: "normal", textAlign: "center" }}>
        QR Grade
      </div>
      <div style={{ minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, padding: "7px 6px", background: C.panel }}>
        <QrCode color={tone} strokeWidth={2.4} style={{ width: "clamp(30px, 3.8vw, 54px)", height: "clamp(30px, 3.8vw, 54px)", flexShrink: 0 }} />
        <span style={{ ...MONO, color: tone, fontSize: fs.sm, fontWeight: 900, letterSpacing: "0.08em", lineHeight: 1.1, textAlign: "center", textTransform: "uppercase" as const, whiteSpace: "normal" }}>
          Grade {grade}
        </span>
      </div>
    </div>
  );
}
function StationMeasurementView({ station, actuals, plcConnected, C, onOpenGraph }: {
  station: Station;
  actuals: Record<number, number>;
  plcConnected: boolean;
  C: AssemblyTheme;
  onOpenGraph?: (selection: ForceDepthSelection) => void;
}) {
  const params = station.id === 11 ? INSPECTION_PARAMS : station.params;
  const isInspection = station.id === 11;
  const leftParams = params.filter((p) => paramSide(p.name) === "LEFT");
  const rightParams = params.filter((p) => paramSide(p.name) === "RIGHT");
  const centerParams = params.filter((p) => paramSide(p.name) === "CHECK");

  if (isInspection) {
    const inspectionLayout = [
      "Left Dowel Height",
      "Right Dowel Height",
      "Dowel Length",
      "Overall Length",
      "Left Overall Diameter",
      "Right Overall Diameter",
      "Left Milling Height",
      "Right Milling Height",
      "Ball Left Depth",
      "Ball Right Depth",
      "Dowel Left Depth",
      "Dowel Right Depth",
      "QR Grade",
    ];

    return (
      <div
        className="inspection-grid"
        style={{
          flex: "1 1 auto",
          width: "100%",
          height: "100%",
          minWidth: 0,
          minHeight: 0,
          padding: 4,
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          gridTemplateRows: "repeat(3, minmax(0, 1fr))",
          gap: 4,
          overflow: "hidden",
          background: C.imageBg,
        }}
      >
        {inspectionLayout.map((name, layoutIndex) => {
          const p = params.find((item) => item.name === name);
          if (!p) return null;
          const i = params.indexOf(p);
          const actual = plcConnected ? actuals[i] ?? parseReq(p.required) : null;
          const pass = actual !== null && checkPass(p, actual);
          if (name === "QR Grade") return <QRTile key={name} C={C} pass={pass} style={{ gridColumn: (layoutIndex % 5) + 1, gridRow: Math.floor(layoutIndex / 5) + 1 }} />;
          return (
            <MetricReadout
              key={p.name}
              param={p}
              actual={actual}
              pass={pass}
              C={C}
              style={{
                gridColumn: (layoutIndex % 5) + 1,
                gridRow: Math.floor(layoutIndex / 5) + 1,
              }}
            />
          );
        })}
      </div>
    );
  }

  const sideRows = (["LEFT", "RIGHT"] as const).map((side) => {
    const sideParams = params.filter((param) => paramSide(param.name) === side);
    const forceParam = sideParams.find(isForceParam);
    const depthParam = sideParams.find((param) => !isForceParam(param) && isDepthParam(param));
    if (!forceParam || !depthParam) return null;
    const forceIndex = params.indexOf(forceParam);
    const depthIndex = params.indexOf(depthParam);
    return { side, forceParam, depthParam, forceIndex, depthIndex };
  }).filter((row): row is {
    side: "LEFT" | "RIGHT";
    forceParam: Param;
    depthParam: Param;
    forceIndex: number;
    depthIndex: number;
  } => row !== null);

  if (sideRows.length > 0) {
    return (
      <div
        className="station-measurement-view"
        style={{
          flex: "1 1 auto",
          width: "100%",
          height: "100%",
          minWidth: 0,
          minHeight: 0,
          padding: "clamp(4px, 0.4dvh, 6px)",
          display: "grid",
          gridTemplateColumns: `repeat(${sideRows.length}, minmax(0, 1fr))`,
          gridTemplateRows: "minmax(0, 1fr)",
          gap: "clamp(4px, 0.4dvh, 6px)",
          overflow: "hidden",
          background: C.imageBg,
        }}
      >
        {sideRows.map((row) => (
          <ForceDepthRow
            key={row.side}
            forceParam={row.forceParam}
            depthParam={row.depthParam}
            forceIndex={row.forceIndex}
            depthIndex={row.depthIndex}
            actuals={actuals}
            plcConnected={plcConnected}
            C={C}
            onOpenGraph={onOpenGraph}
          />
        ))}
      </div>
    );
  }

  const unsidedLeft = centerParams.filter((_, i) => i % 2 === 0);
  const unsidedRight = centerParams.filter((_, i) => i % 2 === 1);
  const leftColumn = leftParams.length ? [...leftParams, ...unsidedLeft] : unsidedLeft;
  const rightColumn = rightParams.length ? [...rightParams, ...unsidedRight] : unsidedRight;

  return (
    <div style={{ flex: 1, minHeight: 0, padding: 7, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, overflow: "hidden", background: C.imageBg }}>
      <div style={{ minHeight: 0, display: "grid", gridAutoRows: "minmax(0, 1fr)", gap: 6, overflow: "hidden" }}>
        {leftColumn.map((p) => {
          const i = params.indexOf(p);
          const actual = plcConnected ? actuals[i] ?? parseReq(p.required) : null;
          const pass = actual !== null && checkPass(p, actual);
          return <MetricReadout key={p.name} param={p} actual={actual} pass={pass} C={C} graphPair={plcConnected ? getForceDepthPair(params, i) : null} onOpenGraph={onOpenGraph} />;
        })}
      </div>
      <div style={{ minHeight: 0, display: "grid", gridAutoRows: "minmax(0, 1fr)", gap: 6, overflow: "hidden" }}>
        {rightColumn.map((p) => {
          const i = params.indexOf(p);
          const actual = plcConnected ? actuals[i] ?? parseReq(p.required) : null;
          const pass = actual !== null && checkPass(p, actual);
          return <MetricReadout key={p.name} param={p} actual={actual} pass={pass} C={C} graphPair={plcConnected ? getForceDepthPair(params, i) : null} onOpenGraph={onOpenGraph} />;
        })}
      </div>
    </div>
  );
}

function AssemblyStationPanel({ station, done, loading, actuals, plcConnected, C }: {
  station: Station;
  done: boolean;
  loading: boolean;
  actuals: Record<number, number>;
  plcConnected: boolean;
  C: AssemblyTheme;
}) {
  const [selectedGraph, setSelectedGraph] = useState<ForceDepthSelection | null>(null);

  useEffect(() => {
    if (!selectedGraph) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedGraph(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedGraph]);

  return (
    <>
      {selectedGraph && (
        <ForceDepthModal
          station={station}
          selection={selectedGraph}
          actuals={actuals}
          C={C}
          onClose={() => setSelectedGraph(null)}
        />
      )}
      <div className="assembly-station-card" style={{ width: "100%", height: "100%", flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: 3, border: `1.5px solid ${C.border}`, borderTop: `3px solid ${done ? C.ok : loading ? C.accent : C.border}`, background: C.panel, boxShadow: "0 2px 8px rgba(15,23,42,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, padding: "5px 8px", borderBottom: `1px solid ${C.border}`, background: C.surface, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, flex: "1 1 auto" }}>
            <span style={{ ...MONO, display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 34, borderRadius: 3, background: C.panelAlt, border: `1px solid ${C.accent}`, color: C.accent, fontSize: fs.xl, fontWeight: 900, flexShrink: 0 }}>{stationNumberLabel(station)}</span>
            <div style={{ minWidth: 0, flex: "1 1 auto", containerType: "inline-size" }}>
              <div style={{ ...MONO, fontSize: "clamp(9px, min(4.8cqw, 1.18vh), 12px)", fontWeight: 900, color: C.text, lineHeight: 1.08, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflowWrap: "anywhere", textTransform: "uppercase" as const }}>{station.name}</div>
              <div className="station-subtitle" style={{ ...MONO, fontSize: "clamp(7px, min(3.9cqw, 0.86vh), 9px)", fontWeight: 700, color: C.textMid, marginTop: 2, lineHeight: 1.08, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{stationSubtitle(station)}</div>
            </div>
          </div>
          <div style={{ ...MONO, minWidth: 68, textAlign: "center" as const, borderRadius: 3, padding: "4px 10px", background: C.panelAlt, border: `1px solid ${done ? C.ok : loading ? C.accent : C.border}`, color: done ? C.ok : loading ? C.accent : C.textMid, fontSize: fs.xs, fontWeight: 900, textTransform: "uppercase" as const, flexShrink: 0 }}>
            {done ? "Complete" : loading ? "Running" : "Ready"}
          </div>
        </div>

        {station.params.length === 0 ? (
          <div style={{ ...MONO, flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: fs.lg, fontWeight: 800 }}>No parameters</div>
        ) : (
          <StationMeasurementView station={station} actuals={actuals} plcConnected={plcConnected} C={C} onOpenGraph={setSelectedGraph} />
        )}

      </div>
    </>
  );
}

function RunSummary({
  totalInspected,
  okCount,
  ngCount,
  isLoading,
  cycleTime,
  activeAlarms,
  plcConnected,
  plcErrorMessage,
  C,
}: {
  totalInspected: number;
  okCount: number;
  ngCount: number;
  isLoading: boolean;
  cycleTime: number | null;
  activeAlarms: string;
  plcConnected: boolean;
  plcErrorMessage: string;
  C: AssemblyTheme;
}) {
  const partsProcessed = totalInspected;
  const good = okCount;
  const scrap = ngCount;
  const rework = 0;

  const denominator = good + scrap + rework || 1;
  const summaryValueSize = (value: string) =>
    value.length >= 4
      ? "clamp(26px, min(18cqw, 3.55vh), 38px)"
      : "clamp(34px, min(24cqw, 4.45vh), 50px)";

  const cards: Array<{
    label: string;
    value: string;
    sub: string;
    tone: string;
    border: string;
    icon: SummaryIcon;
  }> = [
      {
        label: "Parts Processed",
        value: String(partsProcessed),
        sub: "This Shift",
        tone: C.accent,
        border: C.border,
        icon: PackageCheck,
      },
      {
        label: "Good",
        value: String(good),
        sub: `${((good / denominator) * 100).toFixed(1)}%`,
        tone: C.ok,
        border: C.okBorder,
        icon: CheckCircle2,
      },
      {
        label: "Scrap",
        value: String(scrap),
        sub: `${((scrap / denominator) * 100).toFixed(1)}%`,
        tone: C.ng,
        border: C.ngBorder,
        icon: ShieldAlert,
      },
      {
        label: "Rework",
        value: String(rework),
        sub: `${((rework / denominator) * 100).toFixed(1)}%`,
        tone: "#b7791f",
        border: "#f6d58a",
        icon: RefreshCcw,
      },
      {
        label: "Cycle Time",
        value: isLoading ? "..." : cycleTime === null ? "-" : cycleTime.toFixed(1),
        sub: "sec/part",
        tone: C.info,
        border: C.infoBorder,
        icon: AlarmClock,
      },
      {
        label: "Active Alarms",
        value: activeAlarms ? "1" : "0",
        sub: activeAlarms || "No Alarms",
        tone: C.textMid,
        border: C.infoBorder,
        icon: Activity,
      },
    ];

  return (
    <div
      className="run-summary"
      style={{
        minHeight: 0,
        borderRadius: 4,
        border: `1px solid ${C.accent}`,
        background: C.panel,
        padding: 8,
        boxShadow: "0 2px 8px rgba(15,23,42,0.08)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {!plcConnected && (
        <div
          role="alert"
          style={{
            ...MONO,
            display: "grid",
            gridTemplateColumns: "auto minmax(0, 1fr)",
            alignItems: "center",
            gap: 7,
            marginBottom: 7,
            padding: "6px 8px",
            borderRadius: 4,
            border: `1px solid ${C.ngBorder}`,
            borderLeft: `4px solid ${C.ng}`,
            background: C.ngSoft,
            color: C.ng,
            fontSize: "clamp(9px, min(0.68vw, 1vh), 12px)",
            fontWeight: 900,
            lineHeight: 1.15,
            textTransform: "uppercase",
            flexShrink: 0,
          }}
        >
          <ShieldAlert size={15} strokeWidth={2.8} />
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            PLC Not Connected{plcErrorMessage ? ` - ${plcErrorMessage}` : ""}
          </span>
        </div>
      )}

      {/* HEADER */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 7,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            ...MONO,
            display: "flex",
            alignItems: "center",
            gap: 6,
            color: C.accent,
            fontSize: fs.xl,
            fontWeight: 900,
            textTransform: "uppercase",
          }}
        >
          <Gauge size={22} strokeWidth={2.6} />
          Run Summary
        </div>

        <div
          style={{
            ...MONO,
            display: "flex",
            alignItems: "center",
            gap: 5,
            color: C.ok,
            fontSize: fs.md,
            fontWeight: 900,
            textTransform: "uppercase",
          }}
        >
          <Activity size={18} strokeWidth={2.6} />
          Shift Live
        </div>
      </div>

      {/* GRID */}
      <div
        className="run-summary-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
          gap: 7,
          flex: 1,
          minHeight: 0,
        }}
      >
        {cards.map((card) => {
          const Icon = card.icon;

          return (
            <div
              key={card.label}
              className="run-summary-card"
              style={{
                minHeight: "clamp(58px, 7.6vh, 82px)",
                borderRadius: 4,
                border: `1px solid ${card.border}`,
                background: C.panelAlt,
                padding: "7px 8px",
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto",
                alignItems: "center",
                gap: 8,
                overflow: "hidden",
                containerType: "inline-size",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 4,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: card.tone,
                    background: C.panel,
                    border: `1px solid ${card.border}`,
                    flexShrink: 0,
                  }}
                >
                  <Icon size={19} strokeWidth={2.7} />
                </div>
                <div
                  style={{
                    minWidth: 0,
                    display: "grid",
                    gap: 3,
                  }}
                >
                  <div
                    style={{
                      ...MONO,
                      fontSize: "clamp(10px, min(0.76vw, 1.16vh), 13px)",
                      fontWeight: 900,
                      color: card.tone,
                      textTransform: "uppercase",
                      lineHeight: 1,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {card.label}
                  </div>
                  <div
                    style={{
                      ...MONO,
                      fontSize: "clamp(9px, min(0.68vw, 1.02vh), 11.5px)",
                      fontWeight: 800,
                      color: C.textMid,
                      lineHeight: 1.05,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: "100%",
                    }}
                  >
                    {card.sub}
                  </div>
                </div>
              </div>

              <div
                style={{
                  ...MONO,
                  justifySelf: "end",
                  maxWidth: "100%",
                  fontSize: summaryValueSize(card.value),
                  lineHeight: 0.92,
                  fontWeight: 900,
                  color: C.text,
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                  overflow: "visible",
                  textAlign: "right",
                }}
              >
                {card.value}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}



function AssemblySvgCard({
  x,
  y,
  label,
  high,
  low,
  value,
  status,
  C,
}: {
  x: number;
  y: number;
  label: string;
  high: string;
  low: string;
  value: string;
  status: SvgValueStatus;
  C: AssemblyTheme;
}) {
  const format = (raw: string) => {
    const parsed = parseFloat(raw);
    return Number.isNaN(parsed) ? raw : parsed.toFixed(3);
  };

  const width = 122;
  const height = 52;
  const row1 = 16;
  const row2 = 14;
  const row3 = height - row1 - row2;
  const clipId = `assembly-card-${x}-${y}`;
  const valueFill = status === "pass" ? C.ok : status === "fail" ? C.ng : C.svgCardValue;

  return (
    <g transform={`translate(${x}, ${y})`}>
      <defs>
        <clipPath id={clipId}>
          <rect width={width} height={height} rx={6} />
        </clipPath>
      </defs>
      <rect width={width} height={height} rx={6} fill="none" stroke={C.text} strokeWidth={0.8} />
      <g clipPath={`url(#${clipId})`}>
        <rect x={0} y={0} width={width} height={row1} fill={C.panel} />
        <rect x={0} y={row1} width={width} height={row2} fill={C.panelAlt} />
        <rect x={0} y={row1 + row2} width={width} height={row3} fill={valueFill} />
        <line x1={0} y1={row1} x2={width} y2={row1} stroke={C.text} strokeWidth={0.6} />
        <line x1={0} y1={row1 + row2} x2={width} y2={row1 + row2} stroke={C.text} strokeWidth={0.6} />
        <line x1={width / 2} y1={row1} x2={width / 2} y2={row1 + row2} stroke={C.text} strokeWidth={0.6} />
      </g>
      <text x={width / 2} y={row1 / 2} textAnchor="middle" dominantBaseline="middle" fill={C.text} fontSize={8.5} fontWeight="700" fontFamily="Montserrat, sans-serif">
        {label}
      </text>
      <text x={width / 4} y={row1 + row2 / 2} textAnchor="middle" dominantBaseline="middle" fill={C.text} fontSize={8.5} fontWeight="700" fontFamily="Montserrat, sans-serif">
        H: {format(high)}
      </text>
      <text x={(width * 3) / 4} y={row1 + row2 / 2} textAnchor="middle" dominantBaseline="middle" fill={C.text} fontSize={8.5} fontWeight="700" fontFamily="Montserrat, sans-serif">
        L: {format(low)}
      </text>
      <text x={width / 2} y={row1 + row2 + row3 / 2} textAnchor="middle" dominantBaseline="middle" fill="#ffffff" fontSize={13.5} fontWeight="800" fontFamily="Montserrat, sans-serif">
        {format(value)}
      </text>
    </g>
  );
}

function AssemblyShaftSvg({ C, actuals, plcConnected }: { C: AssemblyTheme; actuals: Record<number, number>; plcConnected: boolean }) {
  const line = C.text;
  const dowelLength = inspectionSvgValues("Dowel Length", actuals, plcConnected);
  const leftOverallDiameter = inspectionSvgValues("Left Overall Diameter", actuals, plcConnected);
  const rightOverallDiameter = inspectionSvgValues("Right Overall Diameter", actuals, plcConnected);
  const leftMillingHeight = inspectionSvgValues("Left Milling Height", actuals, plcConnected);
  const rightMillingHeight = inspectionSvgValues("Right Milling Height", actuals, plcConnected);

  return (
    <svg
      viewBox="0 0 1100 300"
      preserveAspectRatio="xMidYMid meet"
      style={{
        width: "100%",
        height: "100%",
        display: "block",
      }}
    >
      <defs>
        <marker
          id="arrow"
          markerWidth="6"
          markerHeight="6"
          refX="5"
          refY="3"
          orient="auto-start-reverse"
          markerUnits="strokeWidth"
        >
          <path
            d="M0,0 L6,3 L0,6 Z"
            fill={C.svgLine}
          />
        </marker>
      </defs>
      {/* ðŸ”¥ IMAGE INSIDE SVG */}
      <image
        href="/images/6630862assembly.png"
        x="0"
        y="0"
        width="1100"
        height="300"
        preserveAspectRatio="xMidYMid meet"
      />


      {/* top dowel */}
      <rect
        x={45}
        y={25}
        width={10}
        height={15}
        stroke={C.svgRing}
        strokeWidth="4"
        fill="none"
      />
      {/* top plug */}
      <circle cx={69} cy={59} r="14" stroke={C.svgRing} strokeWidth="6" fill="none" />




      {/* bottom dowel */}
      <rect
        x={1005}
        y={205}
        width={10}
        height={15}
        stroke={C.svgRing}
        strokeWidth="4"
        fill="none"
      />
      {/* bottom plug */}
      <circle cx={1031} cy={239} r="14" stroke={C.svgRing} strokeWidth="6" fill="none" />




      {/* Overall Length bottom  */}
      {/* <line x1="35" y1="280" x2="1065" y2="280" stroke={C.svgLine} strokeWidth="1.5" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
              <line x1="30" y1="290" x2="30" y2="190" stroke={C.svgLine} strokeWidth="1.5" />
              <line x1="1070" y1="290" x2="1070" y2="190" stroke={C.svgLine} strokeWidth="1.5" /> */}

      {/* ABove Dowel Lenth bottom  */}
      <line x1="45" y1="330" x2="1055" y2="330" stroke={C.svgLine} strokeWidth="1.5" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
      <line x1="40" y1="340" x2="40" y2="150" stroke={C.svgLine} strokeWidth="0.5" />
      <line x1="1060" y1="340" x2="1060" y2="150" stroke={C.svgLine} strokeWidth="0.5" />

       <AssemblySvgCard
        x={500}
        y={295}
        label="Dowel Length"
        high={dowelLength.high}
        low={dowelLength.low}
        value={dowelLength.value}
        status={dowelLength.status}
        C={C}
      />

      {/* left side 35 mm diameter */}
      <line x1="220" y1="100" x2="220" y2="60" stroke={C.svgLine} strokeWidth="1.5" markerStart="url(#arrow)" />
      <line x1="180" y1="105" x2="260" y2="105" stroke={C.svgLine} strokeWidth="1.5" />
      <line x1="180" y1="180" x2="260" y2="180" stroke={C.svgLine} strokeWidth="1.5" />
      <line x1="220" y1="230" x2="220" y2="185" stroke={C.svgLine} strokeWidth="1.5" markerEnd="url(#arrow)" />

  <AssemblySvgCard
        x={160}
        y={230}
        label="Overall Dia(Left)"
        high={leftOverallDiameter.high}
        low={leftOverallDiameter.low}
        value={leftOverallDiameter.value}
        status={leftOverallDiameter.status}
        C={C}
      />
      {/* Right side 35 diameter */}

      <line x1="900" y1="102" x2="900" y2="60" stroke={C.svgLine} strokeWidth="1.5" markerStart="url(#arrow)" />
      <line x1="860" y1="108" x2="940" y2="108" stroke={C.svgLine} strokeWidth="1.5" />
      <line x1="860" y1="180" x2="940" y2="180" stroke={C.svgLine} strokeWidth="1.5" />
      <line x1="900" y1="225" x2="900" y2="185" stroke={C.svgLine} strokeWidth="1.5" markerEnd="url(#arrow)" />

           <AssemblySvgCard
        x={835}
        y={15}
        label="Overall Dia(right)"
        high={rightOverallDiameter.high}
        low={rightOverallDiameter.low}
        value={rightOverallDiameter.value}
        status={rightOverallDiameter.status}
        C={C}
      />

      {/* left side Milling height */}
      <line x1="420" y1="117" x2="420" y2="60" stroke={C.svgLine} strokeWidth="1.5" markerStart="url(#arrow)" />
      <line x1="380" y1="120" x2="460" y2="120" stroke={C.svgLine} strokeWidth="2" />
      <line x1="380" y1="180" x2="460" y2="180" stroke={C.svgLine} strokeWidth="2" />
      <line x1="420" y1="230" x2="420" y2="185" stroke={C.svgLine} strokeWidth="1.5" markerEnd="url(#arrow)" />

 <AssemblySvgCard
        x={360}
        y={15}
        label="Milling height(left)"
        high={leftMillingHeight.high}
        low={leftMillingHeight.low}
        value={leftMillingHeight.value}
        status={leftMillingHeight.status}
        C={C}
      />

      {/* Right side Milling height */}


      <line x1="760" y1="117" x2="760" y2="60" stroke={C.svgLine} strokeWidth="1.5" markerStart="url(#arrow)" />
      <line x1="720" y1="120" x2="800" y2="120" stroke={C.svgLine} strokeWidth="2" />
      <line x1="720" y1="180" x2="800" y2="180" stroke={C.svgLine} strokeWidth="2" />
      <line x1="760" y1="230" x2="760" y2="185" stroke={C.svgLine} strokeWidth="1.5" markerEnd="url(#arrow)" />

      <AssemblySvgCard
        x={700}
        y={230}
        label="Milling height(right)"
        high={rightMillingHeight.high}
        low={rightMillingHeight.low}
        value={rightMillingHeight.value}
        status={rightMillingHeight.status}
        C={C}
      />

      {/* left side dowel length  */}
      <line x1="55" y1="120" x2="55" y2="180" stroke={C.svgLine} strokeWidth="2" />




      {/* Right side dowel length  */}
      <line x1="1050" y1="120" x2="1050" y2="180" stroke={C.svgLine} strokeWidth="2" />




    </svg>
  );
}

function AssemblyDiagramCard({
  C,
  onOpen,
  actuals,
  plcConnected,
}: {
  C: AssemblyTheme;
  onOpen: () => void;
  actuals: Record<number, number>;
  plcConnected: boolean;
}) {
  return (
    <div style={{
      width: "100%",
      height: "100%",
      display: "grid",
      gridTemplateRows: "auto minmax(0, 1fr)",
      background: C.panel,
      overflow: "hidden",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "7px 9px",
        borderBottom: `1px solid ${C.border}`,
        background: C.surface,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.ok, boxShadow: `0 0 0 3px ${C.okSoft}`, flexShrink: 0 }} />
          <span style={{ ...MONO, fontSize: fs.sm, fontWeight: 900, color: C.text, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            Assembly View
          </span>
        </div>
        <button
          type="button"
          aria-label="Open shaft assembly full view"
          title="Full View"
          onClick={onOpen}
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            border: `1px solid ${C.border}`,
            background: C.panelAlt,
            color: C.text,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <Maximize2 size={17} strokeWidth={2.6} />
        </button>
      </div>
      <div style={{ minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", background: C.imageBg }}>
        <AssemblyShaftSvg C={C} actuals={actuals} plcConnected={plcConnected} />
      </div>
    </div>
  );
}

function AssemblyDiagramModal({
  C,
  onClose,
  actuals,
  plcConnected,
}: {
  C: AssemblyTheme;
  onClose: () => void;
  actuals: Record<number, number>;
  plcConnected: boolean;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Shaft assembly full view"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(2,6,23,0.78)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(14px, 2vw, 28px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(96vw, 1480px)",
          height: "min(88vh, 820px)",
          display: "grid",
          gridTemplateRows: "auto minmax(0, 1fr)",
          borderRadius: 10,
          border: `1px solid ${C.border}`,
          background: C.panel,
          boxShadow: "0 28px 70px rgba(0,0,0,0.42)",
          overflow: "hidden",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 12px",
          borderBottom: `1px solid ${C.border}`,
          background: C.surface,
        }}>
          <div style={{ ...MONO, fontSize: fs.hdr, fontWeight: 900, color: C.text, textTransform: "uppercase" }}>
            Assembly View
          </div>
          <button
            type="button"
            aria-label="Close full view"
            title="Close"
            onClick={onClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: 7,
              border: `1px solid ${C.border}`,
              background: C.panelAlt,
              color: C.text,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <X size={20} strokeWidth={2.7} />
          </button>
        </div>
        <div style={{ minHeight: 0, padding: 16, background: C.imageBg }}>
          <AssemblyShaftSvg C={C} actuals={actuals} plcConnected={plcConnected} />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { theme, toggleTheme } = useTheme();
  const C = makeAssemblyTheme(theme.mode === "dark");
  const [heightScale, setHeightScale] = useState(1);
  const [completedIds, setCompletedIds] = useState<number[]>([]);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [liveActuals, setLiveActuals] = useState<LiveActuals>({});
  const [totalInspected, setTotalInspected] = useState(0);
  const [okCount, setOkCount] = useState(0);
  const [ngCount, setNgCount] = useState(0);
  const [diagramOpen, setDiagramOpen] = useState(false);
  const [plcConnected, setPlcConnected] = useState(false);
  const [plcErrorMessage, setPlcErrorMessage] = useState("PLC data not loaded");
  const [cycleTime, setCycleTime] = useState<number | null>(null);
  const [activeAlarms, setActiveAlarms] = useState("");
  const [componentNo, setComponentNo] = useState("-");
  const [modelLabel, setModelLabel] = useState("-");

  const intervalsRef = useRef<Record<number, ReturnType<typeof setInterval>>>({});

  useEffect(() => {
    const updateScale = () => {
      const h = window.innerHeight;

      // Base design height is 900px.
      // Clamp scale so fonts do not become too small or too large.
      const scale = Math.max(0.82, Math.min(1.18, h / 900));

      setHeightScale(scale);
    };

    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  const startLive = useCallback((stId: number) => {
    if (intervalsRef.current[stId]) return;
    const st = DISPLAY_STATIONS.find(s => s.id === stId);
    if (!st || st.params.length === 0) return;
    const params = st.id === 11 ? INSPECTION_PARAMS : st.params;
    intervalsRef.current[stId] = setInterval(() => {
      setLiveActuals(prev => {
        const updated: Record<number, number> = { ...(prev[stId] || {}) };
        params.forEach((p, i) => {
          const req = parseReq(p.required);
          const { lo, hi } = getTol(p.tolerance);
          updated[i] = parseFloat((req + Math.random() * (hi - lo) * 1.6 + lo * 0.5).toFixed(3));
        });
        return { ...prev, [stId]: updated };
      });
    }, 1300);
  }, []);

  const stopLive = useCallback((stId: number) => {
    if (intervalsRef.current[stId]) { clearInterval(intervalsRef.current[stId]); delete intervalsRef.current[stId]; }
  }, []);

  useEffect(() => {
    let alive = true;

    const refreshAssemblyData = async () => {
      try {
        const response = await fetch("/api/assembly/current", { cache: "no-store" });
        if (!response.ok) throw new Error("Assembly API request failed");
        const payload: AssemblyApiPayload = await response.json();
        if (!alive) return;

        const connected = apiConnected(payload);
        setPlcConnected(connected);
        setPlcErrorMessage(apiMessage(payload));
        setLiveActuals(connected ? normalizeApiActuals(payload.actuals) : {});
        setCompletedIds(connected ? completedStationIdsFromApi(payload, PARAM_STATIONS) : []);
        setProcessingId(null);
        setTotalInspected(payload.summary?.total ?? payload.common?.partsProcessed ?? 0);
        setOkCount(payload.summary?.ok ?? payload.common?.good ?? 0);
        setNgCount(payload.summary?.ng ?? ((payload.common?.scrap ?? 0) + (payload.common?.rework ?? 0)));
        setCycleTime(typeof payload.common?.cycleTime?.actual === "number" ? payload.common.cycleTime.actual : null);
        setActiveAlarms(payload.common?.activeAlarms || "");
        setComponentNo(String(payload.componentNo || payload.common?.componentNo || "-"));
        setModelLabel(String(payload.modelNo || payload.common?.modelNo || payload.modelNumber || "-"));
      } catch (error) {
        if (!alive) return;
        const message = error instanceof Error ? error.message : "PLC not connected";
        setPlcConnected(false);
        setPlcErrorMessage(message);
        setLiveActuals({});
        setCompletedIds([]);
        setProcessingId(null);
        setTotalInspected(0);
        setOkCount(0);
        setNgCount(0);
        setCycleTime(null);
        setActiveAlarms("");
        setComponentNo("-");
        setModelLabel("-");
      }
    };

    refreshAssemblyData();
    const id = setInterval(refreshAssemblyData, LIVE_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!diagramOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDiagramOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [diagramOpen]);

  const handleRun = useCallback((stId: number) => {
    if (processingId !== null) return;
    setProcessingId(stId);
    setTimeout(() => {
      const st = DISPLAY_STATIONS.find(s => s.id === stId)!;
      stopLive(stId);
      setCompletedIds(prev => {
        const next = [...prev, stId];
        getVisibleStations(next)
          .filter(a => !next.includes(a.id))
          .forEach(a => startLive(a.id));
        return next;
      });
      if (st.params.length > 0) {
        const params = st.id === 11 ? INSPECTION_PARAMS : st.params;
        setTotalInspected(t => t + 1);
        setLiveActuals(prev => {
          const a = prev[stId] || {};
          const allPass = params.every((p, i) => checkPass(p, a[i] ?? parseReq(p.required)));
          if (allPass) setOkCount(c => c + 1); else setNgCount(c => c + 1);
          return prev;
        });
      }
      setProcessingId(null);
    }, PROCESS_MS);
  }, [processingId, startLive, stopLive]);

  const isLoading = processingId !== null;
  const activeStations = getVisibleStations(completedIds);

  return (
    <div className="dashboard-shell assembly-dashboard" style={{ ...MONO, "--h-scale": heightScale, width: "100%", height: "100dvh", minHeight: 0, overflow: "hidden", background: C.bg, transition: "background 0.25s ease, color 0.25s ease", display: "flex", flexDirection: "column" } as CSSProperties}>
      <Header name="Assembly SCADA" role="Assembly" />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap');
        .assembly-dashboard {
          --h-scale: 1;
        }
        .assembly-dashboard * {
          box-sizing: border-box;
        }
        .dashboard-content{
          color:${C.text};
          display:flex;
          width:100%;
          flex:1 1 0;
          height:auto;
          min-height:0;
          overflow:hidden;
          background:
            linear-gradient(${C.borderSoft} 1px, transparent 1px),
            linear-gradient(90deg, ${C.borderSoft} 1px, transparent 1px),
            ${C.bg};
          background-size: 34px 34px;
        }
        .dashboard-left{
          width:55%;
          display:flex;
          flex-direction:column;
          background:${C.panel};
          border-right:1px solid ${C.border};
          min-width:0;
        }
        .dashboard-right{
          flex: 1 1 0;
          width: auto;
          min-width:0;
          min-height:0;
          height: 100%;
          display:flex;
          flex-direction:column;
          gap:clamp(4px, 0.45dvh, 7px);
          padding:clamp(4px, 0.45dvh, 7px);
          background:transparent;
          overflow:hidden;
        }
        .station-grid{
          flex:1 1 auto;
          width:100%;
          height:100%;
          min-width:0;
          min-height:0;
          overflow:hidden;
          display:grid;
          grid-template-columns:minmax(0,1fr);
          grid-template-rows:
            minmax(118px, 0.88fr)
            minmax(118px, 0.88fr)
            minmax(260px, 1.68fr);
          gap:clamp(4px, 0.45dvh, 7px);
          align-items:stretch;
        }
        .assembly-station-card{
          width:100%;
          height:100%;
          min-width:0;
          min-height:0;
          overflow:hidden;
          display:flex;
          flex-direction:column;
        }
        .metric-readout{
          width:100%;
          height:100%;
          min-width:0;
          min-height:0;
          overflow:hidden;
        }
        .assembly-left-summary{
          flex:0 0 clamp(204px, 24vh, 246px);
          min-height:0;
          padding:8px;
          border-top:1px solid ${C.border};
          background:${C.panel};
        }
        .assembly-left-summary .run-summary{
          height:100%;
          flex:1 1 auto;
        }
        .station-cell{
          min-height:0;
          min-width:0;
          display:flex;
        }
        .inspection-station-cell{
          grid-column:auto;
        }
        .inspection-grid{
          width:100% !important;
          height:100% !important;
          min-width:0 !important;
          min-height:0 !important;
          grid-template-columns:repeat(5,minmax(0,1fr)) !important;
          grid-template-rows:repeat(3,minmax(0,1fr)) !important;
          gap:clamp(4px, 0.4dvh, 6px) !important;
          padding:clamp(4px, 0.4dvh, 6px) !important;
          overflow:hidden !important;
        }
        .qr-tile{
          width:100%;
          height:100%;
          min-width:0;
          min-height:0;
          overflow:hidden;
        }
        .qr-tile svg{
          max-width:82%;
          max-height:82%;
        }
        @media (min-height:930px){
          .station-grid{
            grid-template-rows:
              minmax(128px, 0.86fr)
              minmax(128px, 0.86fr)
              minmax(300px, 1.9fr);
          }
        }
        @media (max-height:820px){
          .station-grid{
            grid-template-rows:
              minmax(105px, 0.82fr)
              minmax(105px, 0.82fr)
              minmax(230px, 1.55fr);
            gap:4px;
          }
          .dashboard-right{
            padding:4px;
            gap:4px;
          }
        }
        .run-summary{
          flex:0 0 clamp(204px, 24vh, 246px);
        }
        .run-summary-grid{
          grid-template-columns:repeat(3,minmax(0,1fr)) !important;
        }
        @media (max-width:1600px){
          .dashboard-left{width:46%}
          .dashboard-right{gap:5px;padding:5px}
          .inspection-grid{gap:5px !important;padding:5px !important}
          .assembly-left-summary{flex-basis:clamp(190px, 23vh, 230px);padding:6px}
          .run-summary{flex-basis:clamp(190px, 23vh, 230px)}
        }
        @media (max-width:1280px){
          .dashboard-left{width:44%}
          .dashboard-right{gap:5px;padding:5px}
          .assembly-left-summary{flex-basis:clamp(178px, 22vh, 214px);padding:5px}
          .run-summary{flex-basis:clamp(178px, 22vh, 214px)}
        }
        @media (max-width:980px){
          .inspection-grid{grid-template-columns:repeat(2,minmax(0,1fr)) !important;grid-template-rows:repeat(5,minmax(0,1fr)) !important}
          .inspection-grid .qr-tile{grid-column:1 / -1 !important;grid-row:auto !important}
          .assembly-left-summary{flex-basis:clamp(172px, 22vh, 208px)}
          .run-summary{flex-basis:clamp(172px, 22vh, 208px)}
        }
        @keyframes dash-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
        @keyframes dash-ring{0%,100%{box-shadow:0 0 0 0 rgba(255,98,0,.4)}50%{box-shadow:0 0 0 5px rgba(255,98,0,0)}}
        @keyframes badge-pop{0%{transform:scale(.6);opacity:0}100%{transform:scale(1);opacity:1}}
        @keyframes slide-up{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes dash-pulse{0%,100%{opacity:1}50%{opacity:.4}}
        .step-hover:hover{background:${C.accentSoft} !important}
        .run-btn:hover{background:#e55800 !important}
        .run-btn:active{transform:scale(.97)}
      `}</style>
      {diagramOpen && <AssemblyDiagramModal C={C} actuals={liveActuals[11] || {}} plcConnected={plcConnected} onClose={() => setDiagramOpen(false)} />}

      <div className="dashboard-content" style={{ display: "flex" }}>

        {/* â•â• LEFT â•â• */}
        <div className="dashboard-left">

          <div style={{
            height: "clamp(36px,4.6vh,52px)",
            display: "flex",
            alignItems: "center",
            padding: "0 10px",
            gap: 10,
            borderBottom: `1px solid ${C.border}`,
            background: C.surface,
            flexShrink: 0,
          }}>
            <div style={{
              ...MONO,
              flex: 1,
              minWidth: 0,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              fontSize: "clamp(9px,0.58vw,12px)",
              fontWeight: 800,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}>
              <div style={{ color: C.textMid }}>Component Assembly</div>
              <div style={{ display: "flex", gap: 4, minWidth: 0, whiteSpace: "nowrap" }}>
                <span style={{ color: C.textMid }}>Component No :</span>
                <span style={{ color: C.accent }}>{componentNo}</span>
              </div>
              <div style={{ display: "flex", gap: 4, minWidth: 0, whiteSpace: "nowrap" }}>
                <span style={{ color: C.textMid }}>Model No :</span>
                <span style={{ color: C.accent }}>{modelLabel}</span>
              </div>

            </div>
          </div>
          {/* Sequence 1-2 */}
          <SeqBar completedCount={completedIds.length} C={C} steps={[0, 1]} showTitle border="bottom" />


          {/* Shaft diagram */}
          <div style={{ flex: "1 1 0", minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, background: C.imageBg, overflow: "hidden" }}>
            <AssemblyDiagramCard C={C} actuals={liveActuals[11] || {}} plcConnected={plcConnected} onOpen={() => setDiagramOpen(true)} />
          </div>

          <div className="assembly-left-summary">
            <RunSummary totalInspected={totalInspected} okCount={okCount} ngCount={ngCount} isLoading={isLoading} cycleTime={cycleTime} activeAlarms={activeAlarms} plcConnected={plcConnected} plcErrorMessage={plcErrorMessage} C={C} />
          </div>
        </div>

        {/* â•â• RIGHT â•â• */}
        <div className="dashboard-right">

          {/* Station panels */}
          <div className="station-grid">
            {activeStations.length === 0 ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, background: C.panel, borderRadius: 8, border: `1px solid ${C.border}` }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke={C.disabled} strokeWidth={1.5} />
                  <polyline points="20 6 9 17 4 12" stroke={C.ok} strokeWidth={2.5} />
                </svg>
                <p style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>All stations complete</p>
              </div>
            ) : (
              activeStations.map(st => (
                <div key={st.id} className={`station-cell ${st.id === 11 ? "inspection-station-cell" : ""}`}>
                  <AssemblyStationPanel station={st} done={completedIds.includes(st.id)} loading={processingId === st.id} actuals={liveActuals[st.id] || {}} plcConnected={plcConnected} C={C} />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}





