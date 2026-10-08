// Simulador del NADIA de Constellation (dashboard en el puerto 8080, interfaz /cmd?…).
// Responde con el mismo formato HTML que el equipo real de la sala.
// Uso: node tools/mock-nadia.js [puerto]
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const LISTS = [
  { id: 11, name: 'Constellation On/Off', comment: 'Confirm=false refresh=false', cues: [30, 32, 31, 33] },
  { id: 12, name: 'Acoustic Presets', comment: 'Confirm=true refresh=false', cues: [40, 41, 42, 43, 44, 45, 46, 47, 48, 49] },
  { id: 13, name: 'Reverberation Length', comment: 'Confirm=false refresh=false details=Reverberation', cues: [500, 501, 502, 503, 504, 505, 506] },
  { id: 81, name: 'Calibration', comment: '', cues: [0, 1311] },
  { id: 83, name: 'Measurements', comment: 'tab=Details group=Utilities visible=true', cues: [1101, 1102, 1103] },
  { id: 91, name: 'StartUp', comment: '', cues: [0, 11, 20] },
  { id: 32, name: '--', comment: '', cues: [] },
];

const CUES = {
  0: 'StartUp Calibrate', 11: 'Recall Performance Type on CueList Player 4 (active Cue ID)', 20: 'System Mute = False',
  30: 'Off | Constellation', 31: 'Fade Out | Constellation', 32: 'On | Constellation', 33: 'Fade In | Constellation',
  40: 'none | Performance Type', 41: 'None | Performance Type', 42: 'Presentación | Performance Type', 43: 'Q&A | Performance Type', 44: 'Drama | Performance Type',
  45: 'Jazz | Performance Type', 46: 'Cámara | Performance Type', 47: 'Ópera | Performance Type', 48: 'Sinfónica | Performance Type',
  49: 'Coral | Performance Type', 499: '--- Length ---', 500: 'Shortest | Length', 501: 'Very Short | Length', 502: 'Short | Length',
  503: 'Medium | Length', 504: 'Long | Length', 505: 'Very Long | Length', 506: 'Longest | Length',
  1101: 'Measure BackGround Noise | CALIBRATE', 1102: 'Measure Sweep | CALIBRATE', 1103: 'Measure Pink Noise | CALIBRATE', 1311: 'Select Everything',
};

const page = (sent, lines) => `<head><title>Nadia Send Command</title>\n</head>\n<body>\n<i>Sent Command:</i>&nbsp;<b><pre>${sent}</pre></b><i>Got Response:</i><br/><br/>\n<br/>\n${lines.map((l) => `${l}<br/>\n`).join('')}</pre></b><br><i>(End of response)</i>\n</body>\n`;

export function startMockNadia({ port = 8081, log = console.log } = {}) {
  const state = { players: { 3: 30, 4: 41, 5: 503 }, recalled: [] };
  const playerOf = (cue) => (LISTS.find((l) => l.cues.includes(cue) && [11, 12, 13].includes(l.id))?.id ?? 0) - 8;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://mock');
    if (url.pathname !== '/cmd') { res.writeHead(404); return res.end('Not found'); }
    const command = decodeURIComponent(url.search.slice(1).split('&')[0]).replaceAll('_', ' ').trim();
    let lines;
    let m;
    if (command === 'print default/cuelists') {
      lines = ['default/cuelists: Node:'];
      for (const list of LISTS) {
        lines.push(`default/cuelists/${list.id}: CoreCueList: name=[${list.name}]${list.comment ? ` comment=[${list.comment}]` : ''} created=[2022/06/29 15:17:45 by mock]`);
        list.cues.forEach((cue, i) => lines.push(`default/cuelists/${list.id}/I${i}: CoreCueEntry: name=[] cueID=[${cue}] timeStampFrames=[0] autoFollowID=[-1]`));
      }
    } else if (command === 'print default/cues maxdepth=1') {
      lines = ['default/cues: Node:', ...Object.entries(CUES).map(([id, name]) => `default/cues/${id}: CoreCue: name=[${name}] comment=[] flags=[AllBitsSet] wttdChans=[]`)];
    } else if ((m = command.match(/^get CueListPlayer (\d+) Active CueList ID$/))) {
      lines = [`Got (req-1): CueListPlayer ${m[1]} Active CueList ID = ${{ 3: 11, 4: 12, 5: 13 }[m[1]] ?? -1}`];
    } else if ((m = command.match(/^recall cue (\d+)$/))) {
      const cue = Number(m[1]);
      if (!(cue in CUES)) lines = [`Error: cue ${cue} not found`];
      else { state.players[playerOf(cue)] = cue; state.recalled.push(cue); lines = []; log(`Constellation: recall cue ${cue} (${CUES[cue]})`); }
    } else {
      lines = [`Unknown command: ${command}`];
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(page(command, lines));
  });

  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => {
    resolve({ port: server.address().port, state, close: () => server.close() });
  }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mock = await startMockNadia({ port: Number(process.argv[2]) || 8081 });
  console.log(`NADIA simulado en http://127.0.0.1:${mock.port}/cmd?print_default/cuelists`);
}
