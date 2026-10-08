// Constellation (Meyer NADIA): lectura de presets, recall y paso de demo, contra el simulador.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConstellationClient, parseCueCatalog, responseText } from '../src/constellation.js';
import { startMockNadia } from '../tools/mock-nadia.js';
import { createApp } from '../src/app.js';

test('lee los presets del NADIA y oculta calibración y mediciones', async (t) => {
  const mock = await startMockNadia({ port: 0, log: () => {} });
  t.after(() => mock.close());
  const logs = [];
  const client = new ConstellationClient({ log: (...entry) => logs.push(entry) });
  client.configure({ host: '127.0.0.1', port: mock.port });
  t.after(() => client.stop());
  await new Promise((resolve) => client.once('change', function check() { client.status === 'connected' ? resolve() : client.once('change', check); }));

  const names = client.groups.map((g) => g.name);
  assert.deepEqual(names, ['Constellation On/Off', 'Acoustic Presets', 'Reverberation Length']);
  const presets = client.groups.find((g) => g.name === 'Acoustic Presets');
  assert.equal(presets.confirm, true);
  assert.deepEqual(presets.cues.slice(0, 2), [{ id: '41', name: 'None' }, { id: '42', name: 'Presentación' }], '«none» repetido se quita');
  assert.equal(presets.cues.length, 9);
  assert.ok(!client.groups.find((g) => g.name === 'Reverberation Length').cues.some((c) => c.name.startsWith('---')));

  await client.run('48');
  assert.deepEqual(mock.state.recalled, [48]);
  assert.match(logs.at(-1)[1], /Sinfónica/);

  await assert.rejects(client.run('1102'), /calibración o mediciones/);
  await assert.rejects(client.run('recall cue 1 & rm'), /caracteres no válidos/);
  const reply = await client.run('recall cue 9999');
  assert.match(reply, /not found/);
  assert.deepEqual(mock.state.recalled, [48]);
});

test('responseText y parseCueCatalog con el formato real', () => {
  const html = '<head><title>Nadia Send Command</title></head><body><i>Sent Command:</i>&nbsp;<b><pre>get x</pre></b><i>Got Response:</i><br/><br/>\nGot (req-20): CueListPlayer 4 Active CueList ID = 12<br/>\n</pre></b><br><i>(End of response)</i></body>';
  assert.equal(responseText(html), 'Got (req-20): CueListPlayer 4 Active CueList ID = 12');
  const lists = 'default/cuelists/12: CoreCueList: name=[Acoustic Presets] comment=[Confirm=true refresh=false\n\n tooltip="A Performance Preset"] created=[x]\n'
    + 'default/cuelists/12/I1: CoreCueEntry: name=[] cueID=[42] timeStampFrames=[0]\ndefault/cuelists/12/I0: CoreCueEntry: name=[] cueID=[41] timeStampFrames=[0]\n'
    + 'default/cuelists/83: CoreCueList: name=[Measurements] comment=[group=Utilities]\ndefault/cuelists/83/I0: CoreCueEntry: name=[] cueID=[1102] timeStampFrames=[0]\n';
  const cues = 'default/cues/41: CoreCue: name=[None | Performance Type] comment=[Acoustic Preset]\ndefault/cues/42: CoreCue: name=[Presentación | Performance Type]\ndefault/cues/1102: CoreCue: name=[Measure Sweep | CALIBRATE]\n';
  const { groups, hiddenCues } = parseCueCatalog(lists, cues);
  assert.deepEqual(groups, [{ id: '12', name: 'Acoustic Presets', confirm: true, cues: [{ id: '41', name: 'None' }, { id: '42', name: 'Presentación' }] }]);
  assert.deepEqual([...hiddenCues], ['1102']);
});

test('una demo pone el preset al lanzar y lo quita al finalizar', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'salain-cst-'));
  const mock = await startMockNadia({ port: 0, log: () => {} });
  const { server, store, runner, constellation } = createApp({ dataDir, loginDelayMs: 0 });
  t.after(() => { server.close(); mock.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  constellation.configure({ host: '127.0.0.1', port: mock.port });
  await constellation.loadCues();
  store.saveConfig({
    ...store.config,
    demos: [{ id: 'D1', name: 'Sinfónica', requiresLaunchConfirmation: false, configurationSeconds: 0,
      launch: [{ kind: 'constellation', title: 'ON', value: '32' }, { kind: 'constellation', title: 'Sinfónica', value: '48' }],
      finish: [{ kind: 'constellation', title: 'OFF', value: '30' }] }],
  });
  runner.launch('D1', 'test');
  const until = async (check) => { for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 10)); assert.ok(check()); };
  await until(() => runner.stateOf('D1') === 'running');
  assert.deepEqual(mock.state.recalled, [32, 48]);
  runner.finish('D1', 'test');
  await until(() => runner.stateOf('D1') === 'completed');
  assert.deepEqual(mock.state.recalled, [32, 48, 30]);
});

