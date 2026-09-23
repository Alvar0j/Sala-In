import test from 'node:test';
import assert from 'node:assert/strict';
import { encode, decode, parseCommand } from '../src/osc.js';

test('codifica y decodifica todos los tipos', () => {
  const message = { address: '/cue/1/start', args: [
    { type: 'i', value: -5 }, { type: 'f', value: 0.5 }, { type: 's', value: 'hola' },
    { type: 'b', value: Buffer.from([1, 2, 3]) }, { type: 'T', value: true }, { type: 'N', value: null },
  ] };
  const packet = encode(message);
  assert.equal(packet.length % 4, 0);
  const decoded = decode(packet);
  assert.equal(decoded.address, '/cue/1/start');
  assert.deepEqual(decoded.args.map((a) => a.type), ['i', 'f', 's', 'b', 'T', 'N']);
  assert.equal(decoded.args[0].value, -5);
  assert.equal(decoded.args[2].value, 'hola');
  assert.deepEqual([...decoded.args[3].value], [1, 2, 3]);
});

test('mismo formato que el codec Swift para una dirección sin argumentos', () => {
  // "/go" + NUL -> 4 bytes; "," + NUL + relleno -> 4 bytes
  assert.deepEqual([...encode({ address: '/go', args: [] })], [47, 103, 111, 0, 44, 0, 0, 0]);
});

test('rechaza direcciones sin barra y paquetes truncados', () => {
  assert.throws(() => encode({ address: 'go', args: [] }));
  const packet = encode({ address: '/x', args: [{ type: 'i', value: 1 }] });
  assert.throws(() => decode(packet.subarray(0, packet.length - 2)));
});

test('interpreta comandos con argumentos', () => {
  const m = parseCommand('/cue/7/sliderLevel 0 -10.5 "dos palabras" nombre');
  assert.equal(m.address, '/cue/7/sliderLevel');
  assert.deepEqual(m.args, [{ type: 'i', value: 0 }, { type: 'f', value: -10.5 }, { type: 's', value: 'dos palabras' }, { type: 's', value: 'nombre' }]);
  assert.deepEqual(parseCommand('  /go  ').args, []);
  assert.throws(() => parseCommand('cue/1'));
  assert.throws(() => parseCommand(''));
});
