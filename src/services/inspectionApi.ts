import { useEffect, useState } from "react";

export type StationId = 1 | 2 | 3 | 4 | 5 | 6;

export type NumericReading = {
  value: number | null;
  low: number | null;
  high: number | null;
  pass: boolean | null;
};

export type BooleanReading = {
  value: boolean | null;
  pass: boolean | null;
  label?: string;
  grade?: string | null;
};

export type InspectionHeader = {
  shaftNumber: string;
  operatorName: string;
  componentNumber: string;
  modelNumber: string;
};

export type Station01Inspection = {
  shaftOdLeft: NumericReading;
  shaftOdRight: NumericReading;
  overallLength: NumericReading;
  dowelLengthLeft: NumericReading;
  dowelLengthRight: NumericReading;
  diameter122: NumericReading;
  vision2d: BooleanReading;
};

export type Station02Inspection = {
  holes15: BooleanReading[];
  holes3: BooleanReading[];
  fourMm51: BooleanReading;
  fourHolePositions: BooleanReading;
  slot12213: BooleanReading;
  special: BooleanReading[];
};

export type Station03Inspection = {
  qrFront: BooleanReading;
  qrBack: BooleanReading;
  gradeVerify: BooleanReading;
  topEngraving: BooleanReading;
};

export type Station05Inspection = {
  dowel498Left: NumericReading;
  dowel498Right: NumericReading;
};

export type Station06Inspection = {
  hole62Left: NumericReading;
  hole62Right: NumericReading;
  reamer1448Left: NumericReading;
  reamer1448Right: NumericReading;
};

export type InspectionSummary = {
  total: number;
  ok: number;
  ng: number;
};

export type InspectionSnapshot = {
  header: InspectionHeader;
  activeStationId: StationId | null;
  completedStationIds: StationId[];
  stations: {
    1: Station01Inspection;
    2: Station02Inspection;
    3: Station03Inspection;
    5: Station05Inspection;
    6: Station06Inspection;
  };
  summary: InspectionSummary;
  raw?: unknown;
};

export type InspectionConnectionState = "idle" | "polling" | "connected" | "error";

export type UseInspectionSnapshotResult = {
  snapshot: InspectionSnapshot;
  connectionState: InspectionConnectionState;
  error: string | null;
  lastUpdated: Date | null;
};

const DEFAULT_API_BASE_URL = "http://localhost:4000";
const DEFAULT_POLL_MS = 100;
const EMPTY_TEXT = "-";

const emptyNumericReading = (): NumericReading => ({
  value: null,
  low: null,
  high: null,
  pass: null,
});

const emptyBooleanReading = (label?: string): BooleanReading => ({
  value: null,
  pass: null,
  label,
  grade: null,
});

export const emptyInspectionSnapshot = (): InspectionSnapshot => ({
  header: {
    shaftNumber: EMPTY_TEXT,
    operatorName: EMPTY_TEXT,
    componentNumber: EMPTY_TEXT,
    modelNumber: EMPTY_TEXT,
  },
  activeStationId: null,
  completedStationIds: [],
  stations: {
    1: {
      shaftOdLeft: emptyNumericReading(),
      shaftOdRight: emptyNumericReading(),
      overallLength: emptyNumericReading(),
      dowelLengthLeft: emptyNumericReading(),
      dowelLengthRight: emptyNumericReading(),
      diameter122: emptyNumericReading(),
      vision2d: emptyBooleanReading("2D Presence"),
    },
    2: {
      holes15: makeBooleanArray(15, "Hole"),
      holes3: makeBooleanArray(3, "Bottom Hole"),
      fourMm51: emptyBooleanReading("4mm / 51deg"),
      fourHolePositions: emptyBooleanReading("4 Hole Positions"),
      slot12213: emptyBooleanReading("12.2-13 Slot"),
      special: [
        emptyBooleanReading("4mm / 51deg"),
        emptyBooleanReading("4 Hole Positions"),
        emptyBooleanReading("12.2-13 Slot"),
      ],
    },
    3: {
      qrFront: emptyBooleanReading("QR Front"),
      qrBack: emptyBooleanReading("QR Back"),
      gradeVerify: emptyBooleanReading("Grade Verify"),
      topEngraving: emptyBooleanReading("Top Engraving"),
    },
    5: {
      dowel498Left: emptyNumericReading(),
      dowel498Right: emptyNumericReading(),
    },
    6: {
      hole62Left: emptyNumericReading(),
      hole62Right: emptyNumericReading(),
      reamer1448Left: emptyNumericReading(),
      reamer1448Right: emptyNumericReading(),
    },
  },
  summary: { total: 0, ok: 0, ng: 0 },
});