test('botones de preset con acciones de WATCHOUT, imágenes y modo prueba', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'salain-presets-'));
  const mock = await startMockNadia({ port: 0, log: () => {} });
  const played = [];
  const watchout = Object.assign(new (await import('node:events')).EventEmitter(), {
    snapshot: () => ({ status: 'connected', timelines: [] }), configure() {}, stop() {}, setStatus() {}, loadTimelines: async () => [],
    play: async (id) => { played.push(id); }, pause: async () => {}, stopTimeline: async () => {},
  });
  const { server, constellation } = createApp({ dataDir, watchout, loginDelayMs: 0 });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => { server.close(); mock.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

  let cookie = '';
  const call = async (method, url, body, headers = {}) => {
    const res = await fetch(base + url, {
      method, headers: { ...(body !== undefined && !headers['X-Salain-Upload'] ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body === undefined ? undefined : headers['X-Salain-Upload'] ? body : JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return { status: res.status, type: res.headers.get('content-type'), body: res.headers.get('content-type')?.includes('json') ? await res.json() : await res.arrayBuffer() };
  };
  await call('POST', '/api/setup', { username: 'admin', password: 'secreto1' });
  await call('PUT', '/api/settings', { constellation: { host: '127.0.0.1', port: mock.port } });
  for (let i = 0; i < 100 && !constellation.groups.length; i++) await new Promise((r) => setTimeout(r, 10));

  // Imagen propia
  const png = Buffer.from('89504E470D0A1A0A0000000D49484452', 'hex');
  const up = await call('POST', '/api/images?name=fondo.png', png, { 'X-Salain-Upload': '1', 'Content-Type': 'application/octet-stream' });
  assert.equal(up.status, 200);
  assert.match(up.body.image, /^upload:[A-F0-9-]{36}\.png$/);
  const img = await call('GET', `/api/images/${up.body.image.slice(7)}`);
  assert.equal(img.type, 'image/png');
  assert.equal(Buffer.from(img.body).length, png.length);
  assert.equal((await call('POST', '/api/images?name=x.svg', png, { 'X-Salain-Upload': '1' })).status, 400);
  assert.equal((await call('GET', '/api/images/..%2Fusers.json')).status, 404);

  // Botón: preset Ópera + timeline 24 de WATCHOUT
  const saved = await call('PUT', '/api/presets', { buttons: [{ title: 'Ópera', cue: '47', image: up.body.image, actions: [{ kind: 'watchoutPlay', title: 'Telón', value: '24' }, { kind: 'presentationStart', value: 'x' }] }] });
  assert.equal(saved.status, 200);
  const boot = await call('GET', '/api/bootstrap');
  const [button] = boot.body.config.presetButtons;
  assert.equal(button.actions.length, 1, 'solo se guardan acciones permitidas');
  assert.equal(button.image, up.body.image);
  assert.equal((await call('POST', `/api/presets/${button.id}`, {})).status, 200);
  assert.deepEqual(mock.state.recalled, [47]);
  assert.deepEqual(played, ['24']);

  // Modo prueba: nada sale hacia los equipos
  assert.equal((await call('PUT', '/api/test-mode', { enabled: true })).body.testMode, true);
  assert.equal((await call('GET', '/api/bootstrap')).body.state.testMode, true);
  assert.equal((await call('POST', `/api/presets/${button.id}`, {})).status, 200);
  assert.equal((await call('POST', '/api/nadia/recall/42', {})).status, 200);
  assert.deepEqual(mock.state.recalled, [47]);
  assert.deepEqual(played, ['24']);
  assert.equal((await call('POST', '/api/nadia/refresh', {})).status, 409);
  await call('PUT', '/api/test-mode', { enabled: false });
  for (let i = 0; i < 100 && !constellation.groups.length; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal((await call('POST', '/api/nadia/recall/42', {})).status, 200);
  assert.deepEqual(mock.state.recalled, [47, 42]);
});
