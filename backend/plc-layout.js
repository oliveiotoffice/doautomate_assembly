const net = require("net");

const DEFAULTS = {
  host: "192.168.3.39",
  port: 5012,
  device: "D",
  networkNo: 0x00,
  pcNo: 0xff,
  ioNo: 0x03ff,
  stationNo: 0x00,
  monitorTimer: 0x0010,
  timeoutMs: 5000,
  chunkSize: 10,
  chunkDelayMs: 150,
  chunkRetries: 3,
};

const DEVICE_CODES = {
  X: 0x9c,
  Y: 0x9d,
  M: 0x90,
  L: 0x92,
  F: 0x93,
  V: 0x94,
  B: 0xa0,
  D: 0xa8,
  W: 0xb4,
  R: 0xaf,
  ZR: 0xb0,
};

const AREA_START = 10000;
const AREA_END = 10699;
const AREA_COUNT = AREA_END - AREA_START + 1;

const STATION_OFFSETS = {
  1: 100,
  2: 200,
  3: 300,
  4: 400,
  5: 500,
  6: 600,
};

function envNumber(key, fallback) {
  return process.env[key] === undefined || process.env[key] === "" ? fallback : Number(process.env[key]);
}

function makeConfig() {
  const device = (process.env.MC_DEVICE || process.env.PLC_DEVICE || DEFAULTS.device).toUpperCase();
  const deviceCode = DEVICE_CODES[device];
  if (deviceCode === undefined) throw new Error(`Unsupported PLC device ${device}`);

  return {
    host: process.env.PLC_HOST || DEFAULTS.host,
    port: envNumber("PLC_PORT", DEFAULTS.port),
    device,
    deviceCode,
    networkNo: envNumber("MC_NETWORK_NO", DEFAULTS.networkNo),
    pcNo: envNumber("MC_PC_NO", DEFAULTS.pcNo),
    ioNo: envNumber("MC_IO_NO", DEFAULTS.ioNo),
    stationNo: envNumber("MC_STATION_NO", DEFAULTS.stationNo),
    monitorTimer: envNumber("MC_MONITOR_TIMER", DEFAULTS.monitorTimer),
    timeoutMs: envNumber("MC_TIMEOUT_MS", DEFAULTS.timeoutMs),
    chunkSize: envNumber("MC_CHUNK_SIZE", DEFAULTS.chunkSize),
    chunkDelayMs: envNumber("MC_CHUNK_DELAY_MS", DEFAULTS.chunkDelayMs),
    chunkRetries: envNumber("MC_CHUNK_RETRIES", DEFAULTS.chunkRetries),
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function writeUInt24LE(buffer, value, offset) {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >> 8) & 0xff;
  buffer[offset + 2] = (value >> 16) & 0xff;
}

function floatToWords(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeFloatLE(value);
  return [buffer.readUInt16LE(0), buffer.readUInt16LE(2)];
}

function wordsToFloat(lowWord, highWord) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt16LE(lowWord || 0, 0);
  buffer.writeUInt16LE(highWord || 0, 2);
  return Number(buffer.readFloatLE(0).toFixed(3));
}

function uint32ToWords(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(Number(value) >>> 0);
  return [buffer.readUInt16LE(0), buffer.readUInt16LE(2)];
}

function wordsToUInt32(lowWord, highWord) {
  return ((highWord || 0) * 0x10000) + (lowWord || 0);
}

function uint64ToWords(value) {
  let number = BigInt(value || 0);
  const words = [];
  for (let index = 0; index < 4; index += 1) {
    words.push(Number(number & 0xffffn));
    number >>= 16n;
  }
  return words;
}

function wordsToUInt64(words) {
  let value = 0n;
  for (let index = 3; index >= 0; index -= 1) {
    value = (value << 16n) + BigInt(words[index] || 0);
  }
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString();
}

function stringToWords(text, registers = 10) {
  const buffer = Buffer.alloc(registers * 2, 0x20);
  buffer.write(String(text).slice(0, registers * 2), "ascii");

  const words = [];
  for (let offset = 0; offset < buffer.length; offset += 2) {
    words.push(buffer.readUInt16LE(offset));
  }
  return words;
}

function wordsToString(words) {
  const buffer = Buffer.alloc(words.length * 2);
  words.forEach((word, index) => buffer.writeUInt16LE(word || 0, index * 2));
  return buffer.toString("ascii").replace(/\0/g, " ").trim();
}

function dateTimeToWords(date = new Date()) {
  const epochSeconds = Math.floor(date.getTime() / 1000);
  return [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds(),
    date.getDay(),
    ...uint32ToWords(epochSeconds),
  ];
}

