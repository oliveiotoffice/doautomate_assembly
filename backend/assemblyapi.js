const http = require("http");
const fs = require("fs");
const path = require("path");
const {
  ASSEMBLY_COUNT,
  ASSEMBLY_END,
  ASSEMBLY_START,
  MODEL_NAMES,
  decodeAssembly,
  makeAssemblyConfig,
  readWordsInChunks,
} = require("./assembly-layout");

const PORT = 5019;
const POLL_MS = Number(process.env.ASSEMBLY_POLL_MS || process.env.PLC_POLL_MS || 100);
const ERROR_DELAY_MS = Number(process.env.PLC_ERROR_DELAY_MS || 10000);
const READ_CHUNK_SIZE = Number(process.env.ASSEMBLY_READ_CHUNK_SIZE || process.env.PLC_READ_CHUNK_SIZE || 50);
const READ_CHUNK_DELAY_MS = Number(process.env.ASSEMBLY_READ_CHUNK_DELAY_MS || process.env.PLC_READ_CHUNK_DELAY_MS || 20);
const READ_TIMEOUT_MS = Number(process.env.ASSEMBLY_READ_TIMEOUT_MS || process.env.PLC_READ_TIMEOUT_MS || 2500);
const CSV_PATH = process.env.ASSEMBLY_CSV_PATH || path.join(__dirname, "data", "assembly-history.csv");
const CSV_TEMP_PATH = `${CSV_PATH}.tmp`;

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

function numberRange(reading) {
  return reading && typeof reading.min === "number" && typeof reading.max === "number"
    ? { min: reading.min, max: reading.max }
    : null;
}

function flattenCsvFields(prefix, value, output) {
  if (value === null || value === undefined) {
    output[prefix] = "";
    return;
  }
  if (Array.isArray(value)) {
    output[prefix] = JSON.stringify(value);
    return;
  }
  if (typeof value === "object") {
    Object.keys(value).forEach(key => flattenCsvFields(prefix ? `${prefix}.${key}` : key, value[key], output));
    return;
  }
  output[prefix] = value;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      values.push(value);
      value = "";
    } else {
      value += char;
    }
  }

  values.push(value);
  return values;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(line => line.length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map(line => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
  return { headers, rows };
}

function makeCsvRow(payload, readTime) {
  const row = {
    componentNo: payload.componentNo,
    rtcTime: readTime,
    modelNo: payload.modelNo,
    modelNumber: payload.modelNumber,
    shaftId: payload.common.shaftId,
    operator: payload.common.operator,
    partsProcessed: payload.common.partsProcessed,
    good: payload.common.good,
    scrap: payload.common.scrap,
    rework: payload.common.rework,
    activeAlarms: payload.common.activeAlarms,
  };

  flattenCsvFields("common.cycleTime", payload.common.cycleTime, row);
  flattenCsvFields("station7", payload.stations[7], row);
  flattenCsvFields("station8", payload.stations[8], row);
  flattenCsvFields("station9", payload.stations[9], row);
  flattenCsvFields("station10", payload.stations[10], row);
  flattenCsvFields("station11", payload.stations[11], row);
  return row;
}

function writeCsv(headers, rows) {
  fs.mkdirSync(path.dirname(CSV_PATH), { recursive: true });
  if (fs.existsSync(CSV_TEMP_PATH)) fs.rmSync(CSV_TEMP_PATH, { force: true });
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map(row => headers.map(header => csvEscape(row[header])).join(",")),
  ];
  fs.writeFileSync(CSV_TEMP_PATH, `${lines.join("\n")}\n`, "utf8");
  fs.renameSync(CSV_TEMP_PATH, CSV_PATH);
}

