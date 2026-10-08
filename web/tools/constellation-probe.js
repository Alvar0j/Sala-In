// Diagnóstico de la conexión con Constellation (Meyer NADIA / D-Mitri, servidor OSC de CueStation).
// Solo envía mensajes inofensivos (/ping y /projectping): no cambia nada en el sistema de sonido.
// Uso: node tools/constellation-probe.js IP[:PUERTO] [IP2[:PUERTO] ...]
//   ej.: node tools/constellation-probe.js 10.1.1.21 10.1.1.25      (puerto 18033 si no se indica)
import dgram from 'node:dgram';
import net from 'node:net';
import { encode, decode } from '../src/osc.js';

const targets = process.argv.slice(2).map((text) => {
  const [host, portText] = text.split(':');
  return { host, port: Number(portText) || 18033 };
});
if (!targets.length) {
  console.log('Uso: node tools/constellation-probe.js IP[:PUERTO] [IP2 ...]   (puerto 18033 por defecto)');
  process.exit(1);
}

function tcpCheck({ host, port }) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: 3000 });
    const done = (result) => { socket.destroy(); resolve(result); };
    socket.on('connect', () => done('abierto (hay un servidor escuchando)'));
    socket.on('timeout', () => done('sin respuesta en 3 s (filtrado o equipo apagado)'));
    socket.on('error', (error) => done(error.code === 'ECONNREFUSED' ? 'cerrado (el equipo responde, pero no en este puerto)' : error.message));
  });
}

function udpPing({ host, port }) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    const replies = [];
    socket.on('message', (data, rinfo) => {
      try {
        const { address, args } = decode(data);
        replies.push(`← ${rinfo.address}:${rinfo.port} ${address} ${args.map((a) => a.value).join(' ')}`);
      } catch (error) { replies.push(`← paquete no OSC (${data.length} bytes)`); }
    });
    socket.on('error', (error) => { replies.push(`error: ${error.message}`); });
    socket.bind(0, () => {
      for (const address of ['/ping', '/projectping']) {
        socket.send(encode({ address, args: [{ type: 's', value: 'sala-in' }] }), port, host);
      }
      setTimeout(() => { socket.close(); resolve(replies); }, 2500);
    });
  });
}

for (const target of targets) {
  console.log(`\n=== ${target.host}:${target.port} ===`);
  console.log(`TCP: ${await tcpCheck(target)}`);
  const replies = await udpPing(target);
  console.log(`UDP /ping: ${replies.length ? 'responde' : 'sin respuesta en 2,5 s'}`);
  for (const line of replies) console.log(`  ${line}`);
}
