const {
  AREA_START,
  STATION_OFFSETS,
  getWords,
  makeConfig,
  readWordsInChunks,
  wordsToDateTime,
  wordsToFloat,
  wordsToString,
  wordsToUInt32,
  wordsToUInt64,
} = require("./plc-layout");

const MODEL_END = 10699;
const READ_COUNT = MODEL_END - AREA_START + 1;
const DEFAULT_READ_INTERVAL_MS = 1000;
const DEFAULT_ERROR_DELAY_MS = 10000;
const STATION2_LABELS = [
  "3 mm Hole 1",
  "3 mm Hole 2",
  "3 mm Hole 3",
  "3 mm Hole 4",
  "3 mm Hole 5",
  "3 mm Hole 6",
  "3 mm Hole 7",
  "3 mm Hole 8",
  "3 mm Hole 9",
  "3 mm Hole 10",
  "3 mm Hole 11",
  "3 mm Hole 12",
  "3 mm Hole 13",
  "3 mm Hole 14",
  "3 mm Hole 15",
  "3 mm Hole A",
  "3 mm Hole B",
  "3 mm Hole C",
  "Special 4 mm/51",
  "12.2-13",
  "Slot",
];

function stationBase(stationNo) {
  return AREA_START + STATION_OFFSETS[stationNo];
}

function envNumber(key, fallback) {
  return process.env[key] === undefined || process.env[key] === "" ? fallback : Number(process.env[key]);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function boolLabel(value) {
  if (value === 0) return "NONE";
  if (value === 1) return "READY";
  if (value === 2) return "LOADING";
  if (value === 3 || value === 5) return "NG";
  if (value === 4) return "OK";
  return String(value);
}

function readBool(area, address) {
  return getWords(area, address, 1)[0] || 0;
}

function readFloatValue(area, address) {
  const words = getWords(area, address, 2);
  return wordsToFloat(words[0], words[1]);
}

function readFloatParameter(area, address) {
  const min = readFloatValue(area, address);
  const max = readFloatValue(area, address + 2);
  const actual = readFloatValue(area, address + 4);
  const pass = actual >= min && actual <= max;

  return {
    min,
    max,
    actual,
    pass,
    label: pass ? "OK" : "NG",
  };
}

function decodeCommon(area) {
  const rtc = wordsToDateTime(getWords(area, 10020, 10));

  return {
    shift: getWords(area, 10000, 1)[0],
    operator: wordsToString(getWords(area, 10001, 10)),
    modelNo: wordsToUInt32(...getWords(area, 10011, 2)),
    componentNo: wordsToUInt64(getWords(area, 10013, 4)),
    rtc,
    total: getWords(area, 10030, 1)[0],
    ok: getWords(area, 10031, 1)[0],
    notOk: getWords(area, 10032, 1)[0],
  };
}

function decodeStation1(area, base) {
  return {
    outerDiameterLeft: readFloatParameter(area, base + 0),
    outerDiameterRight: readFloatParameter(area, base + 6),
    overallLength: readFloatParameter(area, base + 12),
    dowelLength: readFloatParameter(area, base + 18),
    apg122Diameter: readFloatParameter(area, base + 24),
    presence3d: boolLabel(readBool(area, base + 30)),
    gaugeDowelToDowel: readFloatParameter(area, base + 31),
  };
}

function decodeStation2(area, base) {
  return Object.fromEntries(
    STATION2_LABELS.map((label, offset) => [label, boolLabel(readBool(area, base + offset))])
  );
}

function decodeStation3(area, base) {
  return {
    marking2d: boolLabel(readBool(area, base + 0)),
    topEngraving: boolLabel(readBool(area, base + 1)),
    sideEngraving: boolLabel(readBool(area, base + 2)),
    qrVerifierValue: wordsToString(getWords(area, base + 10, 10)),
  };
}

function decodeStation5(area, base) {
  return {
    plugLeft: readFloatParameter(area, base + 0),
    plugRight: readFloatParameter(area, base + 6),
  };
}

function decodeStation6(area, base) {
  return {
    dowelLeft: readFloatParameter(area, base + 0),
    dowelRight: readFloatParameter(area, base + 6),
    ballLeft: readFloatParameter(area, base + 12),
    ballRight: readFloatParameter(area, base + 18),
  };
}

function decodeUniversalInspection(area) {
  return {
    stations: {
      1: decodeStation1(area, stationBase(1)),
      2: decodeStation2(area, stationBase(2)),
      3: decodeStation3(area, stationBase(3)),
      4: "Reserved",
      5: decodeStation5(area, stationBase(5)),
      6: decodeStation6(area, stationBase(6)),
    },
  };
}

async function readOnce(config, cycleNo) {
  const area = await readWordsInChunks(config, AREA_START, READ_COUNT);
  const decoded = {
    cycleNo,
    updatedAt: new Date().toISOString(),
    common: decodeCommon(area),
    inspection: decodeUniversalInspection(area),
  };

  console.dir(decoded, { depth: null, colors: true });
}

async function main() {
  const config = makeConfig();
  const commonOnly = process.argv.includes("--common");
  const once = process.argv.includes("--once") || commonOnly;
  const intervalMs = envNumber("PLC_READ_INTERVAL_MS", DEFAULT_READ_INTERVAL_MS);
  const errorDelayMs = envNumber("PLC_ERROR_DELAY_MS", DEFAULT_ERROR_DELAY_MS);
  const readCount = commonOnly ? 100 : READ_COUNT;

  console.log(`Reading inspection data from ${config.host}:${config.port}`);
  console.log(`Protocol: MC 3E binary, device ${config.device}, range ${config.device}${AREA_START}-${config.device}${AREA_START + readCount - 1}`);
  console.log(`Chunk size: ${config.chunkSize} registers, chunk delay: ${config.chunkDelayMs}ms, retries: ${config.chunkRetries}`);
  console.log(once ? "Mode: one read" : `Mode: continuous read every ${intervalMs}ms`);

  if (commonOnly) {
    const area = await readWordsInChunks(config, AREA_START, readCount);
    console.dir({ common: decodeCommon(area) }, { depth: null, colors: true });
    return;
  }

  let cycleNo = 1;
  while (true) {
    try {
      await readOnce(config, cycleNo);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${new Date().toISOString()}] Cycle ${cycleNo}: PLC read failed: ${message}`);
      if (once) throw error;
      console.error(`[${new Date().toISOString()}] Waiting ${errorDelayMs}ms before retry`);
      await sleep(errorDelayMs);
    }

    if (once) return;
    cycleNo += 1;
    await sleep(intervalMs);
  }
}

main().catch(error => {
  console.error("PLC read failed:", error.message);
  process.exitCode = 1;
});
