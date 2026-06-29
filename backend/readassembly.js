const {
  ASSEMBLY_COUNT,
  ASSEMBLY_END,
  ASSEMBLY_START,
  decodeAssembly,
  makeAssemblyConfig,
  readWordsInChunks,
} = require("./assembly-layout");

const DEFAULT_READ_INTERVAL_MS = 1000;
const DEFAULT_ERROR_DELAY_MS = 10000;

function envNumber(key, fallback) {
  return process.env[key] === undefined || process.env[key] === "" ? fallback : Number(process.env[key]);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function readOnce(config, cycleNo) {
  const area = await readWordsInChunks(config, ASSEMBLY_START, ASSEMBLY_COUNT);
  const decoded = {
    cycleNo,
    updatedAt: new Date().toISOString(),
    assembly: decodeAssembly(area),
  };
  console.dir(decoded, { depth: null, colors: true });
}

async function main() {
  const config = makeAssemblyConfig({
    chunkSize: envNumber("ASSEMBLY_READ_CHUNK_SIZE", envNumber("PLC_READ_CHUNK_SIZE", 50)),
    chunkDelayMs: envNumber("ASSEMBLY_READ_CHUNK_DELAY_MS", envNumber("PLC_READ_CHUNK_DELAY_MS", 20)),
    timeoutMs: envNumber("ASSEMBLY_READ_TIMEOUT_MS", envNumber("PLC_READ_TIMEOUT_MS", 2500)),
  });
  const once = process.argv.includes("--once");
  const intervalMs = envNumber("ASSEMBLY_READ_INTERVAL_MS", DEFAULT_READ_INTERVAL_MS);
  const errorDelayMs = envNumber("PLC_ERROR_DELAY_MS", DEFAULT_ERROR_DELAY_MS);

  console.log(`Reading assembly data from ${config.host}:${config.port}`);
  console.log(`Protocol: MC 3E binary, device ${config.device}, range ${config.device}${ASSEMBLY_START}-${config.device}${ASSEMBLY_END}`);
  console.log(`Chunk size: ${config.chunkSize}, chunk delay: ${config.chunkDelayMs}ms, retries: ${config.chunkRetries}`);
  console.log(once ? "Mode: one read" : `Mode: continuous read every ${intervalMs}ms`);

  let cycleNo = 1;
  while (true) {
    try {
      await readOnce(config, cycleNo);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Assembly cycle ${cycleNo}: PLC read failed: ${error.message}`);
      if (once) throw error;
      await sleep(errorDelayMs);
    }
    if (once) return;
    cycleNo += 1;
    await sleep(intervalMs);
  }
}

main().catch(error => {
  console.error("Assembly PLC read failed:", error.message);
  process.exitCode = 1;
});
