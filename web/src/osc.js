// Codec OSC 1.0 (mismo comportamiento que QLabRemoteCues/Models/OSC.swift).

export const MAX_PACKET_SIZE = 65_507;

export class OSCError extends Error {}

const padding = (count) => (4 - (count % 4)) % 4;

function paddedString(value) {
  if (value.includes('\0')) throw new OSCError('Texto OSC no válido.');
  const bytes = Buffer.from(value, 'utf8');
  const total = bytes.length + 1;
  return Buffer.concat([bytes, Buffer.alloc(1 + padding(total))]);
}

/**
 * @typedef {{type: 'i'|'f'|'s'|'b'|'T'|'F'|'N'|'I', value?: any}} OSCArgument
 * @typedef {{address: string, args: OSCArgument[]}} OSCMessage
 */

/** @param {OSCMessage} message */
export function encode(message) {
  const { address, args = [] } = message;
  if (typeof address !== 'string' || address[0] !== '/' || address.includes('\0')) {
    throw new OSCError('Dirección OSC no válida.');
  }
  const parts = [paddedString(address), paddedString(',' + args.map((a) => a.type).join(''))];
  for (const arg of args) {
    switch (arg.type) {
      case 'i': {
        const b = Buffer.alloc(4); b.writeInt32BE(arg.value | 0); parts.push(b); break;
      }
      case 'f': {
        const b = Buffer.alloc(4); b.writeFloatBE(Number(arg.value)); parts.push(b); break;
      }
      case 's': parts.push(paddedString(String(arg.value))); break;
      case 'b': {
        const data = Buffer.from(arg.value);
        const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
        parts.push(size, data, Buffer.alloc(padding(data.length)));
        break;
      }
      case 'T': case 'F': case 'N': case 'I': break;
      default: throw new OSCError(`Tipo OSC no soportado: ${arg.type}.`);
    }
  }
  const packet = Buffer.concat(parts);
  if (packet.length > MAX_PACKET_SIZE) throw new OSCError('Paquete OSC demasiado grande.');
  return packet;
}

function readString(data, cursor) {
  const end = data.indexOf(0, cursor);
  if (end < 0) throw new OSCError('Texto OSC no válido.');
  const value = data.toString('utf8', cursor, end);
  const length = end - cursor + 1;
  const next = cursor + length + padding(length);
  if (next > data.length) throw new OSCError('Paquete OSC incompleto.');
  return [value, next];
}

/** @returns {OSCMessage} */
export function decode(data) {
  if (!data.length || data.length > MAX_PACKET_SIZE) throw new OSCError('Paquete OSC demasiado grande.');
  let cursor = 0;
  let address, tags;
  [address, cursor] = readString(data, cursor);
  if (address[0] !== '/') throw new OSCError('Dirección OSC no válida.');
  [tags, cursor] = readString(data, cursor);
  if (tags[0] !== ',') throw new OSCError('Paquete OSC incompleto.');
  const args = [];
  const need = (n) => { if (cursor + n > data.length) throw new OSCError('Paquete OSC incompleto.'); };
  for (const tag of tags.slice(1)) {
    switch (tag) {
      case 'i': need(4); args.push({ type: 'i', value: data.readInt32BE(cursor) }); cursor += 4; break;
      case 'f': need(4); args.push({ type: 'f', value: data.readFloatBE(cursor) }); cursor += 4; break;
      case 's': { let v; [v, cursor] = readString(data, cursor); args.push({ type: 's', value: v }); break; }
      case 'b': {
        need(4);
        const count = data.readUInt32BE(cursor); cursor += 4;
        need(count);
        args.push({ type: 'b', value: data.subarray(cursor, cursor + count) });
        cursor += count + padding(count);
        if (cursor > data.length) throw new OSCError('Paquete OSC incompleto.');
        break;
      }
      case 'T': args.push({ type: 'T', value: true }); break;
      case 'F': args.push({ type: 'F', value: false }); break;
      case 'N': args.push({ type: 'N', value: null }); break;
      case 'I': args.push({ type: 'I' }); break;
      default: throw new OSCError(`Tipo OSC no soportado: ${tag}.`);
    }
  }
  return { address, args };
}

/**
 * Convierte un comando escrito por el usuario en un mensaje OSC.
 * "/cue/1/start" -> sin argumentos.
 * "/cue/1/sliderLevel 0 -10.5 \"texto con espacios\"" -> i, f, s.
 */
export function parseCommand(text) {
  const source = String(text ?? '').trim();
  const tokens = [];
  const pattern = /"((?:[^"\\]|\\.)*)"|(\S+)/g;
  let match;
  while ((match = pattern.exec(source))) {
    tokens.push(match[1] !== undefined ? { quoted: true, text: match[1].replace(/\\(.)/g, '$1') } : { quoted: false, text: match[2] });
  }
  if (!tokens.length || tokens[0].quoted || tokens[0].text[0] !== '/') {
    throw new OSCError('La ruta OSC debe comenzar por /.');
  }
  const args = tokens.slice(1).map(({ quoted, text: t }) => {
    if (quoted) return { type: 's', value: t };
    if (/^[-+]?\d+$/.test(t)) return { type: 'i', value: Number.parseInt(t, 10) };
    if (/^[-+]?(\d+\.\d*|\.\d+|\d+)(e[-+]?\d+)?$/i.test(t)) return { type: 'f', value: Number.parseFloat(t) };
    if (t === 'true') return { type: 'T', value: true };
    if (t === 'false') return { type: 'F', value: false };
    return { type: 's', value: t };
  });
  return { address: tokens[0].text, args };
}
