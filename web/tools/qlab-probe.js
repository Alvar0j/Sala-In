// Diagnóstico de la conexión con QLab: muestra las respuestas tal cual.
// Uso: node tools/qlab-probe.js IP-DE-QLAB[:PUERTO] [passcode] [número-de-cue]
//   ej.: node tools/qlab-probe.js 192.168.0.109:53008 "" 20   (puerto 53000 si no se indica)
import dgram from 'node:dgram';
import { encode, decode } from '../src/osc.js';

const [target, passcode = '', cue = '20'] = process.argv.slice(2);
const [host, portText] = String(target ?? '').split(':');
const port = Number(portText) || 53000;
if (!host) { console.log('Uso: node tools/qlab-probe.js IP-DE-QLAB [passcode] [número-de-cue]'); process.exit(1); }

const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
socket.on('error', (error) => {
  if (error.code === 'EADDRINUSE') console.log('El puerto 53001 está ocupado: para la web (Ctrl + C en su ventana) y vuelve a lanzar la prueba.');
  else console.log(`Error: ${error.message}`);
  process.exit(1);
});
const pending = [];
socket.on('message', (data) => {
  try {
    const { address, args } = decode(data);
    console.log(`  ← ${address}  ${args.map((a) => a.value).join(' ')}`);
    pending.shift()?.(args[0]?.value);
  } catch (error) { console.log(`  ← (paquete no válido: ${error.message})`); }
});

function send(address, args = []) {
  console.log(`→ ${address}${args.length ? ' ' + args.map((a) => (a.type === 's' && a === args[0] && address.endsWith('/connect') ? '••••' : a.value)).join(' ') : ''}`);
  return new Promise((resolve) => {
    const timer = setTimeout(() => { pending.splice(pending.indexOf(done), 1); console.log('  (sin respuesta en 2 s)'); resolve(null); }, 2000);
    const done = (value) => { clearTimeout(timer); resolve(value); };
    pending.push(done);
    socket.send(encode({ address, args }), port, host);
  });
}

// Mismo puerto que usa la web (53001), que ya sabemos que recibe las respuestas.
socket.bind(53001, async () => {
  console.log(`Probando QLab en ${host}:${port} (respuestas en el puerto ${socket.address().port})\n`);
  const pass = passcode ? [{ type: 's', value: passcode }] : [];
  socket.send(encode({ address: '/udpReplyPort', args: [{ type: 'i', value: 53001 }] }), port, host);
  await new Promise((r) => setTimeout(r, 200));
  await send('/version');
  const list = await send('/workspaces');
  let id = '';
  try { id = JSON.parse(list).data?.[0]?.uniqueID ?? ''; } catch {}
  console.log(id ? `\nWorkspace encontrado: ${id}\n` : '\nNo se pudo leer la lista de workspaces.\n');
  if (id) {
    await send(`/workspace/${id}/connect`, pass);
    await send(`/workspace/${id}/cue/${cue}/name`);
  }
  await send('/connect', pass);
  await send(`/cue/${cue}/name`);
  socket.close();
  console.log('\nFin. Copia todo lo anterior y pásaselo a Claude.');
});
