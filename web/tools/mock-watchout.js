// Simulador mínimo de la API HTTP de WATCHOUT 7 (Director, puerto 3019).
// Uso: npm run mock:watchout  (PORT=3019 opcional)
import http from 'node:http';

export function startMockWatchout({ port = 3019, log = console.log } = {}) {
  const timelines = [
    { id: 24, name: 'Cine ASTRYA' }, { id: 3, name: 'Telón RMS' }, { id: 27, name: 'SFDK' }, { id: 1, name: 'Curso RMS' },
  ];
  const state = {};
  const calls = [];
  const server = http.createServer((req, res) => {
    calls.push(`${req.method} ${req.url}`);
    log(`${req.method} ${req.url}`);
    const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.method === 'GET' && req.url === '/info') return send(200, { version: '7.8.4 (simulador)' });
    if (req.method === 'GET' && req.url === '/v0/timelines') return send(200, timelines);
    if (req.method === 'GET' && req.url === '/v0/state') return send(200, state);
    const match = req.url.match(/^\/v0\/(play|pause|stop)\/(\w+)/);
    if (req.method === 'POST' && match) {
      if (!timelines.some((t) => String(t.id) === match[2])) return send(404, { error: 'timeline not found' });
      state[match[2]] = match[1];
      return send(200, {});
    }
    send(404, { error: 'not found' });
  });
  return new Promise((resolve) => server.listen(port, () => resolve({ server, calls, port: server.address().port, close: () => server.close() })));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 3019);
  startMockWatchout({ port }).then(() => console.log(`Mock WATCHOUT escuchando en http://localhost:${port}`));
}
