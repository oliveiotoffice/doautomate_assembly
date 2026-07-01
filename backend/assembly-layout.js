const {
  AREA_START: INSPECTION_AREA_START,
  floatToWords,
  getWords,
  makeConfig,
  readWordsInChunks,
  setWords,
  stringToWords,
  uint32ToWords,
  uint64ToWords,
  wordsToFloat,
  wordsToString,
  wordsToUInt64,
  writeWordsInChunks,
} = require("./plc-layout");

const ASSEMBLY_START = 11000;
const ASSEMBLY_END = 11600;
const ASSEMBLY_COUNT = ASSEMBLY_END - ASSEMBLY_START + 1;
const MODEL_NUMBERS = [0, 6630865, 6630867, 6630862];

const MODEL_NAMES = {
  6630865: "Shaft-6630865",
  6630867: "Shaft-6630867",
  6630862: "Shaft-6630862",
};

const MODEL_LOW_WORDS = Object.fromEntries(
  MODEL_NUMBERS.filter(modelNo => modelNo !== 0).map(modelNo => [modelNo & 0xffff, modelNo])
);

const FLOAT_FIELDS = [
  ["cycleTime", "Common / Cycle Time", 11020, { min: 18, max: 42, actual: 28 }],
  ["plugLeftForce", "Station 7 / Plug Left Force", 11100, { min: 1.2, max: 2.8, actual: 1.9 }],
  ["plugLeftDepth", "Station 7 / Plug Left Depth", 11106, { min: 14.285, max: 14.311, actual: 14.493 }],
  ["plugRightForce", "Station 7 / Plug Right Force", 11112, { min: 1.2, max: 2.8, actual: 1.9 }],
  ["plugRightDepth", "Station 7 / Plug Right Depth", 11118, { min: 14.285, max: 14.311, actual: 14.493 }],
  ["ballLeftForce", "Station 8 / Ball Left Force", 11200, { min: 1.2, max: 2.8, actual: 1.9 }],
  ["ballLeftDepth", "Station 8 / Ball Left Depth", 11206, { min: 6.285, max: 6.31, actual: 6.292 }],
  ["ballRightForce", "Station 8 / Ball Right Force", 11212, { min: 1.2, max: 2.8, actual: 1.9 }],
  ["ballRightDepth", "Station 8 / Ball Right Depth", 11218, { min: 6.285, max: 6.31, actual: 6.292 }],
  ["dowelLeftForce", "Station 9 / Dowel Left Force", 11300, { min: 1.2, max: 2.8, actual: 1.9 }],
  ["dowelLeftDepth", "Station 9 / Dowel Left Depth", 11306, { min: 4.967, max: 4.993, actual: 4.98 }],
  ["dowelRightForce", "Station 9 / Dowel Right Force", 11312, { min: 1.2, max: 2.8, actual: 1.9 }],
  ["dowelRightDepth", "Station 9 / Dowel Right Depth", 11318, { min: 4.967, max: 4.993, actual: 4.98 }],
  ["leftDowelHeight", "Station 11 / Left Dowel Height", 11500, { min: 4.967, max: 4.993, actual: 4.98 }],
  ["rightDowelHeight", "Station 11 / Right Dowel Height", 11506, { min: 4.967, max: 4.993, actual: 4.98 }],
  ["dowelLength", "Station 11 / Dowel Length", 11512, { min: 458.9, max: 459.1, actual: 459 }],
  ["overallLength", "Station 11 / Overall Length", 11518, { min: 465.9, max: 466.1, actual: 466.05 }],
  ["leftOverallDiameter", "Station 11 / Left Overall Diameter", 11524, { min: 34.975, max: 35.025, actual: 35 }],
  ["rightOverallDiameter", "Station 11 / Right Overall Diameter", 11530, { min: 34.975, max: 35.025, actual: 35 }],
  ["leftMillingHeight", "Station 11 / Left Milling Height", 11536, { min: 12.175, max: 12.225, actual: 12.2 }],
  ["rightMillingHeight", "Station 11 / Right Milling Height", 11542, { min: 12.175, max: 12.225, actual: 12.2 }],
  ["finalPlugLeftDepth", "Station 11 / Plug Left Depth", 11548, { min: 14.285, max: 14.311, actual: 14.493 }],
  ["finalPlugRightDepth", "Station 11 / Plug Right Depth", 11554, { min: 14.285, max: 14.311, actual: 14.493 }],
  ["finalBallLeftDepth", "Station 11 / Ball Left Depth", 11560, { min: 6.285, max: 6.31, actual: 6.292 }],
  ["finalBallRightDepth", "Station 11 / Ball Right Depth", 11566, { min: 6.285, max: 6.31, actual: 6.292 }],
  ["finalDowelLeftDepth", "Station 11 / Dowel Left Depth", 11572, { min: 4.967, max: 4.993, actual: 4.98 }],
  ["finalDowelRightDepth", "Station 11 / Dowel Right Depth", 11578, { min: 4.967, max: 4.993, actual: 4.98 }],
];