function wordsToDateTime(words) {
  return {
    year: words[0] || 0,
    month: words[1] || 0,
    day: words[2] || 0,
    hour: words[3] || 0,
    minute: words[4] || 0,
    second: words[5] || 0,
    millisecond: words[6] || 0,
    dayOfWeek: words[7] || 0,
    epochSeconds: wordsToUInt32(words[8], words[9]),
  };
}

function setWords(area, address, values) {
  const offset = address - AREA_START;
  values.forEach((value, index) => {
    area[offset + index] = value & 0xffff;
  });
}

function getWords(area, address, count) {
  const offset = address - AREA_START;
  return area.slice(offset, offset + count);
}

function buildReadFrame(config, startAddress, wordCount) {
  const requestDataLength = 12;
  const buffer = Buffer.alloc(9 + requestDataLength);
  let offset = 0;

  buffer.writeUInt16LE(0x0050, offset); offset += 2;
  buffer.writeUInt8(config.networkNo, offset++);
  buffer.writeUInt8(config.pcNo, offset++);
  buffer.writeUInt16LE(config.ioNo, offset); offset += 2;
  buffer.writeUInt8(config.stationNo, offset++);
  buffer.writeUInt16LE(requestDataLength, offset); offset += 2;
  buffer.writeUInt16LE(config.monitorTimer, offset); offset += 2;
  buffer.writeUInt16LE(0x0401, offset); offset += 2;
  buffer.writeUInt16LE(0x0000, offset); offset += 2;
  writeUInt24LE(buffer, startAddress, offset); offset += 3;
  buffer.writeUInt8(config.deviceCode, offset++);
  buffer.writeUInt16LE(wordCount, offset);

  return buffer;
}

function buildWriteFrame(config, startAddress, words) {
  const requestDataLength = 12 + words.length * 2;
  const buffer = Buffer.alloc(9 + requestDataLength);
  let offset = 0;

  buffer.writeUInt16LE(0x0050, offset); offset += 2;
  buffer.writeUInt8(config.networkNo, offset++);
  buffer.writeUInt8(config.pcNo, offset++);
  buffer.writeUInt16LE(config.ioNo, offset); offset += 2;
  buffer.writeUInt8(config.stationNo, offset++);
  buffer.writeUInt16LE(requestDataLength, offset); offset += 2;
  buffer.writeUInt16LE(config.monitorTimer, offset); offset += 2;
  buffer.writeUInt16LE(0x1401, offset); offset += 2;
  buffer.writeUInt16LE(0x0000, offset); offset += 2;
  writeUInt24LE(buffer, startAddress, offset); offset += 3;
  buffer.writeUInt8(config.deviceCode, offset++);
  buffer.writeUInt16LE(words.length, offset); offset += 2;

  words.forEach(word => {
    buffer.writeUInt16LE(word & 0xffff, offset);
    offset += 2;
  });

  return buffer;
}

function parseReadResponse(buffer, wordCount) {
  if (buffer.length < 11) throw new Error(`PLC response too short: ${buffer.length} bytes`);

  const subheader = buffer.readUInt16LE(0);
  if (subheader !== 0x00d0) throw new Error(`Unexpected MC response subheader: 0x${subheader.toString(16)}`);

  const dataLength = buffer.readUInt16LE(7);
  const endCode = buffer.readUInt16LE(9);
  if (endCode !== 0) throw new Error(`PLC end code 0x${endCode.toString(16)}`);

  const expectedBytes = wordCount * 2;
  if (dataLength - 2 < expectedBytes) throw new Error(`PLC returned ${dataLength - 2} data bytes, expected ${expectedBytes}`);

  return Array.from({ length: wordCount }, (_, index) => buffer.readUInt16LE(11 + index * 2));
}

function parseWriteResponse(buffer) {
  if (buffer.length < 11) throw new Error(`PLC response too short: ${buffer.length} bytes`);

  const subheader = buffer.readUInt16LE(0);
  if (subheader !== 0x00d0) throw new Error(`Unexpected MC response subheader: 0x${subheader.toString(16)}`);

  const endCode = buffer.readUInt16LE(9);
  if (endCode !== 0) throw new Error(`PLC end code 0x${endCode.toString(16)}`);
}

function sendMcPacket(config, packet, responseParser) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const chunks = [];
    let settled = false;

    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error); else resolve(result);
    };

    socket.setTimeout(config.timeoutMs);
    socket.once("timeout", () => finish(new Error("PLC connection timeout")));
    socket.once("error", error => finish(error));
    socket.on("data", chunk => {
      chunks.push(chunk);
      const data = Buffer.concat(chunks);
      if (data.length < 9) return;

      const fullLength = 9 + data.readUInt16LE(7);
      if (data.length < fullLength) return;

      try {
        finish(null, responseParser(data));
      } catch (error) {
        finish(error);
      }
    });

    socket.connect(config.port, config.host, () => socket.write(packet));
  });
}

