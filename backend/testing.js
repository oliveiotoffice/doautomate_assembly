const net = require("net");

const PLC_HOST = "192.168.3.39";
const PLC_PORT = 502;

function writeUInt24LE(buffer, value, offset) {
    buffer[offset] = value & 0xff;
    buffer[offset + 1] = (value >> 8) & 0xff;
    buffer[offset + 2] = (value >> 16) & 0xff;
}

function buildReadFrame(startAddress, wordCount) {
    const buffer = Buffer.alloc(21);
    let offset = 0;

    buffer.writeUInt16LE(0x0050, offset); offset += 2;
    buffer.writeUInt8(0x00, offset++);
    buffer.writeUInt8(0xFF, offset++);
    buffer.writeUInt16LE(0x03FF, offset); offset += 2;
    buffer.writeUInt8(0x00, offset++);
    buffer.writeUInt16LE(12, offset); offset += 2;
    buffer.writeUInt16LE(0x0010, offset); offset += 2;
    buffer.writeUInt16LE(0x0401, offset); offset += 2;
    buffer.writeUInt16LE(0x0000, offset); offset += 2;

    writeUInt24LE(buffer, startAddress, offset);
    offset += 3;

    buffer.writeUInt8(0xA8, offset++); // D register
    buffer.writeUInt16LE(wordCount, offset);

    return buffer;
}

function readRegisters(startAddress, count) {
    return new Promise((resolve, reject) => {
        const socket = new net.Socket();
        let chunks = [];

        socket.setTimeout(5000);

        socket.on("data", data => {
            chunks.push(data);
            const buf = Buffer.concat(chunks);

            if (buf.length >= 11 + count * 2) {
                socket.destroy();

                const values = [];
                for (let i = 0; i < count; i++) {
                    values.push(buf.readUInt16LE(11 + i * 2));
                }

                resolve(values);
            }
        });

        socket.on("error", reject);
        socket.on("timeout", () => reject(new Error("Timeout")));

        socket.connect(PLC_PORT, PLC_HOST, () => {
            socket.write(buildReadFrame(startAddress, count));
        });
    });
}
function wordsToScaledValue(lowWord, highWord) {
    const raw = highWord * 65536 + lowWord;
    return raw / 10000;
}

async function pollPLC() {
    try {
        const values = await readRegisters(6234, 4);

        console.log(
            `D6234=${values[0]}, D6235=${values[1]}, D6236=${values[2]}, D6237=${values[3]}`
        );

        const value1 = wordsToScaledValue(values[0], values[1]);
        const value2 = wordsToScaledValue(values[2], values[3]);

        console.log(
            `Value1=${value1.toFixed(3)}, Value2=${value2.toFixed(3)}`
        );

    } catch (err) {
        console.log("PLC Error:", err.message);
    }
}

setInterval(pollPLC, 1000);
pollPLC();