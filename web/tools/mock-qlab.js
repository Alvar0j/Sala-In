// Simulador de QLab 5 por OSC/UDP para probar la web sin estar en la sala.
// Uso: npm run mock:qlab  (PORT=53000 PASSCODE=1234 opcionales)
import dgram from 'node:dgram';
import { encode, decode } from '../src/osc.js';

// Igual que el QLab real de la sala: los comandos /cue/... sin /workspace/{id} delante
// responden «error»; hay que usar el ID interno que devuelve /workspaces.
export const MOCK_WORKSPACE = { uniqueID: 'A1B2C3D4-MOCK', displayName: 'Magellan Demo v5 20260710', hasPasscode: false };
const MOCK_CUES = { 20: 'RESET AVB', 22: 'CHECK ALTAVOCES', 104: 'ENCENDIDO SALA', 103: 'APAGADO SALA' };

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
    if (address === '/workspaces') return reply(rinfo, address, [{ ...MOCK_WORKSPACE, hasPasscode: Boolean(passcode) }]);
    const prefix = `/workspace/${MOCK_WORKSPACE.uniqueID}`;
    if (/^\/(cue|cue_id|go|stop|panic|pause|resume)\b/.test(address)) return reply(rinfo, address, undefined, 'error');
    if (address.startsWith('/workspace/') && !address.startsWith(prefix + '/')) return reply(rinfo, address, undefined, 'error');
    const nameMatch = address.match(/\/cue\/(\w+)\/name$/);
    if (nameMatch) return MOCK_CUES[nameMatch[1]] ? reply(rinfo, address, `${nameMatch[1]} · ${MOCK_CUES[nameMatch[1]]}`) : reply(rinfo, address, undefined, 'error');
    if (address.endsWith('/connect')) {
      if (process.env.MOCK_DENY) return reply(rinfo, address, 'error'); // como QLab sin permisos de OSC Access
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
