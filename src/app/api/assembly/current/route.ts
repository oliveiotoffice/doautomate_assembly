export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ASSEMBLY_BACKEND_URL = "http://localhost:5019";

function makeDisconnectedPayload(message: string) {
  return {
    header: { shaftNumber: "", operatorId: "", componentNo: "", modelNumber: "" },
    common: {
      shaftId: "",
      operator: "",
      modelNo: "",
      componentNo: "",
      partsProcessed: null,
      good: null,
      scrap: null,
      rework: null,
      activeAlarms: "",
    },
    componentNo: "",
    modelNo: "",
    modelNumber: "",
    actuals: {},
    stations: {},
    statusRegisters: {},
    summary: { total: null, ok: null, ng: null, scrap: null, rework: null },
    source: { backendUrl: ASSEMBLY_BACKEND_URL, connected: false, message, updatedAt: "" },
    plc: { connected: false, message, updatedAt: "" },
  };
}

export async function GET() {
  try {
    const response = await fetch(`${ASSEMBLY_BACKEND_URL}/api/assembly/current`, { cache: "no-store" });
    const payload = await response.json();

    return Response.json(payload, {
      status: response.ok ? 200 : response.status,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Assembly backend unavailable";

    return Response.json(makeDisconnectedPayload(message), {
      status: 200,
      headers: { "cache-control": "no-store" },
    });
  }
}
