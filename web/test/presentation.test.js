import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Presenter, KeynoteDriver } from '../src/presenter.js';
import { createApp } from '../src/app.js';
import { sanitizeName } from '../src/files.js';
import { startMockWatchout } from '../tools/mock-watchout.js';

test('el reproductor simulado avanza, retrocede y se detiene', async () => {
  const logs = [];
  const presenter = new Presenter({ log: (...a) => logs.push(a) });
  await presenter.open({ id: 'F1', name: 'Charla.key', path: '/tmp/x.key' }, 'D1');
  assert.equal(presenter.state.status, 'playing');
  assert.equal(presenter.state.total, 12);
  await presenter.next(); await presenter.next(); await presenter.previous();
  assert.equal(presenter.state.slide, 2);
  await presenter.goto(10);
  assert.equal(presenter.state.slide, 10);
  await assert.rejects(presenter.goto(99), /fuera de rango/);
  await presenter.stop();
  assert.equal(presenter.state.status, 'idle');
  await assert.rejects(presenter.next(), /No hay ninguna presentación/);
});

test('el controlador de Keynote pasa la ruta como argumento, no dentro del script', async () => {
  const calls = [];
  const exec = async (lines, args = []) => {
    calls.push({ script: lines.join('\n'), args });
    if (lines.join('\n').includes('count of slides of theDoc) as text\n')) return '8';
    return lines.join('\n').includes('slide number') ? '3/8' : '';
  };
  const driver = new KeynoteDriver({ exec });
  const evil = '/tmp/a" & (do shell script "rm -rf ~") & ".key';
  const { total } = await driver.open(evil);
  assert.equal(total, 8);
  assert.equal(calls[0].args[0], evil);
  assert.equal(calls[0].script.includes('rm -rf'), false);
  assert.match(calls[0].script, /start theDoc from first slide/);
  await driver.next();
  assert.match(calls[1].script, /show next/);
  assert.deepEqual(await driver.status(), { playing: true, slide: 3, total: 8 });
});

test('limpia nombres de archivo peligrosos', () => {
  assert.equal(sanitizeName('../../etc/passwd.key'), 'passwd.key');
  assert.equal(sanitizeName('C:\\\\Users\\\\x\\\\Charla final.pptx'), 'Charla final.pptx');
  assert.equal(sanitizeName('a<b>:c.key'), 'a_b_c.key');
  assert.throws(() => sanitizeName('...'));
});

test('subir una presentación, crear la demo, lanzarla y controlarla', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'salain-p-'));
  const mockWO = await startMockWatchout({ port: 0, log: () => {} });
  const { server } = createApp({ dataDir, loginDelayMs: 0 });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => { server.close(); mockWO.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

  let cookie = '';
  const call = async (method, url, body, headers = {}) => {
    const res = await fetch(base + url, {
      method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(typeof body === 'object' && !(body instanceof Uint8Array) ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body === undefined ? (method === 'GET' ? undefined : '{}') : body instanceof Uint8Array ? body : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const json = { 'Content-Type': 'application/json' };
  await call('POST', '/api/setup', { username: 'admin', password: 'secreto1' });
  await call('PUT', '/api/settings', { watchout: { host: '127.0.0.1', port: mockWO.port }, presentation: { driver: 'simulado', watchoutTimelineId: '30' } });

  const bytes = new Uint8Array(Buffer.from('PK\u0003\u0004 contenido de prueba'));
  const upload = { 'X-Salain-Upload': '1', 'Content-Type': 'application/octet-stream' };
  assert.equal((await call('POST', '/api/files?name=malo.exe', bytes, upload)).status, 415);
  assert.equal((await call('POST', '/api/files?name=charla.pptx', bytes, { 'Content-Type': 'application/octet-stream' })).status, 415, 'sin la cabecera de subida se rechaza (CSRF)');
  const uploaded = await call('POST', '/api/files?name=Charla%20RMS.pptx', bytes, upload);
  assert.equal(uploaded.status, 200);
  assert.equal(uploaded.body.file.name, 'Charla RMS.pptx');
  assert.equal(uploaded.body.file.size, bytes.length);
  assert.equal((await call('GET', '/api/files')).body.files.length, 1);

  const created = await call('POST', '/api/presentations', { fileId: uploaded.body.file.id });
  assert.equal(created.status, 200);
  const demo = created.body.demo;
  assert.equal(demo.name, 'Charla RMS');
  assert.deepEqual(demo.launch.map((s) => s.kind), ['presentationStart', 'watchoutPlay']);
  assert.deepEqual(demo.finish.map((s) => s.kind), ['watchoutStop', 'presentationStop']);

  await call('POST', `/api/demos/${demo.id}/launch`, {}, json);
  const state = async () => (await call('GET', '/api/bootstrap')).body.state;
  for (let i = 0; i < 100 && (await state()).runner.states[demo.id]?.state !== 'running'; i++) await new Promise((r) => setTimeout(r, 20));
  let s = await state();
  assert.equal(s.presentation.status, 'playing');
  assert.equal(s.presentation.demoId, demo.id);
  assert.ok(mockWO.calls.includes('POST /v0/play/30'));

  assert.equal((await call('POST', '/api/presentation/next', {}, json)).body.presentation.slide, 2);
  assert.equal((await call('POST', '/api/presentation/goto', { slide: 7 }, json)).body.presentation.slide, 7);
  assert.equal((await call('POST', '/api/presentation/previous', {}, json)).body.presentation.slide, 6);
  assert.equal((await call('DELETE', `/api/files/${uploaded.body.file.id}`, {}, json)).status, 409, 'no se borra mientras se reproduce');

  await call('POST', `/api/demos/${demo.id}/finish`, {}, json);
  for (let i = 0; i < 100 && (await state()).runner.states[demo.id]?.state !== 'completed'; i++) await new Promise((r) => setTimeout(r, 20));
  s = await state();
  assert.equal(s.presentation.status, 'idle');
  assert.ok(mockWO.calls.includes('POST /v0/stop/30'));
  assert.equal((await call('POST', '/api/presentation/next', {}, json)).status, 409);

  assert.equal((await call('DELETE', `/api/files/${uploaded.body.file.id}`, {}, json)).status, 200);
  assert.equal(fs.readdirSync(path.join(dataDir, 'files')).length, 0);
});

test('un .zip con un paquete .key se descomprime y se reproduce el .key', { skip: !fs.existsSync('/usr/bin/unzip') && process.platform !== 'darwin' }, async () => {
  const { FileStore } = await import('../src/files.js');
  const { execFileSync } = await import('node:child_process');
  const { Readable } = await import('node:stream');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'salain-zip-'));
  fs.mkdirSync(path.join(work, 'src', 'Charla.key', 'Data'), { recursive: true });
  fs.writeFileSync(path.join(work, 'src', 'Charla.key', 'Index.zip'), 'x');
  execFileSync('zip', ['-qr', path.join(work, 'charla.zip'), 'Charla.key'], { cwd: path.join(work, 'src') });
  const store = new FileStore(path.join(work, 'data'));
  const req = Readable.from([fs.readFileSync(path.join(work, 'charla.zip'))]);
  req.headers = {};
  const file = await store.upload(req, { name: 'charla.zip', user: 'test' });
  assert.equal(file.kind, 'keynote');
  assert.match(store.get(file.id).playPath, /Charla\.key$/);
  fs.rmSync(work, { recursive: true, force: true });
});