const STATION_RANGES = {
  common: { label: "Common Area", start: 11000, count: 40 },
  7: { label: "Station 7 Plug Press", start: 11100, count: 24 },
  8: { label: "Station 8 Ball Press", start: 11200, count: 24 },
  9: { label: "Station 9 Dowel Press", start: 11300, count: 24 },
  10: { label: "Station 10 Reserved", start: 11400, count: 100 },
  11: { label: "Station 11 Final Inspection", start: 11500, count: 101 },
};

function offset(address) {
  return address - ASSEMBLY_START;
}

function setAssemblyWords(area, address, values) {
  values.forEach((value, index) => {
    area[offset(address) + index] = value & 0xffff;
  });
}

function getAssemblyWords(area, address, count) {
  return area.slice(offset(address), offset(address) + count);
}

function readFloat(area, address) {
  const words = getAssemblyWords(area, address, 2);
  return wordsToFloat(words[0], words[1]);
}

function writeFloat(area, address, value) {
  setAssemblyWords(area, address, floatToWords(value));
}

function writeFloatParameter(area, address, values) {
  writeFloat(area, address, values.min);
  writeFloat(area, address + 2, values.max);
  writeFloat(area, address + 4, values.actual);
}

function readFloatParameter(area, address) {
  const min = readFloat(area, address);
  const max = readFloat(area, address + 2);
  const actual = readFloat(area, address + 4);
  const pass = actual >= min && actual <= max;
  return { min, max, actual, pass, label: pass ? "OK" : "NG" };
}

function makeAssemblyConfig(overrides = {}) {
  const config = makeConfig();
  return {
    ...config,
    port: Number(process.env.PLC_ASSEMBLY_PORT || process.env.PLC_PORT || config.port),
    ...overrides,
  };
}

function emptyArea() {
  return Array.from({ length: ASSEMBLY_COUNT }, () => 0);
}

function readModelNo(area) {
  const rawModelNo = getAssemblyWords(area, 11011, 1)[0] || 0;
  return MODEL_LOW_WORDS[rawModelNo] || rawModelNo;
}

function writeCommon(area, values) {
  setAssemblyWords(area, 11000, [Number(values.shaftId || 0)]);
  setAssemblyWords(area, 11001, stringToWords(values.operator || "", 10));
  setAssemblyWords(area, 11011, [Number(values.modelNo || 0)]);
  setAssemblyWords(area, 11012, uint64ToWords(values.componentNo || 0));
  setAssemblyWords(area, 11016, [Number(values.partsProcessed || 0)]);
  setAssemblyWords(area, 11017, [Number(values.good || 0)]);
  setAssemblyWords(area, 11018, [Number(values.scrap || 0)]);
  setAssemblyWords(area, 11019, [Number(values.rework || 0)]);
  writeFloatParameter(area, 11020, values.floats.cycleTime);
  setAssemblyWords(area, 11030, stringToWords(values.activeAlarms || "", 10));
}

