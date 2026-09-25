// Modelo de datos. Mantiene el formato de QLab-Remote-Cues.qlabremote.json (app iOS)
// para poder importar y exportar entre la web y la app.
import { randomUUID } from 'node:crypto';

export const newID = () => randomUUID().toUpperCase();

export const STEP_KINDS = ['osc', 'wait', 'confirmation', 'instruction', 'watchoutPlay', 'watchoutPause', 'watchoutStop', 'presentationStart', 'presentationStop'];
export const CONTROL_KINDS = ['osc', 'watchoutPlay', 'watchoutPause', 'watchoutStop'];
export const PHASES = ['preparation', 'launch', 'finish'];

export const DEFAULT_COMMANDS = {
  powerOnCommand: '/go/104',
  powerOffCommand: '/go/103',
  checkSpeakersCommand: '/cue/check/start',
  stopCheckSpeakersCommand: '/cue/check/stop',
  resetAVBCommand: '/reset',
};
export const COMMAND_NAMES = Object.keys(DEFAULT_COMMANDS);

const str = (value, fallback = '', max = 500) => (typeof value === 'string' ? value : fallback).slice(0, max);
const num = (value, fallback, min, max) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);
const hex = (value, fallback) => (/^#[0-9A-Fa-f]{6}$/.test(value ?? '') ? value.toUpperCase() : fallback);
const id = (value) => (typeof value === 'string' && /^[\w-]{1,64}$/.test(value) ? value : newID());

function ordered(list, normalize) {
  return (Array.isArray(list) ? list : [])
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (Number(a.item?.order) || 0) - (Number(b.item?.order) || 0) || a.index - b.index)
    .map(({ item }, order) => ({ ...normalize(item ?? {}), order }));
}

export function normalizeStep(step) {
  const kind = STEP_KINDS.includes(step.kind) ? step.kind : 'osc';
  return {
    id: id(step.id), kind, title: str(step.title, 'Paso', 120), value: str(step.value, '', 2000),
    delaySeconds: num(step.delaySeconds, 1, 0, 3600), isEnabled: bool(step.isEnabled, true),
    continueOnError: bool(step.continueOnError, false),
  };
}

export function normalizeControl(control) {
  const kind = CONTROL_KINDS.includes(control.kind) ? control.kind : 'osc';
  const result = {
    id: id(control.id), title: str(control.title, 'Control', 80), oscAddress: str(control.oscAddress, '', 500),
    colorHex: hex(control.colorHex, '#3478F6'), symbol: str(control.symbol, 'play.fill', 80),
    requiresConfirmation: bool(control.requiresConfirmation, false),
  };
  // Campos exclusivos de la web (la app iOS los ignora al importar).
  if (kind !== 'osc') { result.kind = kind; result.timelineId = str(control.timelineId, '', 64); }
  return result;
}

export function normalizeDemo(demo) {
  const room = str(demo.roomConfigurationCommand, '', 500).trim();
  return {
    id: id(demo.id), name: str(demo.name, 'Nueva demo', 120).trim() || 'Nueva demo', summary: str(demo.summary, '', 1000),
    symbol: str(demo.symbol, 'sparkles.rectangle.stack', 80), colorHex: hex(demo.colorHex, '#3478F6'),
    estimatedMinutes: num(demo.estimatedMinutes, 5, 0, 600),
    requiresLaunchConfirmation: bool(demo.requiresLaunchConfirmation, true),
    ...(room ? { roomConfigurationCommand: room } : {}),
    configurationSeconds: num(demo.configurationSeconds, 10, 0, 600),
    preparation: ordered(demo.preparation, normalizeStep),
    launch: ordered(demo.launch, normalizeStep),
    finish: ordered(demo.finish, normalizeStep),
    liveControls: ordered(demo.liveControls, normalizeControl),
  };
}

export function normalizeCommands(commands = {}) {
  const result = {};
  for (const name of COMMAND_NAMES) result[name] = str(commands[name], DEFAULT_COMMANDS[name], 500).trim();
  return result;
}

export function emptyConfig() {
  return { demos: [], constellationButtons: [], commands: { ...DEFAULT_COMMANDS }, profiles: [], panels: [] };
}

export function normalizeConfig(config = {}) {
  return {
    demos: ordered(config.demos, normalizeDemo),
    constellationButtons: ordered(config.constellationButtons, normalizeControl),
    commands: normalizeCommands(config.commands),
    profiles: Array.isArray(config.profiles) ? config.profiles : [],
    panels: Array.isArray(config.panels) ? config.panels : [],
  };
}

/** Paquete compatible con AppConfigurationPackage de la app iOS. */
export function exportPackage(config) {
  return {
    format: 'QLabRemoteCues', version: 1, exportedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    profiles: config.profiles, panels: config.panels, demos: config.demos,
    constellationButtons: config.constellationButtons, ...config.commands,
  };
}

/**
 * Interpreta un archivo importado. Devuelve la nueva configuración y, si trae
 * perfiles de conexión, el primero para rellenar los ajustes de QLab.
 */
export function importPackage(current, data) {
  if (data?.format === 'QLabRemoteCues') {
    const commands = { ...current.commands };
    for (const name of COMMAND_NAMES) if (typeof data[name] === 'string') commands[name] = data[name];
    const config = normalizeConfig({
      demos: data.demos, constellationButtons: data.constellationButtons ?? [], commands,
      profiles: data.profiles ?? [], panels: data.panels ?? [],
    });
    return { config, profile: config.profiles[0] ?? null, summary: `${config.demos.length} demos, ${config.constellationButtons.length} botones de Constellation` };
  }
  if (data && typeof data === 'object' && Array.isArray(data.launch ?? data.preparation ?? data.liveControls)) {
    const demo = normalizeDemo({ ...data, id: current.demos.some((d) => d.id === data.id) ? newID() : data.id, order: current.demos.length });
    return { config: normalizeConfig({ ...current, demos: [...current.demos, demo] }), profile: null, summary: `Demo «${demo.name}» añadida` };
  }
  throw new Error('El archivo no es una configuración de QLab Remote Cues ni una demo.');
}
