// Modo demostración: `npm run demo`
// Arranca la web con QLab y WATCHOUT simulados y datos de ejemplo, para verla y
// retocar el aspecto sin estar en la sala. Usa su propia carpeta (data-demo) y
// puertos distintos de los reales, así que no toca la configuración de la sala.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startMockQLab } from './mock-qlab.js';
import { startMockWatchout } from './mock-watchout.js';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/auth.js';
import { normalizeConfig } from '../src/model.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data-demo');
const port = Number(process.env.PORT ?? 8080);
const QLAB_PORT = 53999;
const WATCHOUT_PORT = 3919;

const osc = (title, value) => ({ kind: 'osc', title, value });
const wo = (kind, title, value) => ({ kind, title, value });

function seed() {
  if (fs.existsSync(path.join(dataDir, 'config.json')) && !process.argv.includes('--reset')) return;
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  const write = (name, value) => fs.writeFileSync(path.join(dataDir, name), JSON.stringify(value, null, 2));
  write('settings.json', {
    qlab: { host: '127.0.0.1', port: QLAB_PORT, workspace: 'Sala', replyPort: QLAB_PORT - 1, passcode: '' },
    watchout: { host: '127.0.0.1', port: WATCHOUT_PORT },
  });
  write('users.json', [
    { id: 'DEMO-ADMIN', username: 'admin', role: 'admin', password: hashPassword('demo1234'), version: 1 },
    { id: 'DEMO-OPER', username: 'sala', role: 'operador', password: hashPassword('demo1234'), version: 1 },
  ]);
  write('config.json', normalizeConfig({
    demos: [
      {
        name: 'Cine ASTRYA', summary: 'Tráiler inmersivo en las 4 paredes con sonido Atmos.', symbol: 'film', colorHex: '#8E5CF7',
        estimatedMinutes: 4, roomConfigurationCommand: '/cue/conf-cine/start', configurationSeconds: 5,
        launch: [osc('Audio Atmos', '/cue/cine/start'), wo('watchoutPlay', 'Vídeo', '24')],
        finish: [wo('watchoutStop', 'Parar vídeo', '24'), osc('Parar audio', '/cue/cine/stop')],
        liveControls: [
          { title: 'Pausa', kind: 'watchoutPause', timelineId: '24', symbol: 'pause.fill', colorHex: '#F0A020' },
          { title: 'Continuar', kind: 'watchoutPlay', timelineId: '24', symbol: 'play.fill', colorHex: '#2EB872' },
          { title: 'Subir volumen', oscAddress: '/cue/vol-up/start', symbol: 'speaker.wave.3.fill', colorHex: '#3478F6' },
        ],
      },
      {
        name: 'Telón RMS', summary: 'Apertura con logo y telón.', symbol: 'theatermasks.fill', colorHex: '#E5484D', estimatedMinutes: 2,
        requiresLaunchConfirmation: false,
        preparation: [{ kind: 'instruction', title: 'Público', value: 'Pide al público que se sitúe en el centro de la sala.' }],
        launch: [wo('watchoutPlay', 'Telón', '3'), osc('Música', '/cue/telon/start')],
        finish: [wo('watchoutStop', 'Parar telón', '3')],
      },
      {
        name: 'Constellation: acústica variable', summary: 'Comparativa de salas con Constellation.', symbol: 'waveform', colorHex: '#18B4C9',
        estimatedMinutes: 8, roomConfigurationCommand: '/cue/const/start', configurationSeconds: 10,
        launch: [{ kind: 'confirmation', title: 'Micrófonos', value: '¿Están los micrófonos de sala encendidos?' }, osc('Preset catedral', '/cue/catedral/start')],
        liveControls: [
          { title: 'Catedral', oscAddress: '/cue/catedral/start', symbol: 'star.fill', colorHex: '#8E5CF7' },
          { title: 'Estudio', oscAddress: '/cue/estudio/start', symbol: 'music.note', colorHex: '#3478F6' },
          { title: 'Apagar', oscAddress: '/cue/const-off/start', symbol: 'power', colorHex: '#E5484D', requiresConfirmation: true },
        ],
      },
    ],
    constellationButtons: [
      { title: 'Constellation ON', oscAddress: '/cue/c-on/start', symbol: 'power', colorHex: '#2EB872' },
      { title: 'Constellation OFF', oscAddress: '/cue/c-off/start', symbol: 'power', colorHex: '#E5484D', requiresConfirmation: true },
      { title: 'Sala seca', oscAddress: '/cue/seca/start', symbol: 'drop.fill', colorHex: '#18B4C9' },
      { title: 'Sala viva', oscAddress: '/cue/viva/start', symbol: 'sparkles.rectangle.stack', colorHex: '#8E5CF7' },
    ],
  }));
}

seed();
await startMockQLab({ port: QLAB_PORT, log: () => {} });
await startMockWatchout({ port: WATCHOUT_PORT, log: () => {} });
const { server } = createApp({ dataDir });
server.listen(port, '0.0.0.0', () => {
  console.log(`\nModo demostración listo: http://localhost:${port}`);
  console.log('  Usuario admin / demo1234  (todo)   ·   sala / demo1234  (solo lanzar)');
  console.log('  QLab y WATCHOUT son simulados. `npm run demo -- --reset` restaura los datos de ejemplo.\n');
});
