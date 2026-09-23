import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDemo, importPackage, exportPackage, emptyConfig, normalizeConfig } from '../src/model.js';

const iosPackage = {
  format: 'QLabRemoteCues', version: 1, exportedAt: '2026-09-01T10:00:00Z',
  profiles: [{ id: 'P1', name: 'Sala', host: '192.168.1.20', port: 53000, workspace: 'Show', localReplyPort: 53001 }],
  panels: [{ id: 'X', name: 'Principal', columns: 3, buttons: [] }],
  demos: [{
    id: 'D2', name: 'Segunda', summary: '', symbol: 'film', colorHex: '#ff0000', estimatedMinutes: 3,
    requiresLaunchConfirmation: false, preparation: [], launch: [{ id: 'S1', kind: 'osc', title: 'Go', value: '/go', delaySeconds: 1, isEnabled: true, continueOnError: false, order: 0 }],
    finish: [], liveControls: [{ id: 'C1', title: 'Play', oscAddress: '/cue/1/start', colorHex: '#3478F6', symbol: 'play.fill', requiresConfirmation: false, order: 0 }], order: 1,
  }, { id: 'D1', name: 'Primera', roomConfigurationCommand: '/cue/conf/start', preparation: [], launch: [], finish: [], liveControls: [], order: 0 }],
  constellationButtons: [{ id: 'K1', title: 'Constellation ON', oscAddress: '/cue/c/start', colorHex: '#2ECC71', symbol: 'power', requiresConfirmation: true, order: 0 }],
  powerOnCommand: '/go/200', checkSpeakersCommand: '/cue/chk/start',
};

test('importa el paquete de la app iOS respetando el orden', () => {
  const { config, profile } = importPackage(emptyConfig(), iosPackage);
  assert.deepEqual(config.demos.map((d) => d.name), ['Primera', 'Segunda']);
  assert.equal(config.demos[1].colorHex, '#FF0000');
  assert.equal(config.demos[0].roomConfigurationCommand, '/cue/conf/start');
  assert.equal(config.commands.powerOnCommand, '/go/200');
  assert.equal(config.commands.powerOffCommand, '/go/103');
  assert.equal(config.constellationButtons[0].requiresConfirmation, true);
  assert.equal(profile.host, '192.168.1.20');
});

test('exporta en el formato de la app iOS', () => {
  const { config } = importPackage(emptyConfig(), iosPackage);
  const pkg = exportPackage(config);
  assert.equal(pkg.format, 'QLabRemoteCues');
  assert.match(pkg.exportedAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  assert.equal(pkg.demos.length, 2);
  assert.equal(pkg.panels.length, 1);
  assert.equal(pkg.checkSpeakersCommand, '/cue/chk/start');
  assert.equal('kind' in pkg.demos[1].liveControls[0], false, 'los controles OSC no llevan campos extra');
  // Reimportar lo exportado da lo mismo
  assert.deepEqual(importPackage(emptyConfig(), pkg).config.demos, config.demos);
});

test('importa una demo suelta con id nuevo si ya existe', () => {
  const base = normalizeConfig({ demos: [{ id: 'D2', name: 'Existente' }] });
  const { config } = importPackage(base, iosPackage.demos[0]);
  assert.equal(config.demos.length, 2);
  assert.notEqual(config.demos[1].id, 'D2');
});

test('normaliza valores incorrectos', () => {
  const demo = normalizeDemo({ name: '  ', colorHex: 'rojo', launch: [{ kind: 'desconocido', delaySeconds: -3 }], configurationSeconds: 99999 });
  assert.equal(demo.name, 'Nueva demo');
  assert.equal(demo.colorHex, '#3478F6');
  assert.equal(demo.launch[0].kind, 'osc');
  assert.equal(demo.launch[0].delaySeconds, 0);
  assert.equal(demo.configurationSeconds, 600);
  assert.throws(() => importPackage(emptyConfig(), { hola: 1 }));
});
