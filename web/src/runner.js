// Ejecutor de demos en el servidor. Hay una única demo activa para toda la sala:
// lanzar otra demo ejecuta primero la «Finalización» de la activa.
import { EventEmitter } from 'node:events';

class Cancelled extends Error {
  constructor() { super('Cancelada'); this.name = 'Cancelled'; }
}

export class DemoRunner extends EventEmitter {
  /**
   * @param {{qlab: any, watchout: any, log: Function, getDemo: (id: string) => any}} deps
   */
  constructor({ qlab, watchout, log, getDemo }) {
    super();
    this.qlab = qlab;
    this.watchout = watchout;
    this.log = log;
    this.getDemo = getDemo;
    this.states = {};          // demoId -> {state, error, by}
    this.activeDemoId = null;
    this.currentStep = null;   // {demoId, phase, title, detail}
    this.countdown = null;     // {demoId, remaining, total}
    this.prompt = null;        // {id, kind, text, demoId}
    this.promptResolve = null;
    this.job = null;           // {controller}
    this.tail = Promise.resolve();
    this.scheduleSeq = 0;
    this.promptSeq = 0;
  }

  snapshot() {
    return {
      busy: Boolean(this.job), states: this.states, activeDemoId: this.activeDemoId, currentStep: this.currentStep,
      countdown: this.countdown, prompt: this.prompt,
    };
  }

  changed() { this.emit('change'); }

  setState(demoId, state, extra = {}) {
    this.states[demoId] = { state, ...extra };
    this.changed();
  }

  stateOf(demoId) { return this.states[demoId]?.state ?? 'idle'; }

  /** Lanza una demo. Si hay otra activa (o una tarea en curso) la finaliza antes. */
  launch(demoId, user) {
    return this.schedule(async (signal) => {
      await this.finishActive(signal, user);
      const demo = this.requireDemo(demoId);
      this.activeDemoId = demo.id;
      this.log('▶', `Demo «${demo.name}»`, `Lanzada por ${user}`);
      this.setState(demo.id, 'configuring', { by: user });
      if (demo.roomConfigurationCommand) {
        await this.execute({ kind: 'osc', title: 'Configurar sala', value: demo.roomConfigurationCommand }, demo, 'configuration', signal);
        await this.countdownFor(demo, signal);
      }
      this.setState(demo.id, 'launching', { by: user });
      await this.runSteps(demo, 'preparation', signal);
      await this.runSteps(demo, 'launch', signal);
      this.setState(demo.id, 'running', { by: user });
    }, demoId);
  }

  /** Ejecuta la Finalización de una demo (normalmente la activa). */
  finish(demoId, user) {
    return this.schedule(async (signal) => {
      const demo = this.requireDemo(demoId);
      await this.runFinish(demo, signal, user);
    }, demoId);
  }

  /** Detiene la tarea en curso sin ejecutar la Finalización. */
  async cancel(user) {
    if (!this.job) return;
    this.scheduleSeq += 1;
    this.job.controller.abort();
    await this.tail;
    this.log('■', 'Demo', `Tarea cancelada por ${user}`);
  }

  answerPrompt(promptId, accepted) {
    if (!this.prompt || this.prompt.id !== promptId) return false;
    const resolve = this.promptResolve;
    this.prompt = null;
    this.promptResolve = null;
    this.changed();
    resolve?.(Boolean(accepted));
    return true;
  }

  /** Botón del mando de una demo o de Constellation. */
  async runControl(control) {
    await this.execute(controlToStep(control), null, 'control', null);
  }

  /** Prueba un paso suelto desde el editor. */
  async testStep(step) {
    if (['confirmation', 'instruction'].includes(step.kind)) return;
    await this.execute(step, null, 'test', null);
  }

  // --- interno ---------------------------------------------------------------

  requireDemo(demoId) {
    const demo = this.getDemo(demoId);
    if (!demo) throw new Error('La demo ya no existe');
    return demo;
  }

