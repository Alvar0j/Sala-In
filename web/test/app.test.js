// Prueba de extremo a extremo: servidor web + simuladores de QLab (UDP) y WATCHOUT (HTTP).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { startMockQLab } from '../tools/mock-qlab.js';
import { startMockWatchout } from '../tools/mock-watchout.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(check, ms = 3000) {
  const start = Date.now();
  while (Date.now() - start < ms) { if (await check()) return; await wait(25); }
  throw new Error('Tiempo agotado esperando la condición');
}

test('flujo completo con QLab y WATCHOUT simulados', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'salain-'));
  const mockQLab = await startMockQLab({ port: 0, passcode: '4321', log: () => {} });
  const mockWO = await startMockWatchout({ port: 0, log: () => {} });
  const { server, qlab } = createApp({ dataDir, loginDelayMs: 0 });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => { server.close(); mockQLab.close(); mockWO.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

  const client = () => {
    let cookie = '';
    return async (method, url, body, headers = {}) => {
      const res = await fetch(base + url, {
        method, headers: { ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
        body: method !== 'GET' ? JSON.stringify(body ?? {}) : undefined,
      });
      const setCookie = res.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      return { status: res.status, body: await res.json().catch(() => null) };
    };
  };
  const admin = client();

  // Primera puesta en marcha
  assert.equal((await admin('GET', '/api/session')).body.needsSetup, true);
  assert.equal((await admin('POST', '/api/setup', { username: 'alvaro', password: 'secreto1' })).status, 200);
  assert.equal((await admin('POST', '/api/setup', { username: 'otro', password: 'secreto1' })).status, 409);

  // Conexiones
  const settings = await admin('PUT', '/api/settings', {
    qlab: { host: '127.0.0.1', port: mockQLab.port, workspace: 'Show', replyPort: 0, passcode: '4321' },
    watchout: { host: '127.0.0.1', port: mockWO.port },
  });
  assert.equal(settings.status, 200);
  assert.equal(settings.body.qlab.passcode, undefined, 'el passcode nunca se devuelve');
  assert.equal(settings.body.qlab.hasPasscode, true);
  await until(() => qlab.ready);
  await until(async () => (await admin('GET', '/api/bootstrap')).body.state.watchout.status === 'connected');
  const boot = await admin('GET', '/api/bootstrap');
  assert.equal(boot.body.state.qlab.version, '5.4.8');
  assert.ok(boot.body.state.watchout.timelines.some((tl) => tl.name === 'Cine ASTRYA'));
  assert.ok(boot.body.state.qlab.cues.some((c) => c.name === 'Intro'));

  // Crear demo con pasos de QLab y WATCHOUT
  const created = await admin('POST', '/api/demos', {
    name: 'Cine', roomConfigurationCommand: '/cue/conf/start', configurationSeconds: 0,
    launch: [{ kind: 'osc', title: 'Audio', value: '/cue/cine/start' }, { kind: 'watchoutPlay', title: 'Vídeo', value: '24' }],
    finish: [{ kind: 'watchoutStop', title: 'Parar vídeo', value: '24' }, { kind: 'osc', title: 'Parar', value: '/cue/cine/stop' }],
    liveControls: [{ title: 'Pausa', kind: 'watchoutPause', timelineId: '24' }],
  });
  assert.equal(created.status, 200);
  const demoId = created.body.demo.id;
  const other = await admin('POST', '/api/demos', { name: 'Otra', launch: [{ kind: 'osc', title: 'Go', value: '/cue/otra/start' }] });

  // Operador: puede lanzar pero no editar
  assert.equal((await admin('POST', '/api/users', { username: 'sala', password: 'sala1234', role: 'operador' })).status, 200);
  const operator = client();
  assert.equal((await operator('POST', '/api/login', { username: 'sala', password: 'mal' })).status, 401);
  assert.equal((await operator('POST', '/api/login', { username: 'SALA', password: 'sala1234' })).status, 200);
  assert.equal((await operator('POST', '/api/demos', { name: 'x' })).status, 403);
  assert.equal((await operator('GET', '/api/settings')).status, 403);
  assert.equal((await operator('POST', `/api/demos/${demoId}/controls/${created.body.demo.liveControls[0].id}`)).status, 409, 'el mando exige la demo en curso');

  // Protección CSRF: sin JSON no se acepta
  assert.equal((await operator('POST', `/api/demos/${demoId}/launch`, {}, { 'Content-Type': 'text/plain' })).status, 415);

  // Lanzar
  assert.equal((await operator('POST', `/api/demos/${demoId}/launch`)).status, 200);
  await until(async () => (await operator('GET', '/api/bootstrap')).body.state.runner.states[demoId]?.state === 'running');
  const sent = () => mockQLab.received.map((m) => m.address);
  assert.ok(sent().includes('/cue/conf/start'));
  assert.ok(sent().includes('/cue/cine/start'));
  assert.ok(mockWO.calls.includes('POST /v0/play/24'));
  const connect = mockQLab.received.find((m) => m.address === '/workspace/Show/connect');
  assert.equal(connect.args[0].value, '4321');

  // Mando en vivo
  assert.equal((await operator('POST', `/api/demos/${demoId}/controls/${created.body.demo.liveControls[0].id}`)).status, 200);
  assert.ok(mockWO.calls.includes('POST /v0/pause/24'));

  // Lanzar otra demo finaliza la primera
  assert.equal((await operator('POST', `/api/demos/${other.body.demo.id}/launch`)).status, 200);
  await until(async () => (await operator('GET', '/api/bootstrap')).body.state.runner.states[other.body.demo.id]?.state === 'running');
  const state = (await operator('GET', '/api/bootstrap')).body.state.runner;
  assert.equal(state.states[demoId].state, 'completed');
  assert.equal(state.activeDemoId, other.body.demo.id);
  assert.ok(mockWO.calls.includes('POST /v0/stop/24'));
  assert.ok(sent().indexOf('/cue/cine/stop') < sent().indexOf('/cue/otra/start'));

  // Exportar e importar
  const exported = await admin('GET', '/api/export');
  assert.equal(exported.body.format, 'QLabRemoteCues');
  assert.equal(exported.body.demos.length, 2);
  assert.equal(JSON.stringify(exported.body).includes('4321'), false, 'el passcode no se exporta');

  // Los datos persisten en disco y los hashes no guardan la contraseña
  const users = JSON.parse(fs.readFileSync(path.join(dataDir, 'users.json'), 'utf8'));
  assert.equal(JSON.stringify(users).includes('sala1234'), false);
});
