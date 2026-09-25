import test from 'node:test';
import assert from 'node:assert/strict';
import { DemoRunner } from '../src/runner.js';
import { normalizeDemo } from '../src/model.js';

function setup(demos) {
  const sent = [];
  const qlab = { send: async (command) => { sent.push(command); } };
  const watchout = {
    play: async (id) => { sent.push(`wo:play:${id}`); }, pause: async (id) => { sent.push(`wo:pause:${id}`); },
    stopTimeline: async (id) => { sent.push(`wo:stop:${id}`); },
  };
  const list = demos.map(normalizeDemo);
  const runner = new DemoRunner({ qlab, watchout, log: () => {}, getDemo: (id) => list.find((d) => d.id === id) });
  return { runner, sent, list };
}

const step = (value, extra = {}) => ({ kind: 'osc', title: value, value, ...extra });

test('lanza una demo: configura la sala, prepara y lanza', async () => {
  const { runner, sent } = setup([{ id: 'A', name: 'A', roomConfigurationCommand: '/conf', configurationSeconds: 0,
    preparation: [step('/prep')], launch: [step('/go'), { kind: 'watchoutPlay', title: 'Vídeo', value: '24' }], finish: [step('/fin')] }]);
  await runner.launch('A', 'ana');
  assert.deepEqual(sent, ['/conf', '/prep', '/go', 'wo:play:24']);
  assert.equal(runner.stateOf('A'), 'running');
  assert.equal(runner.activeDemoId, 'A');
});

test('lanzar otra demo finaliza antes la activa', async () => {
  const { runner, sent } = setup([
    { id: 'A', name: 'A', launch: [step('/a/go')], finish: [step('/a/fin')] },
    { id: 'B', name: 'B', launch: [step('/b/go')], finish: [step('/b/fin')] },
  ]);
  await runner.launch('A', 'ana');
  await runner.launch('B', 'ana');
  assert.deepEqual(sent, ['/a/go', '/a/fin', '/b/go']);
  assert.equal(runner.stateOf('A'), 'completed');
  assert.equal(runner.stateOf('B'), 'running');
  assert.equal(runner.activeDemoId, 'B');
});

test('lanzar otra durante la cuenta atrás cancela, finaliza la primera y lanza la segunda', async () => {
  const { runner, sent } = setup([
    { id: 'A', name: 'A', roomConfigurationCommand: '/a/conf', configurationSeconds: 30, launch: [step('/a/go')], finish: [step('/a/fin')] },
    { id: 'B', name: 'B', launch: [step('/b/go')] },
  ]);
  const first = runner.launch('A', 'ana');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(runner.stateOf('A'), 'configuring');
  await runner.launch('B', 'luis');
  await first;
  assert.deepEqual(sent, ['/a/conf', '/a/fin', '/b/go']);
  assert.equal(runner.stateOf('A'), 'completed');
  assert.equal(runner.stateOf('B'), 'running');
});

test('las confirmaciones esperan respuesta y cancelar detiene la demo', async () => {
  const { runner, sent } = setup([{ id: 'A', name: 'A', launch: [step('/uno'), { kind: 'confirmation', title: '¿Seguir?', value: '¿Público sentado?' }, step('/dos')] }]);
  const job = runner.launch('A', 'ana');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(runner.prompt.text, '¿Público sentado?');
  runner.answerPrompt(runner.prompt.id, true);
  await job;
  assert.deepEqual(sent, ['/uno', '/dos']);

  const second = runner.launch('A', 'ana');
  await new Promise((r) => setTimeout(r, 10));
  runner.answerPrompt(runner.prompt.id, false);
  await second;
  assert.equal(runner.stateOf('A'), 'cancelled');
});

test('un error detiene la fase salvo que el paso permita continuar', async () => {
  const { runner, sent } = setup([{ id: 'A', name: 'A', launch: [step('/uno'), step('mal'), step('/tres')] }]);
  runner.qlab.send = async (c) => { if (!c.startsWith('/')) throw new Error('ruta no válida'); sent.push(c); };
  await runner.launch('A', 'ana');
  assert.equal(runner.stateOf('A'), 'failed');
  assert.deepEqual(sent, ['/uno']);

  const other = setup([{ id: 'B', name: 'B', launch: [step('/uno'), step('mal', { continueOnError: true }), step('/tres')] }]);
  other.runner.qlab.send = runner.qlab.send;
  other.sent.length = 0;
  await other.runner.launch('B', 'ana');
  assert.equal(other.runner.stateOf('B'), 'running');
});

test('un fallo al finalizar la demo anterior no impide lanzar la nueva', async () => {
  const { runner, sent } = setup([
    { id: 'A', name: 'A', finish: [step('/a/fin')] },
    { id: 'B', name: 'B', launch: [step('/b/go')] },
  ]);
  await runner.launch('A', 'ana');
  const send = runner.qlab.send;
  runner.qlab.send = async (c) => { if (c === '/a/fin') throw new Error('QLab caído'); return send(c); };
  await runner.launch('B', 'ana');
  assert.equal(runner.stateOf('A'), 'failed');
  assert.equal(runner.stateOf('B'), 'running');
  assert.deepEqual(sent, ['/b/go']);
});