export function useInspectionSnapshot(options?: {
  pollMs?: number;
  apiBaseUrl?: string;
  wsUrl?: string;
}): UseInspectionSnapshotResult {
  const [snapshot, setSnapshot] = useState<InspectionSnapshot>(() => emptyInspectionSnapshot());
  const [connectionState, setConnectionState] = useState<InspectionConnectionState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    const pollMs = options?.pollMs ?? DEFAULT_POLL_MS;
    const apiBaseUrl = options?.apiBaseUrl ?? getInspectionApiBaseUrl();
    const wsUrl = options?.wsUrl ?? getInspectionWsUrl();

    const applySnapshot = (payload: unknown) => {
      if (!mounted) return;
      setSnapshot(normalizeInspectionSnapshot(payload));
      setLastUpdated(new Date());
      setError(null);
    };

    const poll = async () => {
      try {
        setConnectionState(current => current === "connected" ? current : "polling");
        const next = await fetchInspectionSnapshot({ apiBaseUrl, signal: controller.signal });
        applySnapshot(next);
      } catch (err) {
        if (!mounted || controller.signal.aborted) return;
        setConnectionState("error");
        setError(errorMessage(err));
      }
    };

    poll();
    const intervalId = pollMs > 0 ? window.setInterval(poll, pollMs) : null;
    let socket: WebSocket | null = null;

    if (wsUrl) {
      socket = new WebSocket(wsUrl);
      socket.addEventListener("open", () => {
        if (!mounted) return;
        setConnectionState("connected");
        setError(null);
      });
      socket.addEventListener("message", event => {
        try {
          applySnapshot(JSON.parse(String(event.data)));
          setConnectionState("connected");
        } catch (err) {
          if (!mounted) return;
          setConnectionState("error");
          setError(errorMessage(err));
        }
      });
      socket.addEventListener("error", () => {
        if (!mounted) return;
        setConnectionState("error");
        setError("Inspection WebSocket connection failed");
      });
      socket.addEventListener("close", () => {
        if (!mounted) return;
        setConnectionState(current => current === "connected" ? "polling" : current);
      });
    }

    return () => {
      mounted = false;
      controller.abort();
      if (intervalId) window.clearInterval(intervalId);
      socket?.close();
    };
  }, [options?.apiBaseUrl, options?.pollMs, options?.wsUrl]);

  return { snapshot, connectionState, error, lastUpdated };
}