  schedule(work, demoId) {
    // Una tarea nueva sustituye a la anterior: se cancela la actual, se espera a que
    // termine y solo se ejecuta la última pedida (si se pulsan varias seguidas).
    const token = ++this.scheduleSeq;
    this.job?.controller.abort();
    const previous = this.tail;
    const run = (async () => {
      await previous;
      if (token !== this.scheduleSeq) return;
      const controller = new AbortController();
      this.job = { controller };
      this.changed();
      try {
        await work(controller.signal);
      } catch (error) {
        const id = this.currentStep?.demoId ?? demoId;
        if (error instanceof Cancelled || controller.signal.aborted) {
          // La demo sigue marcada como activa: el siguiente lanzamiento ejecutará su Finalización.
          if (id && this.states[id] && this.stateOf(id) !== 'completed') this.setState(id, 'cancelled');
        } else {
          this.log('!', 'Demo', error.message);
          if (id) this.setState(id, 'failed', { error: error.message });
        }
      } finally {
        this.currentStep = null;
        this.countdown = null;
        if (this.promptResolve) { this.promptResolve(false); this.promptResolve = null; this.prompt = null; }
        this.job = null;
        this.changed();
      }
    })();
    this.tail = run;
    return run;
  }

  async finishActive(signal, user) {
    const activeId = this.activeDemoId;
    if (!activeId) return;
    const demo = this.getDemo(activeId);
    if (!demo) { this.activeDemoId = null; return; }
    try {
      await this.runFinish(demo, signal, user);
    } catch (error) {
      if (error instanceof Cancelled || signal.aborted) throw error;
      // Un fallo al finalizar no debe impedir lanzar la demo nueva.
      this.log('!', `Demo «${demo.name}»`, `Finalización con errores: ${error.message}`);
      this.setState(demo.id, 'failed', { error: error.message });
      this.activeDemoId = null;
    }
  }

  async runFinish(demo, signal, user) {
    this.setState(demo.id, 'finishing', { by: user });
    await this.runSteps(demo, 'finish', signal);
    this.setState(demo.id, 'completed', { by: user });
    if (this.activeDemoId === demo.id) this.activeDemoId = null;
    this.log('✓', `Demo «${demo.name}»`, 'Finalizada');
  }

  async runSteps(demo, phase, signal) {
    for (const step of demo[phase].filter((s) => s.isEnabled)) {
      if (signal.aborted) throw new Cancelled();
      try {
        await this.execute(step, demo, phase, signal);
      } catch (error) {
        if (error instanceof Cancelled || signal.aborted) throw new Cancelled();
        if (!step.continueOnError) throw new Error(`${step.title}: ${error.message}`);
        this.log('!', step.title, `${error.message} (se continúa)`);
      }
    }
  }

  async countdownFor(demo, signal) {
    const total = Math.round(demo.configurationSeconds ?? 10);
    for (let remaining = total; remaining > 0; remaining -= 1) {
      this.countdown = { demoId: demo.id, remaining, total };
      this.changed();
      await sleep(1000, signal);
    }
    this.countdown = null;
  }

  async execute(step, demo, phase, signal) {
    if (demo) {
      this.currentStep = { demoId: demo.id, phase, title: step.title, kind: step.kind };
      this.changed();
    }
    switch (step.kind) {
      case 'osc': return this.qlab.send(step.value);
      case 'wait': return sleep(Math.max(0, step.delaySeconds) * 1000, signal);
      case 'confirmation':
      case 'instruction': {
        const accepted = await this.ask(step, demo, signal);
        if (!accepted) throw new Cancelled();
        return;
      }
      case 'watchoutPlay': return this.watchout.play(step.value);
      case 'watchoutPause': return this.watchout.pause(step.value);
      case 'watchoutStop': return this.watchout.stopTimeline(step.value);
      default: throw new Error(`Tipo de paso desconocido: ${step.kind}`);
    }
  }

  ask(step, demo, signal) {
    return new Promise((resolve) => {
      this.promptSeq += 1;
      this.prompt = { id: String(this.promptSeq), kind: step.kind, title: step.title, text: step.value, demoId: demo?.id ?? null };
      this.promptResolve = resolve;
      signal?.addEventListener('abort', () => this.answerPrompt(this.prompt?.id, false), { once: true });
      this.changed();
    });
  }
}

export function controlToStep(control) {
  const kind = control.kind ?? 'osc';
  return { kind, title: control.title, value: kind === 'osc' ? control.oscAddress : control.timelineId };
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Cancelled());
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); reject(new Cancelled()); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
