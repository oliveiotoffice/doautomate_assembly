const net = require('net');

const HOST = '192.168.3.5';
const PORT = 5010;

const client = new net.Socket();

client.connect(PORT, HOST, () => {
    console.log(`Connected to ${HOST}:${PORT}`);
});

client.on('data', (data) => {
    console.log('--------------------------------');
    console.log('Time :', new Date().toISOString());
    console.log('HEX  :', data.toString('hex'));
    console.log('ASCII:', data.toString());
});

client.on('close', () => {
    console.log('Connection closed');
});

client.on('error', (err) => {
    console.error('Error:', err.message);
});