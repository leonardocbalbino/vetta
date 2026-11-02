/**
 * Vídeo promocional do Vetta (vertical 1080×1920, ~30 s, sem áudio).
 *   node marketing/video/make-promo.mjs <senha-dos-usuarios-de-exemplo> [https://app.vettafit.com.br]
 *
 * 1. Fotografa telas reais do sistema (dados de exemplo da homologação) em tamanho de celular.
 * 2. Monta as cenas em HTML com as cores e fontes da marca e grava no navegador.
 * 3. Converte para MP4 (H.264) com o ffmpeg do projeto.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const req = createRequire(path.join(root, 'apps/web/package.json'));
const { chromium } = req('@playwright/test');
const ffmpeg = createRequire(path.join(root, 'packages/server/package.json'))('ffmpeg-static');

const PASSWORD = process.argv[2];
const WEB = process.argv[3] ?? 'https://app.vettafit.com.br';
const API = WEB.replace('://app.', '://api.');
if (!PASSWORD) throw new Error('Informe a senha dos usuários de exemplo.');

const W = 1080;
const H = 1920;
const browser = await chromium.launch();

// ─── 1. Telas reais ─────────────────────────────────────────────────────────
async function session(user) {
  const tokens = await (
    await fetch(`${API}/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `${user}@vettafit.dev`, password: PASSWORD }),
    })
  ).json();
  const me = await (
    await fetch(`${API}/v1/me`, { headers: { authorization: `Bearer ${tokens.accessToken}` } })
  ).json();
  return { tokens, tenantId: me.memberships[0].tenantId };
}

async function capture(s, url, theme = 'light') {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await ctx.addInitScript(
    ([t, tid, th]) => {
      localStorage.setItem('vetta:tokens', JSON.stringify(t));
      localStorage.setItem('vetta:tenant', tid);
      localStorage.setItem('theme', th);
    },
    [s.tokens, s.tenantId, theme],
  );
  const page = await ctx.newPage();
  await page.goto(`${WEB}${url}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const png = (await page.screenshot()).toString('base64');
  await ctx.close();
  return `data:image/png;base64,${png}`;
}

const personal = await session('proplus');
const aluno = await session('aluno01');
const shots = {
  inicio: await capture(personal, '/inicio'),
  ia: await capture(personal, '/treinos/ia'),
  treino: await capture(aluno, '/treino'),
  evolucao: await capture(aluno, '/evolucao'),
  agenda: await capture(personal, '/agenda', 'dark'),
};
console.log('telas capturadas');

// ─── 2. Cenas ───────────────────────────────────────────────────────────────
const C = { tinta: '#101418', cume: '#C6F432', cobalto: '#2F5BFF', nevoa: '#F4F5F1' };
const V = (size, color = C.cume, cls = '') =>
  `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 48 48"><polyline pathLength="1" points="7,16 19,36 41,9" fill="none" stroke="${color}" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// [início, fim] de cada cena em segundos.
const T = {
  logo: [0, 3.2],
  slogan: [3.2, 6.6],
  s1: [6.6, 10.6],
  s2: [10.6, 14.6],
  s3: [14.6, 18.6],
  s4: [18.6, 22.6],
  s5: [22.6, 26.2],
  cta: [26.2, 31],
};
const DURATION = 31;

const phone = (img, from) => `
  <div class="phone" style="animation-delay:${from + 0.15}s">
    <img src="${img}">
  </div>`;

const feature = (key, kicker, title, accent, img) => {
  const [a, b] = T[key];
  return `
  <section class="scene" style="animation-delay:${a}s;--dur:${b - a}s">
    <div class="kicker" style="animation-delay:${a + 0.05}s">${kicker}</div>
    <h2 class="title" style="animation-delay:${a + 0.1}s">${title}<br><span>${accent}</span></h2>
    ${phone(img, a)}
  </section>`;
};

const html = `<!doctype html><html><head>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@125,700;125,800&family=Inter:wght@400;600&display=block">
<style>
*{margin:0;box-sizing:border-box}
body{width:${W}px;height:${H}px;overflow:hidden;background:${C.tinta};color:${C.nevoa};font-family:Inter}
.display{font-family:Archivo;font-weight:800;font-stretch:125%;letter-spacing:-0.045em}
.scene{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;padding-top:150px;opacity:0;
  animation:scene var(--dur) linear forwards;animation-play-state:paused}
@keyframes scene{0%{opacity:0}6%{opacity:1}92%{opacity:1}100%{opacity:0}}
.kicker{font-weight:600;font-size:34px;color:${C.cume};letter-spacing:.08em;text-transform:uppercase;opacity:0;
  animation:up .7s cubic-bezier(.2,.8,.2,1) forwards;animation-play-state:paused}
.title{margin-top:24px;text-align:center;font-family:Archivo;font-weight:800;font-stretch:125%;letter-spacing:-0.045em;
  font-size:84px;line-height:1.05;opacity:0;animation:up .8s cubic-bezier(.2,.8,.2,1) forwards;animation-play-state:paused}
.title span{color:${C.cume}}
.phone{margin-top:90px;width:700px;height:1300px;border-radius:72px;overflow:hidden;border:14px solid #2A3036;
  box-shadow:0 40px 120px rgba(0,0,0,.6),0 0 0 2px rgba(198,244,50,.15);opacity:0;
  animation:phone 1s cubic-bezier(.2,.8,.2,1) forwards;animation-play-state:paused}
.phone img{width:100%;display:block;animation:scroll 3.6s ease-in-out .8s forwards;animation-play-state:paused}
@keyframes up{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:none}}
@keyframes phone{from{opacity:0;transform:translateY(220px) scale(.94)}to{opacity:1;transform:none}}
@keyframes scroll{from{transform:translateY(0)}to{transform:translateY(-8%)}}
.check polyline{stroke-dasharray:1;stroke-dashoffset:1;animation:draw 1.1s cubic-bezier(.65,0,.35,1) .3s forwards;animation-play-state:paused}
@keyframes draw{to{stroke-dashoffset:0}}
.word{opacity:0;animation:up .8s cubic-bezier(.2,.8,.2,1) 1.1s forwards;animation-play-state:paused}
.center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:40px}
.line{font-size:110px;line-height:1.05;text-align:center;opacity:0;animation:up .7s cubic-bezier(.2,.8,.2,1) forwards;animation-play-state:paused}
.chips{display:flex;flex-wrap:wrap;justify-content:center;gap:24px;max-width:900px;margin-top:80px}
.chip{font-size:44px;font-weight:600;padding:22px 40px;border-radius:999px;background:#1B2127;border:2px solid #2A3036;opacity:0;
  animation:up .6s cubic-bezier(.2,.8,.2,1) forwards;animation-play-state:paused}
.chip b{color:${C.cume}}
.cta{background:${C.cume};color:${C.tinta};font-size:56px;font-weight:600;padding:36px 64px;border-radius:28px;opacity:0;
  animation:up .7s cubic-bezier(.2,.8,.2,1) forwards;animation-play-state:paused}
.glow{position:absolute;width:1400px;height:1400px;border-radius:50%;background:radial-gradient(circle,rgba(198,244,50,.10),transparent 60%);
  left:-160px;top:260px;pointer-events:none}
.paused *{animation-play-state:paused!important}
.run *{animation-play-state:running!important}
</style></head><body class="paused"><div class="glow"></div>

<!-- Logo -->
<section class="scene" style="animation-delay:${T.logo[0]}s;--dur:${T.logo[1] - T.logo[0]}s">
  <div class="center">
    <div style="display:flex;align-items:center;gap:40px">
      ${V(220, C.cume, 'check')}
      <span class="display word" style="font-size:200px;line-height:1">vetta</span>
    </div>
  </div>
</section>

<!-- Slogan -->
<section class="scene" style="animation-delay:${T.slogan[0]}s;--dur:${T.slogan[1] - T.slogan[0]}s">
  <div class="center">
    <div class="display line" style="animation-delay:${T.slogan[0] + 0.1}s">Seu método.</div>
    <div class="display line" style="animation-delay:${T.slogan[0] + 0.8}s">Seu aluno.</div>
    <div class="display line" style="animation-delay:${T.slogan[0] + 1.5}s;color:${C.cume}">Sua evolução.</div>
  </div>
</section>

${feature('s1', 'Para o personal', 'Todos os seus alunos', 'num só lugar', shots.inicio)}
${feature('s2', 'IA de treino', 'Treinos montados com IA,', 'revisados por você', shots.ia)}
${feature('s3', 'Para o aluno', 'Treino do dia no bolso,', 'até sem internet', shots.treino)}
${feature('s4', 'Resultados', 'Evolução que', 'dá para ver', shots.evolucao)}

<!-- Tudo o mais -->
<section class="scene" style="animation-delay:${T.s5[0]}s;--dur:${T.s5[1] - T.s5[0]}s">
  <div class="kicker" style="animation-delay:${T.s5[0] + 0.05}s">E muito mais</div>
  <h2 class="title" style="animation-delay:${T.s5[0] + 0.1}s">Tudo do seu negócio<br><span>no mesmo app</span></h2>
  <div class="chips">
    ${[
      '<b>Agenda</b> e aulas',
      'Chat com <b>áudio</b>',
      'Cobrança por <b>Pix</b>',
      '<b>Avaliação</b> física',
      'Sua <b>marca</b>',
      'Página de <b>vendas</b>',
      '<b>Equipe</b>',
      '<b>Relatórios</b>',
    ]
      .map(
        (c, i) =>
          `<div class="chip" style="animation-delay:${T.s5[0] + 0.4 + i * 0.18}s">${c}</div>`,
      )
      .join('')}
  </div>
</section>

<!-- Chamada -->
<section class="scene" style="animation-delay:${T.cta[0]}s;--dur:${T.cta[1] - T.cta[0] + 1}s">
  <div class="center">
    <div style="display:flex;align-items:center;gap:28px">
      ${V(150, C.cume, 'check')}<span class="display word" style="font-size:130px;line-height:1;animation-delay:${T.cta[0] + 0.6}s">vetta</span>
    </div>
    <div class="display line" style="font-size:76px;animation-delay:${T.cta[0] + 0.9}s">Comece grátis hoje</div>
    <div class="line" style="font-size:44px;font-family:Inter;color:#A3A9AF;animation-delay:${T.cta[0] + 1.2}s">14 dias do Pro Plus, sem cartão</div>
    <div class="cta" style="animation-delay:${T.cta[0] + 1.6}s">vettafit.com.br</div>
  </div>
</section>
</body></html>`;

// ─── 3. Gravação e conversão ────────────────────────────────────────────────
const tmp = path.join(here, '.tmp');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  recordVideo: { dir: tmp, size: { width: W, height: H } },
});
const page = await ctx.newPage();
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
// Imagens decodificadas antes de soltar a animação (evita quadros vazios no começo).
await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
const startedAt = Date.now();
await page.evaluate(() => (document.body.className = 'run'));
await page.waitForTimeout(DURATION * 1000 + 600);
const lead = (Date.now() - startedAt) / 1000 - DURATION; // folga gravada no fim
await ctx.close();
await browser.close();

const webm = path.join(
  tmp,
  readdirSync(tmp).find((f) => f.endsWith('.webm')),
);
const outDir = path.join(here, 'out');
mkdirSync(outDir, { recursive: true });
const mp4 = path.join(outDir, 'vetta-promo-vertical.mp4');
// O começo da gravação inclui o carregamento da página: corta pela duração a partir do fim.
const probe = spawnSync(ffmpeg, ['-i', webm, '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
const last = [...probe.matchAll(/time=(\d+):(\d+):([\d.]+)/g)].pop();
const total = last ? Number(last[1]) * 3600 + Number(last[2]) * 60 + Number(last[3]) : DURATION;
const start = Math.max(0, total - DURATION - Math.max(0, lead));
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
// Capa para o post (quadro da chamada final).
execFileSync(
  ffmpeg,
  [
    '-y',
    '-ss',
    String(DURATION - 1.5),
    '-i',
    mp4,
    '-frames:v',
    '1',
    path.join(outDir, 'vetta-promo-capa.png'),
  ],
  { stdio: 'ignore' },
);
rmSync(tmp, { recursive: true, force: true });
console.log('Vídeo:', mp4);
