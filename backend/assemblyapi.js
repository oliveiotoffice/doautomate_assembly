const http = require("http");
const {
  ASSEMBLY_COUNT,
  ASSEMBLY_END,
  ASSEMBLY_START,
  MODEL_NAMES,
  decodeAssembly,
  makeAssemblyConfig,
  readWordsInChunks,
} = require("./assembly-layout");

const PORT = Number(process.env.ASSEMBLY_BACKEND_PORT || 5015);
const POLL_MS = Number(process.env.ASSEMBLY_POLL_MS || process.env.PLC_POLL_MS || 1000);
const ERROR_DELAY_MS = Number(process.env.PLC_ERROR_DELAY_MS || 10000);
const READ_CHUNK_SIZE = Number(process.env.ASSEMBLY_READ_CHUNK_SIZE || process.env.PLC_READ_CHUNK_SIZE || 50);
const READ_CHUNK_DELAY_MS = Number(process.env.ASSEMBLY_READ_CHUNK_DELAY_MS || process.env.PLC_READ_CHUNK_DELAY_MS || 20);
const READ_TIMEOUT_MS = Number(process.env.ASSEMBLY_READ_TIMEOUT_MS || process.env.PLC_READ_TIMEOUT_MS || 2500);

let cache = makeDisconnectedPayload("Assembly PLC polling not started");
let polling = false;

function makeReadConfig() {
  return makeAssemblyConfig({
    chunkSize: READ_CHUNK_SIZE,
    chunkDelayMs: READ_CHUNK_DELAY_MS,
    timeoutMs: READ_TIMEOUT_MS,
  });
}

function numberActual(reading) {
  return reading && typeof reading.actual === "number" ? reading.actual : null;
}

function makePayload(words, config) {
  const decoded = decodeAssembly(words);
  const modelNo = String(decoded.common.modelNo ?? 0);
  const modelNumber = decoded.common.modelNo === 0 ? "-" : MODEL_NAMES[decoded.common.modelNo] || `Shaft-${modelNo}`;
  const componentNo = decoded.common.componentNo ? String(decoded.common.componentNo) : "-";

  return {
    header: {
      shaftNumber: String(decoded.common.shaftId || "-"),
      operatorId: decoded.common.operator || "-",
      componentNo,
      modelNumber,
      
    },
    common: decoded.common,
    componentNo,
    modelNo,
    modelNumber,
    actuals: {
      7: {
        0: numberActual(decoded.stations[7].plugLeftForce),
        1: numberActual(decoded.stations[7].plugLeftDepth),
        2: numberActual(decoded.stations[7].plugRightForce),
        3: numberActual(decoded.stations[7].plugRightDepth),
      },
      8: {
        0: numberActual(decoded.stations[8].ballLeftForce),
        1: numberActual(decoded.stations[8].ballLeftDepth),
        2: numberActual(decoded.stations[8].ballRightForce),
        3: numberActual(decoded.stations[8].ballRightDepth),
      },
      9: {
        0: numberActual(decoded.stations[9].dowelLeftForce),
        1: numberActual(decoded.stations[9].dowelLeftDepth),
        2: numberActual(decoded.stations[9].dowelRightForce),
        3: numberActual(decoded.stations[9].dowelRightDepth),
      },
      11: Object.fromEntries(Object.values(decoded.stations[11]).filter(item => item && typeof item === "object" && "actual" in item).map((item, index) => [index, item.actual])),
    },
    stations: decoded.stations,
    statusRegisters: {
      station11: {
        completedStatus: decoded.stations[11].completedStatus,
      },
    },
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
    summary: {
      total: decoded.common.partsProcessed || 0,
      ok: decoded.common.good || 0,
      ng: (decoded.common.scrap || 0) + (decoded.common.rework || 0),
      scrap: decoded.common.scrap || 0,
      rework: decoded.common.rework || 0,
    },
    source: {
      backendUrl: `mc://${config.host}:${config.port}`,
      connected: true,
      updatedAt: new Date().toISOString(),
    },
    plc: {
      host: config.host,
      port: config.port,
      connected: true,
      updatedAt: new Date().toISOString(),
      readStartRegister: `D${ASSEMBLY_START}`,
      readEndRegister: `D${ASSEMBLY_END}`,
    },
    raw: {
      decoded,
    },
  };
}

function makeDisconnectedPayload(message) {
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
    source: { backendUrl: "mc://unavailable", connected: false, message, updatedAt },
    plc: {
      connected: false,
      message,
      updatedAt,
      readStartRegister: `D${ASSEMBLY_START}`,
      readEndRegister: `D${ASSEMBLY_END}`,
    },
  };
}

async function pollPlc() {
  if (polling) return;
  polling = true;
  try {
    const config = makeReadConfig();
    const words = await readWordsInChunks(config, ASSEMBLY_START, ASSEMBLY_COUNT);
    cache = makePayload(words, config);
    console.log(`[${new Date().toISOString()}] Assembly read ok model=${cache.modelNo || "-"} total=${cache.summary.total} ok=${cache.summary.ok} ng=${cache.summary.ng}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    cache = makeDisconnectedPayload(message);
    console.error(`[${new Date().toISOString()}] Assembly read failed: ${message}`);
  } finally {
    polling = false;
  }
}

function schedulePoll(delayMs) {
  setTimeout(async () => {
    const wasConnected = cache.source.connected;
    await pollPlc();
    schedulePoll(cache.source.connected || wasConnected ? POLL_MS : ERROR_DELAY_MS);
  }, delayMs);
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (url.pathname === "/api/assembly/current") {
    response.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    });
    response.end(JSON.stringify(cache));
    return;
  }

  if (url.pathname === "/health") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: true, source: cache.source, plc: cache.plc }));
    return;
  }

  response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`Assembly API listening on http://localhost:${PORT}`);
  console.log(`Reading assembly PLC layout D${ASSEMBLY_START}-D${ASSEMBLY_END} every ${POLL_MS}ms`);
  console.log(`Assembly read chunk size ${READ_CHUNK_SIZE}, chunk delay ${READ_CHUNK_DELAY_MS}ms, timeout ${READ_TIMEOUT_MS}ms`);
  pollPlc().finally(() => schedulePoll(POLL_MS));
});