function upsertAssemblyCsv(payload, readTime) {
  const componentNo = String(payload.componentNo ?? "").trim();
  if (!componentNo) return;

  const row = makeCsvRow(payload, readTime);
  let headers = [];
  let rows = [];

  if (fs.existsSync(CSV_PATH)) {
    ({ headers, rows } = parseCsv(fs.readFileSync(CSV_PATH, "utf8")));
  }

  const rowHeaders = Object.keys(row);
  headers = [...headers, ...rowHeaders.filter(header => !headers.includes(header))];

  const existingIndex = rows.findIndex(existing => existing.componentNo === componentNo);
  if (existingIndex >= 0) {
    rows[existingIndex] = { ...rows[existingIndex], ...row };
  } else {
    rows.push(row);
  }

  writeCsv(headers, rows);
}

function makePayload(words, config) {
  const decoded = decodeAssembly(words);
  const plcTime = "";
  const modelNo = decoded.common.modelNo === null || decoded.common.modelNo === undefined ? "" : String(decoded.common.modelNo);
  const modelNumber = decoded.common.modelNo === null || decoded.common.modelNo === undefined ? "" : String(decoded.common.modelNo);
  const componentNo = String(decoded.common.componentNo ?? "");

  return {
    header: {
      shaftNumber: decoded.common.shaftId === null || decoded.common.shaftId === undefined ? "" : String(decoded.common.shaftId),
      operatorId: decoded.common.operator || "",
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
    ranges: {
      7: {
        0: numberRange(decoded.stations[7].plugLeftForce),
        1: numberRange(decoded.stations[7].plugLeftDepth),
        2: numberRange(decoded.stations[7].plugRightForce),
        3: numberRange(decoded.stations[7].plugRightDepth),
      },
      8: {
        0: numberRange(decoded.stations[8].ballLeftForce),
        1: numberRange(decoded.stations[8].ballLeftDepth),
        2: numberRange(decoded.stations[8].ballRightForce),
        3: numberRange(decoded.stations[8].ballRightDepth),
      },
      9: {
        0: numberRange(decoded.stations[9].dowelLeftForce),
        1: numberRange(decoded.stations[9].dowelLeftDepth),
        2: numberRange(decoded.stations[9].dowelRightForce),
        3: numberRange(decoded.stations[9].dowelRightDepth),
      },
      11: Object.fromEntries(Object.values(decoded.stations[11]).filter(item => item && typeof item === "object" && "actual" in item).map((item, index) => [index, numberRange(item)])),
    },
    stations: decoded.stations,
    statusRegisters: {
      station11: {
        completedStatus: decoded.stations[11].completedStatus,
        qrGrade: decoded.stations[11].qrGrade || "",
      },
    },
    registerMap: {
      common: {
        shaftId: "D11000",
        operator: "D11001-D11010",
        modelNo: "D11011",
        componentNo: "D11040-D11054",
        componentNoNumeric: "D11012-D11015",
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
      total: decoded.common.partsProcessed,
      ok: decoded.common.good,
      ng: decoded.common.scrap + decoded.common.rework,
      scrap: decoded.common.scrap,
      rework: decoded.common.rework,
    },
    source: {
      backendUrl: `mc://${config.host}:${config.port}`,
      connected: true,
      updatedAt: plcTime,
    },
    plc: {
      host: config.host,
      port: config.port,
      connected: true,
      updatedAt: plcTime,
      readStartRegister: `D${ASSEMBLY_START}`,
      readEndRegister: `D${ASSEMBLY_END}`,
    },
    raw: {
      decoded,
    },
  };
}

function makeDisconnectedPayload(message) {
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
    ranges: {},
    stations: {},
    statusRegisters: {},
    summary: { total: null, ok: null, ng: null, scrap: null, rework: null },
    source: { backendUrl: "", connected: false, message, updatedAt: "" },
    plc: {
      connected: false,
      message,
      updatedAt: "",
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
    try {
      upsertAssemblyCsv(cache, cache.plc.updatedAt);
    } catch (csvError) {
      const csvMessage = csvError instanceof Error ? csvError.message : String(csvError);
      console.error(`[${new Date().toISOString()}] Assembly CSV write failed: ${csvMessage}`);
    }
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
