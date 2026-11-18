/**
 * Teaser "Em breve" do Vetta (vertical 1080×1920, ~15 s, sem áudio).
 *   node marketing/video/make-teaser.mjs
 * Gera out/vetta-em-breve.mp4 e out/vetta-em-breve-capa.png.
 */
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const { chromium } = createRequire(path.join(root, 'apps/web/package.json'))('@playwright/test');
const ffmpeg = createRequire(path.join(root, 'packages/server/package.json'))('ffmpeg-static');

const W = 1080;
const H = 1920;
const DURATION = 15;
const cume = '#C6F432';
const nevoa = '#F4F5F1';
const tinta = '#101418';

const V = (size, cls) =>
  `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 48 48"><polyline pathLength="1" points="7,16 19,36 41,9" fill="none" stroke="${cume}" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// Frases curtas que aparecem uma a uma (início, fim em segundos).
const LINES = [
  ['Seu método.', 1.6, 3.4],
  ['Seu aluno.', 3.4, 5.2],
  ['Sua evolução.', 5.2, 7.2],
];

const html = `<!doctype html><html><head>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@125,800&family=Inter:wght@400;600&display=block">
<style>
*{margin:0;box-sizing:border-box}
body{width:${W}px;height:${H}px;overflow:hidden;background:${tinta};color:${nevoa};font-family:Inter}
.display{font-family:Archivo;font-weight:800;font-stretch:125%;letter-spacing:-0.045em}
.abs{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.paused *{animation-play-state:paused!important}
.run *{animation-play-state:running!important}

/* Fundo: grade sutil e brilho cume que pulsa */
.grid{position:absolute;inset:-200px;background-image:linear-gradient(rgba(244,245,241,.04) 2px,transparent 2px),linear-gradient(90deg,rgba(244,245,241,.04) 2px,transparent 2px);
  background-size:120px 120px;animation:drift ${DURATION}s linear forwards}
@keyframes drift{to{transform:translateY(240px)}}
.glow{position:absolute;width:1300px;height:1300px;left:-110px;top:310px;border-radius:50%;
  background:radial-gradient(circle,rgba(198,244,50,.16),transparent 62%);opacity:0;animation:glow ${DURATION}s ease-in-out forwards}
@keyframes glow{0%{opacity:0}10%{opacity:.6}50%{opacity:.3}75%{opacity:1}100%{opacity:.8}}

/* Frases */
.line{position:absolute;font-size:120px;opacity:0;filter:blur(18px);transform:scale(1.08)}
.line.on{animation:word var(--d) cubic-bezier(.2,.8,.2,1) forwards}
@keyframes word{0%{opacity:0;filter:blur(18px);transform:scale(1.08)}18%{opacity:1;filter:blur(0);transform:scale(1)}
  82%{opacity:1;filter:blur(0);transform:scale(1)}100%{opacity:0;filter:blur(10px);transform:scale(.97)}}

/* Revelação: o V se desenha grande, encolhe e a marca aparece */
.reveal{opacity:0;animation:show .1s linear 7.4s forwards}
@keyframes show{to{opacity:1}}
.check polyline{stroke-dasharray:1;stroke-dashoffset:1;animation:draw 1.2s cubic-bezier(.65,0,.35,1) 7.5s forwards}
@keyframes draw{to{stroke-dashoffset:0}}
.mark{display:flex;align-items:center;gap:36px;transform:scale(1.6);animation:settle 1s cubic-bezier(.2,.8,.2,1) 8.8s forwards}
@keyframes settle{to{transform:scale(1)}}
.word{font-size:180px;line-height:1;opacity:0;transform:translateX(-30px);animation:in .8s cubic-bezier(.2,.8,.2,1) 9.1s forwards}
@keyframes in{to{opacity:1;transform:none}}
.soon{margin-top:90px;font-size:64px;letter-spacing:.32em;text-transform:uppercase;font-weight:600;color:${cume};
  opacity:0;animation:soon .9s cubic-bezier(.2,.8,.2,1) 10.2s forwards, pulse 2.4s ease-in-out 11.2s infinite}
@keyframes soon{from{opacity:0;letter-spacing:.6em}to{opacity:1;letter-spacing:.32em}}
@keyframes pulse{50%{opacity:.55}}
.sub{margin-top:36px;font-size:44px;color:#A3A9AF;text-align:center;line-height:1.35;opacity:0;animation:in .8s ease 11s forwards}
.url{position:absolute;bottom:170px;font-size:46px;font-weight:600;letter-spacing:.02em;opacity:0;animation:in .8s ease 11.8s forwards}
.bar{position:absolute;bottom:130px;height:6px;width:0;border-radius:3px;background:${cume};animation:bar 2.2s cubic-bezier(.65,0,.35,1) 12s forwards}
@keyframes bar{to{width:420px}}
</style></head><body class="paused">
<div class="grid"></div><div class="glow"></div>
<div class="abs">
  ${LINES.map(([t, a, b], i) => `<div class="line display on" style="--d:${b - a}s;animation-delay:${a}s;${i === LINES.length - 1 ? `color:${cume}` : ''}">${t}</div>`).join('')}
</div>
<div class="abs reveal">
  <div class="mark">${V(200, 'check')}<span class="display word">vetta</span></div>
  <div class="soon">Em breve</div>
  <div class="sub">O app de treino para personal trainers<br>e seus alunos.</div>
  <div class="url">vettafit.com.br</div>
  <div class="bar"></div>
</div>
</body></html>`;

const tmp = path.join(here, '.tmp-teaser');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  recordVideo: { dir: tmp, size: { width: W, height: H } },
});
const page = await ctx.newPage();
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
const t0 = Date.now();
await page.evaluate(() => (document.body.className = 'run'));
await page.waitForTimeout(DURATION * 1000 + 500);
const lead = (Date.now() - t0) / 1000 - DURATION;
await ctx.close();
await browser.close();

const webm = path.join(
  tmp,
  readdirSync(tmp).find((f) => f.endsWith('.webm')),
);
const probe = spawnSync(ffmpeg, ['-i', webm, '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
const last = [...probe.matchAll(/time=(\d+):(\d+):([\d.]+)/g)].pop();
const total = last ? Number(last[1]) * 3600 + Number(last[2]) * 60 + Number(last[3]) : DURATION;
const start = Math.max(0, total - DURATION - Math.max(0, lead));

const out = path.join(here, 'out');
mkdirSync(out, { recursive: true });
const mp4 = path.join(out, 'vetta-em-breve.mp4');
execFileSync(
  ffmpeg,
  [
    '-y',
    '-ss',
    start.toFixed(2),
    '-i',
    webm,
    '-t',
    String(DURATION),
    '-r',
    '30',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-preset',
    'slow',
    '-crf',
    '20',
    '-movflags',
    '+faststart',
    mp4,
  ],
  { stdio: 'ignore' },
);
execFileSync(
  ffmpeg,
  ['-y', '-ss', '13.5', '-i', mp4, '-frames:v', '1', path.join(out, 'vetta-em-breve-capa.png')],
  { stdio: 'ignore' },
);
rmSync(tmp, { recursive: true, force: true });
console.log('Vídeo:', mp4);
