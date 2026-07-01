export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ASSEMBLY_BACKEND_URL = "http://localhost:5019";

function makeDisconnectedPayload(message: string) {
  const updatedAt = new Date().toISOString();

  return {
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
