export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ASSEMBLY_BACKEND_URL = (process.env.ASSEMBLY_BACKEND_URL || "http://localhost:4010").replace(/\/+$/, "");
const USE_PLC_BACKEND = (process.env.ASSEMBLY_DATA_SOURCE || "mock").toLowerCase() === "plc";

const MODEL_NAMES: Record<string, string> = {
  "6630865": "Shaft-6630865",
  "6630867": "Shaft-6630867",
  "6630862": "Shaft-6630862",
};

function withReading(label: string, register: string, min: number, max: number, actual: number) {
  const pass = actual >= min && actual <= max;
  return { label, register, min, max, actual, pass, labelStatus: pass ? "OK" : "NG" };
}

function makeMockAssemblyPayload(modelNo = process.env.ASSEMBLY_MOCK_MODEL_NO || "6630862") {
  const normalizedModelNo = MODEL_NAMES[modelNo] ? modelNo : "6630862";
  const now = new Date();
  const seconds = now.getSeconds();
  const cycleActual = Number((28.4 + Math.sin(seconds / 12) * 1.2).toFixed(3));
  const componentNo = `ASM-${normalizedModelNo}-${String(1000 + seconds).padStart(4, "0")}`;

  const stations = {
    7: {
      plugLeftForce: withReading("Station 7 / Plug Left Force", "D11100-D11105", 3.45, 3.65, 3.55),
      plugLeftDepth: withReading("Station 7 / Plug Left Depth", "D11106-D11111", 16.05, 16.15, 16.1),
      plugRightForce: withReading("Station 7 / Plug Right Force", "D11112-D11117", 3.47, 3.67, 3.57),
      plugRightDepth: withReading("Station 7 / Plug Right Depth", "D11118-D11123", 16.05, 16.15, 16.1),
    },
    8: {
      ballLeftForce: withReading("Station 8 / Ball Left Force", "D11200-D11205", 4.11, 4.31, 4.21),
      ballLeftDepth: withReading("Station 8 / Ball Left Depth", "D11206-D11211", 15.63, 15.73, 15.68),
      ballRightForce: withReading("Station 8 / Ball Right Force", "D11212-D11217", 4.14, 4.34, 4.24),
      ballRightDepth: withReading("Station 8 / Ball Right Depth", "D11218-D11223", 15.6, 15.7, 15.65),
    },
    9: {
      dowelLeftForce: withReading("Station 9 / Dowel Left Force", "D11300-D11305", 2.75, 2.95, 2.85),
      dowelLeftDepth: withReading("Station 9 / Dowel Left Depth", "D11306-D11311", 4.25, 4.75, 4.5),
      dowelRightForce: withReading("Station 9 / Dowel Right Force", "D11312-D11317", 2.78, 2.98, 2.88),
      dowelRightDepth: withReading("Station 9 / Dowel Right Depth", "D11318-D11323", 22.9, 23.1, 23),
    },
    10: "Reserved",
    11: {
      leftDowelHeight: withReading("Station 11 / Left Dowel Height", "D11500-D11505", 4.25, 4.75, 4.5),
      rightDowelHeight: withReading("Station 11 / Right Dowel Height", "D11506-D11511", 4.25, 4.75, 4.5),
      dowelLength: withReading("Station 11 / Dowel Length", "D11512-D11517", 447.5, 448.5, 448),
      overallLength: withReading("Station 11 / Overall Length", "D11518-D11523", 465.9, 466.1, 466.05),
      leftOverallDiameter: withReading("Station 11 / Left Overall Diameter", "D11524-D11529", 34.95, 35.05, 35),
      rightOverallDiameter: withReading("Station 11 / Right Overall Diameter", "D11530-D11535", 34.95, 35.05, 35),
      leftMillingHeight: withReading("Station 11 / Left Milling Height", "D11536-D11541", 22.9, 23.1, 23),
      rightMillingHeight: withReading("Station 11 / Right Milling Height", "D11542-D11547", 22.9, 23.1, 23),
      plugLeftDepth: withReading("Station 11 / Plug Left Depth", "D11548-D11553", 16.05, 16.15, 16.1),
      plugRightDepth: withReading("Station 11 / Plug Right Depth", "D11554-D11559", 16.05, 16.15, 16.1),
      ballLeftDepth: withReading("Station 11 / Ball Left Depth", "D11560-D11565", 15.61, 15.71, 15.66),
      ballRightDepth: withReading("Station 11 / Ball Right Depth", "D11566-D11571", 15.61, 15.71, 15.66),
      dowelLeftDepth: withReading("Station 11 / Dowel Left Depth", "D11572-D11577", 4.25, 4.75, 4.5),
      dowelRightDepth: withReading("Station 11 / Dowel Right Depth", "D11578-D11583", 4.25, 4.75, 4.5),
      qrGrade: "A",
      completedStatus: 4,
    },
  };

  return {
    header: {
      shaftNumber: `SH-${normalizedModelNo}`,
      operatorId: "LOCAL-OP",
      componentNo,
      modelNumber: MODEL_NAMES[normalizedModelNo],
    },
    common: {
      shaftId: Number(normalizedModelNo.slice(-4)),
      operator: "LOCAL-OP",
      modelNo: Number(normalizedModelNo),
      componentNo,
      partsProcessed: 128,
      good: 124,
      scrap: 3,
      rework: 1,
      cycleTime: withReading("Common / Cycle Time", "D11020-D11025", 18, 42, cycleActual),
      activeAlarms: "",
    },
    componentNo,
    modelNo: normalizedModelNo,
    modelNumber: MODEL_NAMES[normalizedModelNo],
    actuals: {
      7: { 0: 3.55, 1: 16.1, 2: 3.57, 3: 16.1 },
      8: { 0: 4.21, 1: 15.68, 2: 4.24, 3: 15.65 },
      9: { 0: 2.85, 1: 4.5, 2: 2.88, 3: 23 },
      11: { 0: 4.5, 1: 4.5, 2: 448, 3: 466.05, 4: 35, 5: 35, 6: 23, 7: 23, 8: 16.1, 9: 16.1, 10: 15.66, 11: 15.66, 12: 4.5, 13: 4.5, 14: 1 },
    },
    stations,
    statusRegisters: { station11: { completedStatus: 4 } },
    registerMap: {
      common: {
        shaftId: "D11000",
        operator: "D11001-D11010",
        modelNo: "D11011",
        componentNo: "D11012-D11015",
        partsProcessed: "D11016",
        good: "D11017",
        scrap: "D11018",
        rework: "D11019",
        cycleTime: "D11020-D11025",
        activeAlarms: "D11030-D11039",
      },
      stations: {
        7: "D11100-D11199",
        8: "D11200-D11299",
        9: "D11300-D11399",
        10: "D11400-D11499",
        11: "D11500-D11600",
      },
    },
    summary: { total: 128, ok: 124, ng: 4, scrap: 3, rework: 1 },
    source: {
      backendUrl: "mock://assembly-local",
      connected: true,
      message: "Local mock assembly data",
      updatedAt: now.toISOString(),
    },
    plc: {
      connected: true,
      message: "Local mock assembly data",
      updatedAt: now.toISOString(),
      readStartRegister: "D11000",
      readEndRegister: "D11600",
    },
  };
}

export async function GET() {
  if (!USE_PLC_BACKEND) {
    return Response.json(makeMockAssemblyPayload());
  }

  try {
    const response = await fetch(`${ASSEMBLY_BACKEND_URL}/api/assembly/current`, { cache: "no-store" });
    const payload = await response.json();
    return Response.json(payload, { status: response.ok ? 200 : response.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Assembly backend unavailable";
    const updatedAt = new Date().toISOString();

    return Response.json({
      header: { shaftNumber: "-", operatorId: "-", componentNo: "-", modelNumber: "-" },
      common: {
        shaftId: 0,
        operator: "",
        modelNo: 0,
        componentNo: 0,
        partsProcessed: 0,
        good: 0,
        scrap: 0,
        rework: 0,
        activeAlarms: "",
      },
      componentNo: "-",
      modelNo: "0",
      modelNumber: "-",
      actuals: {},
      stations: {},
      statusRegisters: { station11: { completedStatus: 0 } },
      summary: { total: 0, ok: 0, ng: 0, scrap: 0, rework: 0 },
      source: { backendUrl: ASSEMBLY_BACKEND_URL, connected: false, message, updatedAt },
      plc: { connected: false, message, updatedAt },
    });
  }
}