function openMcSocket(config) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (error) => {
      if (settled) return;
      settled = true;
      socket.removeAllListeners("connect");
      socket.removeAllListeners("timeout");
      socket.removeAllListeners("error");
      if (error) {
        socket.destroy();
        reject(error);
      } else {
        socket.on("error", () => {});
        resolve(socket);
      }
    };

    socket.setNoDelay(true);
    socket.setKeepAlive(true, 10000);
    socket.setTimeout(config.timeoutMs);
    socket.once("connect", () => finish());
    socket.once("timeout", () => finish(new Error("PLC connection timeout")));
    socket.once("error", error => finish(error));
    socket.connect(config.port, config.host);
  });
}

function sendMcPacketOnSocket(config, socket, packet, responseParser) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let settled = false;

    const cleanup = () => {
      socket.removeListener("data", onData);
      socket.removeListener("error", onError);
      socket.removeListener("timeout", onTimeout);
      socket.removeListener("close", onClose);
    };

    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error); else resolve(result);
    };

    const onData = (chunk) => {
      chunks.push(chunk);
      const data = Buffer.concat(chunks);
      if (data.length < 9) return;

      const fullLength = 9 + data.readUInt16LE(7);
      if (data.length < fullLength) return;

      try {
        finish(null, responseParser(data));
      } catch (error) {
        finish(error);
      }
    };

    const onError = error => finish(error);
    const onTimeout = () => finish(new Error("PLC connection timeout"));
    const onClose = () => finish(new Error("PLC connection closed"));

    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("timeout", onTimeout);
    socket.once("close", onClose);
    socket.write(packet);
  });
}

async function withMcSocket(config, callback) {
  const socket = await openMcSocket(config);
  try {
    return await callback(socket);
  } finally {
    socket.end();
    socket.destroy();
  }
}

async function runChunkWithReconnect(config, action) {
  let lastError;

  for (let attempt = 0; attempt <= config.chunkRetries; attempt += 1) {
    try {
      return await withMcSocket(config, action);
    } catch (error) {
      lastError = error;
      if (attempt >= config.chunkRetries) break;
      await sleep(config.chunkDelayMs * (attempt + 1));
    }
  }

  throw lastError;
}

async function readWords(config, startAddress, wordCount) {
  const frame = buildReadFrame(config, startAddress, wordCount);
  return sendMcPacket(config, frame, buffer => parseReadResponse(buffer, wordCount));
}

async function writeWords(config, startAddress, words) {
  const frame = buildWriteFrame(config, startAddress, words);
  await sendMcPacket(config, frame, parseWriteResponse);
}

async function readWordsInChunks(config, startAddress, wordCount) {
  return runChunkWithReconnect(config, async (socket) => {
    const words = [];
    for (let offset = 0; offset < wordCount; offset += config.chunkSize) {
      const count = Math.min(config.chunkSize, wordCount - offset);
      const chunkStart = startAddress + offset;
      const frame = buildReadFrame(config, chunkStart, count);
      try {
        const chunk = await sendMcPacketOnSocket(config, socket, frame, buffer => parseReadResponse(buffer, count));
        words.push(...chunk);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Read failed at ${config.device}${chunkStart}-${config.device}${chunkStart + count - 1}: ${message}`);
      }
      if (config.chunkDelayMs > 0) await sleep(config.chunkDelayMs);
    }
    return words;
  });
}

async function writeWordsInChunks(config, startAddress, words, onChunk) {
  let offset = 0;

  while (offset < words.length) {
    await runChunkWithReconnect(config, async (socket) => {
      while (offset < words.length) {
        const chunk = words.slice(offset, offset + config.chunkSize);
        const chunkStart = startAddress + offset;
        if (onChunk) onChunk(chunkStart, chunk.length);
        const frame = buildWriteFrame(config, chunkStart, chunk);

        try {
          await sendMcPacketOnSocket(config, socket, frame, parseWriteResponse);
          offset += chunk.length;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`Write failed at ${config.device}${chunkStart}-${config.device}${chunkStart + chunk.length - 1}: ${message}`);
        }

        if (config.chunkDelayMs > 0) await sleep(config.chunkDelayMs);
      }
    });

    if (offset < words.length) {
      await sleep(config.chunkDelayMs);
    }
  }
}

module.exports = {
  AREA_COUNT,
  AREA_END,
  AREA_START,
  STATION_OFFSETS,
  dateTimeToWords,
  floatToWords,
  getWords,
  makeConfig,
  readWordsInChunks,
  setWords,
  stringToWords,
  uint32ToWords,
  uint64ToWords,
  wordsToDateTime,
  wordsToFloat,
  wordsToString,
  wordsToUInt32,
  wordsToUInt64,
  writeWordsInChunks,
};
