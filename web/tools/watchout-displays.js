// Lista las pantallas (displays) del show de WATCHOUT 7 con su resolución y posición.
// Uso: node tools/watchout-displays.js IP-DEL-DIRECTOR[:PUERTO]
//   ej.: node tools/watchout-displays.js 192.168.0.12
// Guarda además el show completo en watchout-show.json por si hace falta revisarlo.
import fs from 'node:fs';

const [host, portText] = String(process.argv[2] ?? '').split(':');
if (!host) { console.log('Uso: node tools/watchout-displays.js IP-DEL-DIRECTOR[:PUERTO]'); process.exit(1); }
const base = `http://${host}:${Number(portText) || 3019}`;

const show = await fetch(`${base}/v0/show`, { signal: AbortSignal.timeout(10_000) }).then((r) => {
  if (!r.ok) throw new Error(`WATCHOUT respondió ${r.status}`);
  return r.json();
}).catch((error) => { console.log(`No se pudo leer el show: ${error.message}`); process.exit(1); });
fs.writeFileSync('watchout-show.json', JSON.stringify(show, null, 2));

// El formato del show no está documentado: se buscan objetos con pinta de pantalla
// (que tengan ancho y alto) dentro de cualquier sección cuyo nombre recuerde a displays.
const found = [];
const num = (v) => (typeof v === 'number' ? v : undefined);
function size(o) {
  const w = num(o.width) ?? num(o.resolution?.width) ?? num(o.size?.width) ?? num(o.resolution?.x) ?? num(o.pixelWidth);
  const h = num(o.height) ?? num(o.resolution?.height) ?? num(o.size?.height) ?? num(o.resolution?.y) ?? num(o.pixelHeight);
  return w && h ? [w, h] : null;
}
function visit(node, path, inDisplays) {
  if (Array.isArray(node)) return node.forEach((n, i) => visit(n, `${path}[${i}]`, inDisplays));
  if (!node || typeof node !== 'object') return;
  const here = inDisplays || /display|output|screen|projector/i.test(path.split('.').pop() ?? '');
  const s = size(node);
  if (here && s) {
    const pos = node.position ?? node.transform?.position ?? node.offset ?? {};
    found.push({ path, name: node.name ?? node.displayName ?? node.label ?? '', w: s[0], h: s[1], x: pos.x, y: pos.y, z: pos.z });
  }
  for (const [key, value] of Object.entries(node)) visit(value, path ? `${path}.${key}` : key, here);
}
visit(show, '', false);

if (!found.length) {
  console.log('No he encontrado pantallas en el formato esperado. El show completo está en watchout-show.json: pásaselo a Claude.');
  process.exit(0);
}
console.log(`\n${found.length} pantallas encontradas:\n`);
for (const d of found) {
  const pos = [d.x, d.y, d.z].some((v) => v !== undefined) ? `  posición x=${d.x ?? '-'} y=${d.y ?? '-'}${d.z !== undefined ? ` z=${d.z}` : ''}` : '';
  console.log(`  ${(d.name || '(sin nombre)').padEnd(28)} ${String(d.w).padStart(5)} × ${String(d.h).padEnd(5)}${pos}`);
}
console.log('\nShow completo guardado en watchout-show.json. Copia la lista anterior y pásasela a Claude.');
