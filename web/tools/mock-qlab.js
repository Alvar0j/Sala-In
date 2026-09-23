// Simulador de QLab 5 por OSC/UDP para probar la web sin estar en la sala.
// Uso: npm run mock:qlab  (PORT=53000 PASSCODE=1234 opcionales)
import dgram from 'node:dgram';
import { encode, decode } from '../src/osc.js';

export function startMockQLab({ port = 53000, passcode = '', log = console.log } = {}) {
  const socket = dgram.createSocket('udp4');
  const received = [];
  const replyPorts = new Map();
  const reply = (rinfo, address, data, status = 'ok') => {
    const target = replyPorts.get(rinfo.address) ?? rinfo.port;
    const json = JSON.stringify({ workspace_id: 'MOCK', address, status, ...(data !== undefined ? { data } : {}) });
    socket.send(encode({ address: `/reply${address}`, args: [{ type: 's', value: json }] }), target, rinfo.address);
  };
  socket.on('message', (packet, rinfo) => {
    let message;
    try { message = decode(packet); } catch (error) { log(`paquete no válido: ${error.message}`); return; }
    received.push(message);
    const { address, args } = message;
    log(`← ${address} ${args.map((a) => a.value).join(' ')}`);
    if (address === '/udpReplyPort') { replyPorts.set(rinfo.address, args[0]?.value); return; }
    if (address.endsWith('/connect')) {
      const ok = !passcode || args[0]?.value === passcode;
      return reply(rinfo, address, ok ? 'ok:view|edit|control' : 'badpass');
    }
    if (address === '/version') return reply(rinfo, address, '5.4.8');
    if (address.endsWith('/thump')) return reply(rinfo, address, 'thump');
    if (address.includes('cueLists')) {
      return reply(rinfo, address, [{ uniqueID: 'L1', number: '', name: 'Main Cue List', type: 'Cue List', cues: [
        { uniqueID: 'C1', number: '1', name: 'Intro', type: 'Audio', armed: true },
        { uniqueID: 'C2', number: '2', name: 'Demo Constellation', type: 'Group', armed: true },
      ] }]);
    }
    if (address.includes('runningOrPausedCues')) return reply(rinfo, address, []);
    return reply(rinfo, address);
  });
  return new Promise((resolve) => socket.bind(port, () => resolve({ socket, received, port: socket.address().port, close: () => socket.close() })));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 53000);
  startMockQLab({ port, passcode: process.env.PASSCODE ?? '' }).then(() => console.log(`Mock QLab escuchando en UDP ${port}`));
}
