const http = require("http");
const {
  ASSEMBLY_COUNT,
  ASSEMBLY_END,
  ASSEMBLY_START,
  FLOAT_FIELDS,
  MODEL_NUMBERS,
  STATION_RANGES,
  buildAssemblyArea,
  emptyArea,
  makeAssemblyConfig,
  writeWordsInChunks,
} = require("./assembly-layout");

const WRITE_UI_PORT = 5020;
const DEFAULT_WRITE_INTERVAL_MS = 3000;
const DEFAULT_ERROR_DELAY_MS = 10000;
const COMPONENT_NO_MAX_LENGTH = 30;

let nextComponentNo = BigInt(process.env.ASSEMBLY_COMPONENT_START || 3000001);
let lastManualValues = makeDefaultValues();

function envNumber(key, fallback) {
  return process.env[key] === undefined || process.env[key] === "" ? fallback : Number(process.env[key]);
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min, max, decimals = 3) {
  return Number((Math.random() * (max - min) + min).toFixed(decimals));
}

function rangeMidpoint(spec, decimals = 3) {
  return Number(((Number(spec.min) + Number(spec.max)) / 2).toFixed(decimals));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function makeDefaultValues() {
  const values = {
    shaftId: 1,
    operator: "OP-1001",
    modelNo: 6630865,
    componentNo: nextComponentNo.toString(),
    autoComponentNo: true,
    partsProcessed: 1,
    good: 1,
    scrap: 0,
    rework: 0,
    activeAlarms: "",
    qrGrade: "A",
    completedStatus: 0,
    floats: {},
  };

  FLOAT_FIELDS.forEach(([key, , , spec]) => {
    values.floats[key] = { ...spec, actual: rangeMidpoint(spec) };
  });
  return values;
}

function makeZeroValues() {
  const values = {
    shaftId: 0,
    operator: "",
    modelNo: 0,
    componentNo: "0",
    autoComponentNo: false,
    partsProcessed: 0,
    good: 0,
    scrap: 0,
    rework: 0,
    activeAlarms: "",
    qrGrade: "",
    completedStatus: 0,
    floats: {},
  };

  FLOAT_FIELDS.forEach(([key]) => {
    values.floats[key] = { min: 0, max: 0, actual: 0 };
  });
  return values;
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeComponentNo(value, fallback) {
  return String(value || fallback || "").replace(/[^\x20-\x7e]/g, "").slice(0, COMPONENT_NO_MAX_LENGTH);
}

function normalizeValues(input = {}) {
  const values = makeDefaultValues();
  const requestedComponentNo = normalizeComponentNo(input.componentNo, "");
  const autoComponentNo = nextComponentNo.toString();
  values.shaftId = toNumber(input.shaftId, values.shaftId);
  values.operator = String(input.operator || values.operator).slice(0, 20);
  values.modelNo = toNumber(input.modelNo, values.modelNo);
  values.autoComponentNo = input.autoComponentNo !== false && (!requestedComponentNo || requestedComponentNo === autoComponentNo);
  values.componentNo = values.autoComponentNo
    ? autoComponentNo
    : requestedComponentNo || values.componentNo;
  values.partsProcessed = toNumber(input.partsProcessed, values.partsProcessed);
  values.good = toNumber(input.good, values.good);
  values.scrap = toNumber(input.scrap, values.scrap);
  values.rework = toNumber(input.rework, values.rework);
  values.activeAlarms = String(input.activeAlarms || "").slice(0, 20);
  values.qrGrade = String(input.qrGrade || "").slice(0, 20);
  values.completedStatus = toNumber(input.completedStatus, values.completedStatus);

  FLOAT_FIELDS.forEach(([key, , , spec]) => {
    const defaultActual = rangeMidpoint(spec);
    values.floats[key] = {
      min: toNumber(input.floats?.[key]?.min, spec.min),
      max: toNumber(input.floats?.[key]?.max, spec.max),
      actual: toNumber(input.floats?.[key]?.actual, defaultActual),
    };
  });
  return values;
}

async function writeRange(config, values, rangeKey, verbose = false) {
  const range = STATION_RANGES[rangeKey];
  if (!range) throw new Error(`Unknown assembly write range ${rangeKey}`);
  const area = buildAssemblyArea(values);
  const offset = range.start - ASSEMBLY_START;
  const words = area.slice(offset, offset + range.count);
  await writeWordsInChunks(config, range.start, words, verbose
    ? (chunkStart, count) => console.log(`Writing ${config.device}${chunkStart}-${config.device}${chunkStart + count - 1}`)
    : undefined
  );
}

async function writeFull(config, values, verbose = false) {
  const area = buildAssemblyArea(values);
  await writeWordsInChunks(config, ASSEMBLY_START, area, verbose
    ? (chunkStart, count) => console.log(`Writing ${config.device}${chunkStart}-${config.device}${chunkStart + count - 1}`)
    : undefined
  );
}

async function resetAll(config, verbose = false) {
  await writeWordsInChunks(config, ASSEMBLY_START, emptyArea(), verbose
    ? (chunkStart, count) => console.log(`Resetting ${config.device}${chunkStart}-${config.device}${chunkStart + count - 1}`)
    : undefined
  );
}

function jsonResponse(response, statusCode, payload) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", chunk => chunks.push(chunk));
    request.on("end", () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("Invalid JSON request body"));
      }
    });
    request.on("error", reject);
  });
}