export async function fetchInspectionSnapshot(options?: {
  apiBaseUrl?: string;
  signal?: AbortSignal;
}): Promise<unknown> {
  const url = `${normalizeBaseUrl(options?.apiBaseUrl ?? getInspectionApiBaseUrl())}/api/inspection1/current`;
  const response = await fetch(url, {
    cache: "no-store",
    signal: options?.signal,
  });

  if (!response.ok) {
    throw new Error(`Inspection API ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

export function normalizeInspectionSnapshot(payload: unknown): InspectionSnapshot {
  const root = asRecord(payload);
  if (!root) return emptyInspectionSnapshot();

  const headerSource = firstRecord(root, ["header", "part", "component", "job"]) ?? root;
  const station01 = stationRecord(root, 1);
  const station02 = stationRecord(root, 2);
  const station03 = stationRecord(root, 3);
  const station05 = stationRecord(root, 5);
  const station06 = stationRecord(root, 6);
  const station02Special = booleanArray(station02, ["special", "specialChecks", "specials"], 3, "Special");

  const snapshot: InspectionSnapshot = {
    header: {
      shaftNumber: displayText(firstValue(headerSource, ["shaftNumber", "shaftNo", "shaft", "serialNumber"])),
      operatorName: displayText(firstValue(headerSource, ["operatorName", "operator", "userName", "user"])),
      componentNumber: displayText(firstValue(headerSource, ["componentNumber", "componentNo", "componentId", "component"])),
      modelNumber: displayText(firstValue(headerSource, ["modelNumber", "modelNo", "model", "partNumber"])),
    },
    activeStationId: parseStationId(firstValue(root, ["activeStationId", "activeStation", "currentStationId", "currentStation", "stationId", "stationNumber", "station"])),
    completedStationIds: normalizeCompletedStations(firstValue(root, ["completedStationIds", "completedStations", "completed", "doneStations"])),
    stations: {
      1: {
        shaftOdLeft: numberReading(station01, ["shaftOdLeft", "shaftODLeft", "outerDiameterLeft", "odLeft"]),
        shaftOdRight: numberReading(station01, ["shaftOdRight", "shaftODRight", "outerDiameterRight", "odRight"]),
        overallLength: numberReading(station01, ["overallLength", "overall", "oaLength"]),
        dowelLengthLeft: numberReading(station01, ["dowelLengthLeft", "dowelCfLeft", "lengthFromDowelLeft", "dowelLeft"]),
        dowelLengthRight: numberReading(station01, ["dowelLengthRight", "dowelCfRight", "dowelToDowel", "dowelRight"]),
        diameter122: numberReading(station01, ["diameter122", "diameter12_2", "dia122", "diameter12"]),
        vision2d: booleanReading(station01, ["vision2d", "twoDPresence", "presence2d", "vision"]),
      },
      2: {
        holes15: booleanArray(station02, ["holes15", "fifteenHoles", "frontHoles", "nozzleHoles"], 15, "Hole"),
        holes3: booleanArray(station02, ["holes3", "bottomHoles", "threeHoles"], 3, "Bottom Hole"),
        fourMm51: booleanReading(station02, ["fourMm51", "hole4mm51", "fourMmHole51", "fourMm"]),
        fourHolePositions: booleanReading(station02, ["fourHolePositions", "holePositions", "positions4"]),
        slot12213: booleanReading(station02, ["slot12213", "slot12_2_13", "slot"]),
        special: [
          preferBooleanReading(booleanReading(station02, ["fourMm51", "hole4mm51", "fourMmHole51", "fourMm"], "4mm / 51deg"), station02Special[0]),
          preferBooleanReading(booleanReading(station02, ["fourHolePositions", "holePositions", "positions4"], "4 Hole Positions"), station02Special[1]),
          preferBooleanReading(booleanReading(station02, ["slot12213", "slot12_2_13", "slot"], "12.2-13 Slot"), station02Special[2]),
        ],
      },
      3: {
        qrFront: booleanReading(station03, ["qrFront", "frontQr", "qr", "qrCode"], "QR Front"),
        qrBack: booleanReading(station03, ["qrBack", "backQr"], "QR Back"),
        gradeVerify: booleanReading(station03, ["gradeVerify", "grade", "verifier"], "Grade Verify"),
        topEngraving: booleanReading(station03, ["topEngraving", "topMarking", "laserMarking"], "Top Engraving"),
      },
      5: {
        dowel498Left: numberReading(station05, ["dowel498Left", "dowel4_98Left", "reamer498Left", "dowelHoleLeft", "dowel498", "dowel4_98", "reamer498", "dowelHole"]),
        dowel498Right: numberReading(station05, ["dowel498Right", "dowel4_98Right", "reamer498Right", "dowelHoleRight"]),
      },
      6: {
        hole62Left: numberReading(station06, ["hole62Left", "hole6_2Left", "hole63Left", "ballHoleLeft", "hole62", "hole6_2", "hole63", "ballHole"]),
        hole62Right: numberReading(station06, ["hole62Right", "hole6_2Right", "hole63Right", "ballHoleRight"]),
        reamer1448Left: numberReading(station06, ["reamer1448Left", "reamer14_48Left", "plugHoleLeft", "reamerHoleLeft", "reamer1448", "reamer14_48", "plugHole", "reamerHole"]),
        reamer1448Right: numberReading(station06, ["reamer1448Right", "reamer14_48Right", "plugHoleRight", "reamerHoleRight"]),
      },
    },
    summary: { total: 0, ok: 0, ng: 0 },
    raw: payload,
  };

  snapshot.summary = normalizeSummary(root, snapshot);
  return snapshot;
}

function makeBooleanArray(count: number, label: string): BooleanReading[] {
  return Array.from({ length: count }, (_, index) => emptyBooleanReading(`${label} ${index + 1}`));
}

function getInspectionApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_INSPECTION_API_URL || DEFAULT_API_BASE_URL;
}

function getInspectionWsUrl(): string {
  return process.env.NEXT_PUBLIC_INSPECTION_WS_URL || "";
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function firstRecord(source: Record<string, unknown>, keys: string[]): Record<string, unknown> | null {
  for (const key of keys) {
    const record = asRecord(source[key]);
    if (record) return record;
  }
  return null;
}

function firstValue(source: Record<string, unknown> | null, keys: string[]): unknown {
  if (!source) return undefined;
  for (const key of keys) {
    if (key in source) return source[key];
  }
  return undefined;
}

function firstPresentKey(source: Record<string, unknown> | null, keys: string[]): string | null {
  if (!source) return null;
  return keys.find(key => key in source) ?? null;
}

function limitKeys(key: string | null, suffixes: string[]): string[] {
  return key ? suffixes.map(suffix => `${key}${suffix}`) : [];
}

function displayText(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number") return String(value);
  return EMPTY_TEXT;
}

function stationRecord(root: Record<string, unknown>, stationId: StationId): Record<string, unknown> | null {
  const stations = firstRecord(root, ["stations", "stationData", "inspectionStations"]);
  const pad = String(stationId).padStart(2, "0");
  const keys = [
    String(stationId),
    pad,
    `ST-${pad}`,
    `ST${pad}`,
    `station${stationId}`,
    `station${pad}`,
    `station_${stationId}`,
    `station_${pad}`,
    `st${stationId}`,
    `st${pad}`,
  ];

  if (stations) {
    const match = firstRecord(stations, keys);
    if (match) return match;
  }

  const directMatch = firstRecord(root, keys);
  if (directMatch) return directMatch;

  const activeStationId = parseStationId(firstValue(root, ["activeStationId", "activeStation", "currentStationId", "currentStation", "stationId", "stationNumber", "station"]));
  if (activeStationId === stationId) {
    const currentPayload = firstRecord(root, ["data", "payload", "measurements", "parameters", "values", "inspection"]);
    return currentPayload ?? stations ?? root;
  }

  return null;
}

function parseStationId(value: unknown): StationId | null {
  if (typeof value === "number") return isStationId(value) ? value : null;
  if (typeof value !== "string") return null;
  const match = value.match(/\d+/);
  if (!match) return null;
  const id = Number(match[0]);
  return isStationId(id) ? id : null;
}

function isStationId(value: number): value is StationId {
  return Number.isInteger(value) && value >= 1 && value <= 6;
}

function normalizeCompletedStations(value: unknown): StationId[] {
  const values = Array.isArray(value) ? value : [];
  const ids = values
    .map(parseStationId)
    .filter((id): id is StationId => id !== null);
  return Array.from(new Set(ids));
}

function numberReading(source: Record<string, unknown> | null, keys: string[]): NumericReading {
  const key = firstPresentKey(source, keys);
  const raw = key && source ? source[key] : undefined;
  const record = asRecord(raw);
  const value = record
    ? numberValue(firstValue(record, ["value", "actual", "measurement", "reading", "result"]))
    : numberValue(raw);
  const low = record
    ? numberValue(firstValue(record, ["low", "min", "lcl", "lsl", "lowerLimit"]))
    : numberValue(firstValue(source, limitKeys(key, ["Low", "Min", "Lcl", "Lsl", "LowerLimit", "low", "min", "lcl", "lsl", "lowerLimit"])));
  const high = record
    ? numberValue(firstValue(record, ["high", "max", "ucl", "usl", "upperLimit"]))
    : numberValue(firstValue(source, limitKeys(key, ["High", "Max", "Ucl", "Usl", "UpperLimit", "high", "max", "ucl", "usl", "upperLimit"])));
  const explicitPass = record ? booleanValue(firstValue(record, ["pass", "ok", "passed", "status"])) : null;
  const pass = explicitPass ?? passFromLimits(value, low, high);
  return { value, low, high, pass };
}

function booleanReading(source: Record<string, unknown> | null, keys: string[], fallbackLabel?: string): BooleanReading {
  const raw = firstValue(source, keys);
  const record = asRecord(raw);
  const pass = record
    ? booleanValue(firstValue(record, ["pass", "ok", "passed", "value", "result", "status"]))
    : booleanValue(raw);
  const grade = record
    ? textValue(firstValue(record, ["grade", "qrGrade", "valueText", "text"]))
    : pass === null ? textValue(raw) : null;
  const label = record ? textValue(firstValue(record, ["label", "name"])) ?? fallbackLabel : fallbackLabel;
  return {
    value: pass ?? (grade ? true : null),
    pass: pass ?? (grade ? true : null),
    label,
    grade,
  };
}

function preferBooleanReading(primary: BooleanReading, fallback: BooleanReading): BooleanReading {
  return primary.pass !== null || primary.grade ? primary : fallback;
}

function booleanArray(
  source: Record<string, unknown> | null,
  keys: string[],
  count: number,
  label: string,
): BooleanReading[] {
  const raw = firstValue(source, keys);
  const record = asRecord(raw);
  const sourceArray = Array.isArray(raw) ? raw : null;

  return Array.from({ length: count }, (_, index) => {
    const keyed = record ? firstValue(record, [String(index + 1), String(index), `hole${index + 1}`]) : undefined;
    const item = sourceArray ? sourceArray[index] : keyed;
    const normalized = booleanReading(asRecord({ item }), ["item"], `${label} ${index + 1}`);
    return {
      ...normalized,
      label: normalized.label ?? `${label} ${index + 1}`,
    };
  });
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function textValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function booleanValue(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "ok", "pass", "passed", "yes", "y"].includes(normalized)) return true;
  if (["0", "false", "ng", "fail", "failed", "no", "n"].includes(normalized)) return false;
  return null;
}

function passFromLimits(value: number | null, low: number | null, high: number | null): boolean | null {
  if (value === null) return null;
  if (low !== null && value < low) return false;
  if (high !== null && value > high) return false;
  if (low !== null || high !== null) return true;
  return null;
}

function normalizeSummary(root: Record<string, unknown>, snapshot: InspectionSnapshot): InspectionSummary {
  const summary = firstRecord(root, ["summary", "totals", "inspectionSummary"]);
  const total = numberValue(firstValue(summary, ["total", "totalCount"]));
  const ok = numberValue(firstValue(summary, ["ok", "okCount", "pass", "passCount"]));
  const ng = numberValue(firstValue(summary, ["ng", "ngCount", "fail", "failCount"]));

  if (total !== null || ok !== null || ng !== null) {
    return {
      total: total ?? (ok ?? 0) + (ng ?? 0),
      ok: ok ?? 0,
      ng: ng ?? 0,
    };
  }

  const readings: Array<NumericReading | BooleanReading> = [
    ...Object.values(snapshot.stations[1]),
    ...snapshot.stations[2].holes15,
    ...snapshot.stations[2].holes3,
    ...snapshot.stations[2].special,
    ...Object.values(snapshot.stations[3]),
    ...Object.values(snapshot.stations[5]),
    ...Object.values(snapshot.stations[6]),
  ];
  const completed = readings.filter(reading => reading.pass !== null);
  const okCount = completed.filter(reading => reading.pass === true).length;
  const ngCount = completed.filter(reading => reading.pass === false).length;

  return {
    total: completed.length,
    ok: okCount,
    ng: ngCount,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Inspection API request failed";
}
