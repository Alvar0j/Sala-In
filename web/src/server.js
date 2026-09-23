// Punto de entrada: `npm start`. Variables: PORT (8080), HOST (0.0.0.0), DATA_DIR (./data).
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? '0.0.0.0';
const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(root, 'data'));

const { server } = createApp({ dataDir });
server.listen(port, host, () => {
  const addresses = Object.values(os.networkInterfaces()).flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => `http://${a.address}:${port}`);
  console.log(`Sala-In web escuchando en el puerto ${port}. Datos en ${dataDir}`);
  for (const address of addresses) console.log(`  → ${address}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