function renderUi(config) {
  const fieldJson = JSON.stringify({ floats: FLOAT_FIELDS, models: MODEL_NUMBERS, ranges: STATION_RANGES });
  const stateJson = JSON.stringify(lastManualValues);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Assembly PLC Write Panel</title>
  <style>
    * { box-sizing: border-box; }
    :root {
      --bg: #eef3f8;
      --panel: #ffffff;
      --panel-soft: #f7f9fc;
      --head: #172033;
      --line: #c9d4e2;
      --line-strong: #9fb0c4;
      --text: #102033;
      --muted: #64748b;
      --accent: #ff6200;
      --blue: #0f4c8a;
      --green: #12853c;
      --red: #b91c1c;
    }
    body { margin: 0; font-family: Arial, sans-serif; background: var(--bg); color: var(--text); }
    header { min-height: 68px; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 10px 18px; background: var(--head); color: #fff; border-bottom: 3px solid var(--accent); position: sticky; top: 0; z-index: 2; box-shadow: 0 8px 24px rgba(15, 23, 42, .16); }
    h1 { margin: 0; font-size: 18px; letter-spacing: .06em; text-transform: uppercase; }
    main { padding: 16px; display: grid; grid-template-columns: minmax(320px, 420px) minmax(0, 1fr); gap: 16px; align-items: start; }
    section { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; box-shadow: 0 8px 24px rgba(15, 23, 42, .07); }
    h2 { margin: 0; padding: 11px 14px; font-size: 13px; text-transform: uppercase; letter-spacing: .08em; background: #e6edf4; border-bottom: 1px solid var(--line); color: #172033; }
    .body { padding: 14px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
    label { display: grid; gap: 6px; min-width: 0; font-size: 12px; font-weight: 800; color: #34465c; text-transform: uppercase; letter-spacing: .03em; }
    input, select {
      width: 100%;
      min-width: 0;
      height: 42px;
      border: 1px solid var(--line-strong);
      border-radius: 6px;
      padding: 0 11px;
      background: #fff;
      color: #0f172a;
      font-size: 15px;
      font-weight: 800;
      outline: none;
      box-shadow: inset 0 1px 2px rgba(15, 23, 42, .06);
    }
    input:focus, select:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(255, 98, 0, .16); }
    input::placeholder { color: #94a3b8; }
    input[type="checkbox"] { width: 18px; height: 18px; padding: 0; box-shadow: none; accent-color: var(--green); }
    button { height: 42px; border: 0; border-radius: 7px; padding: 0 15px; font-size: 13px; font-weight: 900; text-transform: uppercase; letter-spacing: .03em; cursor: pointer; transition: transform .12s ease, filter .12s ease; }
    button:hover { filter: brightness(1.06); transform: translateY(-1px); }
    #submit { background: var(--green); color: #fff; min-width: 150px; }
    #randomize { background: #24364c; color: #fff; }
    #resetAll { background: var(--red); color: #fff; }
    .station-actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; }
    .station-actions button { background: var(--blue); color: #fff; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 2px; }
    .span2 { grid-column: 1 / -1; }
    .muted { color: #9fb0c4; font-size: 12px; font-weight: 700; margin-top: 4px; }
    #status { min-height: 34px; display: inline-flex; align-items: center; padding: 0 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel-soft); color: var(--muted); font-size: 12px; font-weight: 900; }
    .check-label { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel-soft); text-transform: none; letter-spacing: 0; }
    #floatFields { grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); }
    .float-row { display: grid; grid-template-columns: minmax(150px, 1.1fr) repeat(3, minmax(90px, 1fr)); gap: 10px; align-items: end; padding: 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel-soft); }
    .float-title { color: #172033; font-size: 13px; font-weight: 900; line-height: 1.25; }
    .float-row input { height: 38px; font-size: 14px; }
    @media (max-width: 900px) { main { grid-template-columns: 1fr; } header { align-items: flex-start; flex-direction: column; } #submit { width: 100%; } .float-row { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Assembly PLC Write Panel</h1>
      <div class="muted">HTTP :${WRITE_UI_PORT} -> PLC ${config.host}:${config.port} / ${config.device}${ASSEMBLY_START}-${config.device}${ASSEMBLY_END}</div>
    </div>
    <button id="submit" type="button">Write Common</button>
  </header>
  <main>
    <section>
      <h2>Common Area</h2>
      <div class="body grid">
        <label>Model No<select id="modelNo"></select></label>
        <label>Shaft ID<input id="shaftId" type="number" step="1" /></label>
        <label>Component No<input id="componentNo" maxlength="${COMPONENT_NO_MAX_LENGTH}" /></label>
        <label>Operator<input id="operator" maxlength="20" /></label>
        <label>Parts Processed<input id="partsProcessed" type="number" step="1" /></label>
        <label>Good<input id="good" type="number" step="1" /></label>
        <label>Scrap<input id="scrap" type="number" step="1" /></label>
        <label>Rework<input id="rework" type="number" step="1" /></label>
        <label>Completed Status<input id="completedStatus" type="number" step="1" min="0" max="5" /></label>
        <label>QR Grade<input id="qrGrade" maxlength="20" /></label>
        <label class="span2">Active Alarms<input id="activeAlarms" maxlength="20" /></label>
        <label class="span2 check-label"><span>Auto unique component number after common write</span><input id="autoComponentNo" type="checkbox" /></label>
        <div class="actions span2">
          <button id="randomize" type="button">Randomize Actuals</button>
          <button id="resetAll" type="button">Reset All 0</button>
          <span id="status">Ready</span>
        </div>
      </div>
    </section>
    <section>
      <h2>Station Wise Write</h2>
      <div class="body station-actions">
        <button type="button" data-write-range="7">Write Station 7</button>
        <button type="button" data-write-range="8">Write Station 8</button>
        <button type="button" data-write-range="9">Write Station 9</button>
        <button type="button" data-write-range="10">Reset Station 10</button>
        <button type="button" data-write-range="11">Write Station 11</button>
      </div>
    </section>
    <section class="span2">
      <h2>Float Parameters</h2>
      <div id="floatFields" class="body grid"></div>
    </section>
  </main>
  <script>
    const meta = ${fieldJson};
    let state = ${stateJson};
    const $ = (id) => document.getElementById(id);
    const status = $("status");
    function numberValue(id) { const value = Number($(id).value); return Number.isFinite(value) ? value : 0; }
    function fillForm() {
      $("modelNo").innerHTML = meta.models.map(model => '<option value="' + model + '">' + (model === 0 ? "0 - None" : model) + '</option>').join("");
      ["shaftId","operator","componentNo","partsProcessed","good","scrap","rework","activeAlarms","qrGrade","completedStatus"].forEach(id => { $(id).value = state[id]; });
      $("modelNo").value = state.modelNo;
      $("autoComponentNo").checked = state.autoComponentNo;
      $("floatFields").innerHTML = meta.floats.map(([key, label, address]) => {
        const value = state.floats[key];
        return '<div class="float-row"><div class="float-title">' + label + '<br><span class="muted">D' + address + '-D' + (address + 5) + '</span></div><label>Min<input data-float="' + key + '" data-part="min" type="number" step="0.001" value="' + value.min + '" /></label><label>Max<input data-float="' + key + '" data-part="max" type="number" step="0.001" value="' + value.max + '" /></label><label>Actual<input data-float="' + key + '" data-part="actual" type="number" step="0.001" value="' + value.actual + '" /></label></div>';
      }).join("");
    }
    function collectForm() {
      const floats = {};
      document.querySelectorAll("[data-float]").forEach(input => {
        floats[input.dataset.float] = floats[input.dataset.float] || {};
        floats[input.dataset.float][input.dataset.part] = Number(input.value);
      });
      return {
        shaftId: numberValue("shaftId"),
        operator: $("operator").value,
        modelNo: numberValue("modelNo"),
        componentNo: $("componentNo").value,
        autoComponentNo: $("autoComponentNo").checked,
        partsProcessed: numberValue("partsProcessed"),
        good: numberValue("good"),
        scrap: numberValue("scrap"),
        rework: numberValue("rework"),
        activeAlarms: $("activeAlarms").value,
        qrGrade: $("qrGrade").value,
        completedStatus: numberValue("completedStatus"),
        floats,
      };
    }
    function randomBetween(min, max) { return Number((Math.random() * (max - min) + min).toFixed(3)); }
    $("randomize").addEventListener("click", () => {
      document.querySelectorAll('[data-part="actual"]').forEach(input => {
        const key = input.dataset.float;
        const min = Number(document.querySelector('[data-float="' + key + '"][data-part="min"]').value);
        const max = Number(document.querySelector('[data-float="' + key + '"][data-part="max"]').value);
        input.value = randomBetween(min, max);
      });
    });
    $("componentNo").addEventListener("input", () => {
      $("autoComponentNo").checked = false;
    });
    async function postWrite(path, payload, label) {
      status.textContent = label + "...";
      try {
        const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload || {}) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Write failed");
        if (data.values) { state = data.values; fillForm(); }
        status.textContent = label + " OK at " + new Date(data.updatedAt).toLocaleTimeString();
      } catch (error) {
        status.textContent = error.message;
      }
    }
    $("submit").addEventListener("click", () => postWrite("/api/write-range/common", collectForm(), "Common write"));
    document.querySelectorAll("[data-write-range]").forEach(button => {
      button.addEventListener("click", () => postWrite("/api/write-range/" + button.dataset.writeRange, collectForm(), button.textContent));
    });
    $("resetAll").addEventListener("click", () => {
      if (!confirm("Reset all assembly registers D11000-D11600 to 0?")) return;
      postWrite("/api/reset", {}, "Reset all");
    });
    fillForm();
  </script>
</body>
</html>`;
}

async function handleRequest(request, response, config) {
  const url = new URL(request.url, `http://${request.headers.host || `localhost:${WRITE_UI_PORT}`}`);
  if (request.method === "GET" && url.pathname === "/") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.end(renderUi(config));
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/state") {
    jsonResponse(response, 200, { values: lastManualValues, updatedAt: new Date().toISOString() });
    return;
  }
  const rangeMatch = url.pathname.match(/^\/api\/write-range\/([^/]+)$/);
  if (request.method === "POST" && rangeMatch) {
    try {
      const values = normalizeValues(await readJsonBody(request));
      const rangeKey = rangeMatch[1];
      await writeRange(config, values, rangeKey, process.argv.includes("--verbose"));
      lastManualValues = values;
      if (values.autoComponentNo && rangeKey === "common") {
        nextComponentNo = BigInt(values.componentNo) + 1n;
        lastManualValues = { ...values, componentNo: nextComponentNo.toString() };
      }
      jsonResponse(response, 200, { ok: true, values: lastManualValues, updatedAt: new Date().toISOString() });
    } catch (error) {
      jsonResponse(response, 500, { ok: false, message: error.message, updatedAt: new Date().toISOString() });
    }
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/reset") {
    try {
      await resetAll(config, process.argv.includes("--verbose"));
      lastManualValues = makeZeroValues();
      jsonResponse(response, 200, { ok: true, values: lastManualValues, updatedAt: new Date().toISOString() });
    } catch (error) {
      jsonResponse(response, 500, { ok: false, message: error.message, updatedAt: new Date().toISOString() });
    }
    return;
  }
  jsonResponse(response, 404, { ok: false, message: "Not found" });
}

function startServer() {
  const config = makeAssemblyConfig({
    port: Number(process.env.PLC_ASSEMBLY_WRITE_PORT || process.env.PLC_ASSEMBLY_PORT || process.env.PLC_PORT || makeAssemblyConfig().port),
  });
  const server = http.createServer((request, response) => {
    handleRequest(request, response, config).catch(error => jsonResponse(response, 500, { ok: false, message: error.message }));
  });
  server.listen(WRITE_UI_PORT, () => {
    console.log(`Assembly PLC write UI: http://localhost:${WRITE_UI_PORT}`);
    console.log(`Writing to PLC ${config.host}:${config.port}, range ${config.device}${ASSEMBLY_START}-${config.device}${ASSEMBLY_END}`);
  });
}

function buildRandomValues() {
  const values = makeDefaultValues();
  const runningModels = MODEL_NUMBERS.filter(modelNo => modelNo !== 0);
  values.modelNo = runningModels[randInt(0, runningModels.length - 1)];
  values.componentNo = nextComponentNo.toString();
  values.partsProcessed = randInt(1, 300);
  values.scrap = randInt(0, 8);
  values.rework = randInt(0, 4);
  values.good = Math.max(0, values.partsProcessed - values.scrap - values.rework);
  FLOAT_FIELDS.forEach(([key]) => {
    const field = values.floats[key];
    field.actual = randFloat(field.min, field.max);
  });
  values.completedStatus = 4;
  values.qrGrade = "A";
  return values;
}

async function main() {
  const config = makeAssemblyConfig();
  const once = process.argv.includes("--once");
  const verbose = process.argv.includes("--verbose");
  const intervalMs = envNumber("ASSEMBLY_WRITE_INTERVAL_MS", DEFAULT_WRITE_INTERVAL_MS);
  const errorDelayMs = envNumber("PLC_ERROR_DELAY_MS", DEFAULT_ERROR_DELAY_MS);

  console.log(`Writing random assembly data to ${config.host}:${config.port}`);
  console.log(`Range ${config.device}${ASSEMBLY_START}-${config.device}${ASSEMBLY_END}, interval ${once ? "once" : `${intervalMs}ms`}`);

  let cycleNo = 1;
  while (true) {
    try {
      await writeFull(config, buildRandomValues(), verbose);
      console.log(`[${new Date().toISOString()}] Assembly cycle ${cycleNo}: write complete`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Assembly cycle ${cycleNo}: write failed: ${error.message}`);
      if (once) throw error;
      await sleep(errorDelayMs);
    }
    if (once) return;
    cycleNo += 1;
    await sleep(intervalMs);
  }
}

if (process.argv.includes("--random")) {
  main().catch(error => {
    console.error("Assembly PLC write failed:", error.message);
    process.exitCode = 1;
  });
} else {
  startServer();
}