function writeAllFloats(area, values) {
  FLOAT_FIELDS.forEach(([key, , address]) => {
    writeFloatParameter(area, address, values.floats[key]);
  });
}

function buildAssemblyArea(values) {
  const area = emptyArea();
  writeCommon(area, values);
  writeAllFloats(area, values);
  setAssemblyWords(area, 11590, stringToWords(values.qrGrade || "", 10));
  setAssemblyWords(area, 11600, [Number(values.completedStatus || 0)]);
  return area;
}

function decodeAssembly(area) {
  const common = {
    shaftId: getAssemblyWords(area, 11000, 1)[0] || 0,
    operator: wordsToString(getAssemblyWords(area, 11001, 10)),
    modelNo: readModelNo(area),
    componentNo: wordsToUInt64(getAssemblyWords(area, 11012, 4)),
    partsProcessed: getAssemblyWords(area, 11016, 1)[0] || 0,
    good: getAssemblyWords(area, 11017, 1)[0] || 0,
    scrap: getAssemblyWords(area, 11018, 1)[0] || 0,
    rework: getAssemblyWords(area, 11019, 1)[0] || 0,
    cycleTime: readFloatParameter(area, 11020),
    activeAlarms: wordsToString(getAssemblyWords(area, 11030, 10)),
  };

  const floats = Object.fromEntries(FLOAT_FIELDS.map(([key, label, address]) => [
    key,
    { label, register: `D${address}-D${address + 5}`, ...readFloatParameter(area, address) },
  ]));

  return {
    common,
    stations: {
      7: {
        plugLeftForce: floats.plugLeftForce,
        plugLeftDepth: floats.plugLeftDepth,
        plugRightForce: floats.plugRightForce,
        plugRightDepth: floats.plugRightDepth,
      },
      8: {
        ballLeftForce: floats.ballLeftForce,
        ballLeftDepth: floats.ballLeftDepth,
        ballRightForce: floats.ballRightForce,
        ballRightDepth: floats.ballRightDepth,
      },
      9: {
        dowelLeftForce: floats.dowelLeftForce,
        dowelLeftDepth: floats.dowelLeftDepth,
        dowelRightForce: floats.dowelRightForce,
        dowelRightDepth: floats.dowelRightDepth,
      },
      10: "Reserved",
      11: {
        leftDowelHeight: floats.leftDowelHeight,
        rightDowelHeight: floats.rightDowelHeight,
        dowelLength: floats.dowelLength,
        overallLength: floats.overallLength,
        leftOverallDiameter: floats.leftOverallDiameter,
        rightOverallDiameter: floats.rightOverallDiameter,
        leftMillingHeight: floats.leftMillingHeight,
        rightMillingHeight: floats.rightMillingHeight,
        plugLeftDepth: floats.finalPlugLeftDepth,
        plugRightDepth: floats.finalPlugRightDepth,
        ballLeftDepth: floats.finalBallLeftDepth,
        ballRightDepth: floats.finalBallRightDepth,
        dowelLeftDepth: floats.finalDowelLeftDepth,
        dowelRightDepth: floats.finalDowelRightDepth,
        qrGrade: wordsToString(getAssemblyWords(area, 11590, 10)),
        completedStatus: getAssemblyWords(area, 11600, 1)[0] || 0,
      },
    },
    floats,
  };
}

module.exports = {
  ASSEMBLY_COUNT,
  ASSEMBLY_END,
  ASSEMBLY_START,
  FLOAT_FIELDS,
  INSPECTION_AREA_START,
  MODEL_NAMES,
  MODEL_NUMBERS,
  STATION_RANGES,
  buildAssemblyArea,
  decodeAssembly,
  emptyArea,
  getAssemblyWords,
  makeAssemblyConfig,
  readWordsInChunks,
  setAssemblyWords,
  stringToWords,
  uint32ToWords,
  uint64ToWords,
  writeWordsInChunks,
};
