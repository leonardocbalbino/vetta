/**
 * Imagens do Instagram da Vetta em marketing/instagram/out/.
 *   node marketing/instagram/make-instagram.mjs
 *
 * - perfil.png / perfil-claro.png ...... foto de perfil 1080×1080 (o Instagram recorta em círculo)
 * - logo-escuro.png / logo-claro.png ... post quadrado só com a marca
 * - o-que-seremos.png .................. post 4:5 (1080×1350) apresentando a Vetta
 * - o-que-seremos-story.png ............ a mesma mensagem em 9:16 (1080×1920) para os stories
 *
 * Cores e logo seguem a marca (CLAUDE.md §11). Cume nunca como texto sobre fundo claro.
 */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// O Playwright é dependência do app web (testes e2e).
const { chromium } = createRequire(path.join(here, '../../apps/web/package.json'))(
  '@playwright/test',
);
const out = path.join(here, 'out');
mkdirSync(out, { recursive: true });

const C = {
  tinta: '#101418',
  cume: '#C6F432',
  cobalto: '#2F5BFF',
  nevoa: '#F4F5F1',
  grafite: '#5B6168',
  linha: '#E3E5DF',
};
const FONT =
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@125,700;125,800&family=Inter:wght@400;500;600;700&display=block">';

const V = (stroke, size, extra = '') =>
  `<svg width="${size}" height="${size}" viewBox="0 0 48 48" ${extra}><polyline points="7,16 19,36 41,9" fill="none" stroke="${stroke}" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const word = (color, size) =>
  `<span style="font-family:Archivo;font-weight:800;font-stretch:125%;letter-spacing:-0.03em;color:${color};font-size:${size}px;line-height:1">vetta</span>`;
const lockup = (symbol, text, size) =>
  `<div style="display:flex;align-items:center;gap:${Math.round(size * 0.28)}px">${V(symbol, Math.round(size * 1.15))}${word(text, size)}</div>`;

const browser = await chromium.launch();

async function render(html, width, height, file) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(
    `<!doctype html><html lang="pt-BR"><head>${FONT}<style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{width:${width}px;height:${height}px;overflow:hidden;font-family:Inter,sans-serif;-webkit-font-smoothing:antialiased}
      .display{font-family:Archivo;font-stretch:125%;font-weight:800;letter-spacing:-0.045em;line-height:1.02}
    </style></head><body>${html}</body></html>`,
    { waitUntil: 'networkidle' },
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(out, file) });
  await page.close();
  console.warn('ok', file);
}

// ─── Foto de perfil: só o símbolo, centrado com folga para o recorte circular ───
const profile = (bg, fg) =>
  `<div style="width:1080px;height:1080px;background:${bg};display:flex;align-items:center;justify-content:center">
     ${V(fg, 600, 'style="margin-top:20px"')}
   </div>`;
await render(profile(C.tinta, C.cume), 1080, 1080, 'perfil.png');
await render(profile(C.cume, C.tinta), 1080, 1080, 'perfil-claro.png');

// ─── Posts da logo ───
const logoPost = (bg, symbol, text, sub) =>
  `<div style="width:1080px;height:1080px;background:${bg};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:56px;position:relative">
     ${lockup(symbol, text, 168)}
     <p style="font-size:34px;font-weight:500;color:${sub};letter-spacing:-0.01em">Seu método. Seu aluno. Sua evolução.</p>
     <p style="position:absolute;bottom:64px;font-size:26px;font-weight:600;color:${sub};letter-spacing:0.02em">vettafit.com.br</p>
   </div>`;
await render(logoPost(C.tinta, C.cume, C.nevoa, '#A9AEB4'), 1080, 1080, 'logo-escuro.png');
await render(logoPost(C.nevoa, C.tinta, C.tinta, C.grafite), 1080, 1080, 'logo-claro.png');

// ─── "O que seremos" ───
const FEATURES = [
  [
    'Treinos com vídeo no app do aluno',
    'cronômetro de descanso, carga por série e funciona sem internet',
  ],
  ['Avaliação física e anamnese', 'protocolos de dobras, bioimpedância, postural e comparativos'],
  ['Evolução que o aluno enxerga', 'gráficos de peso, medidas, cargas e fotos antes e depois'],
  ['Chat, agenda e lembretes', 'tudo com o aluno num lugar só, sem perder mensagem'],
  ['Cobrança automática', 'Pix, boleto e cartão, com aviso de atraso'],
  ['A sua marca na frente', 'página de vendas, logo e cores do seu jeito'],
];

const check = `<div style="flex:none;width:44px;height:44px;border-radius:12px;background:${C.cume};display:flex;align-items:center;justify-content:center">${V(C.tinta, 28)}</div>`;

const featureList = (gap) =>
  FEATURES.map(
    ([t, d]) => `<li style="display:flex;gap:22px;align-items:flex-start">
      ${check}
      <div style="display:flex;flex-direction:column;gap:6px;padding-top:2px">
        <span style="font-size:31px;font-weight:700;color:${C.nevoa};letter-spacing:-0.01em">${t}</span>
        <span style="font-size:24px;font-weight:400;color:#A9AEB4;line-height:1.35">${d}</span>
      </div>
    </li>`,
  ).join(`<li style="height:${gap}px"></li>`);

const pill = `<span style="display:inline-flex;align-items:center;gap:12px;background:${C.cume};color:${C.tinta};font-weight:700;font-size:24px;letter-spacing:0.08em;padding:12px 22px;border-radius:999px">
  <span style="width:10px;height:10px;border-radius:50%;background:${C.tinta}"></span>EM BREVE</span>`;

// Marca d'água: V grande e discreto atrás do conteúdo.
const watermark = (size, right, top) =>
  `<div style="position:absolute;right:${right}px;top:${top}px;opacity:0.06">${V(C.cume, size)}</div>`;

const announce = ({ width, height, pad, headline, listGap, footerGap }) =>
  `<div style="position:relative;width:${width}px;height:${height}px;background:${C.tinta};padding:${pad}px;display:flex;flex-direction:column;overflow:hidden">
     ${watermark(width * 0.95, -width * 0.32, -height * 0.06)}
     <div style="position:relative;display:flex;justify-content:space-between;align-items:center">
       ${lockup(C.cume, C.nevoa, 46)}
       ${pill}
     </div>
     <h1 class="display" style="position:relative;margin-top:${headline.top}px;font-size:${headline.size}px;color:${C.nevoa}">
       Seu método.<br>Seu aluno.<br><span style="color:${C.cume}">Sua evolução.</span>
     </h1>
     <p style="position:relative;margin-top:28px;font-size:30px;line-height:1.4;color:#C9CDD2;max-width:880px">
       A plataforma completa para personal trainers: prescreva, acompanhe e cobre seus alunos num lugar só.
     </p>
     <ul style="position:relative;list-style:none;margin-top:${listGap.top}px;display:flex;flex-direction:column">
       ${featureList(listGap.item)}
     </ul>
     <div style="position:relative;margin-top:auto;padding-top:${footerGap}px;display:flex;justify-content:space-between;align-items:center;border-top:2px solid rgba(244,245,241,0.12)">
       <span style="font-size:27px;font-weight:600;color:${C.nevoa}">Comece grátis no lançamento</span>
       <span style="font-size:27px;font-weight:700;color:${C.cume}">vettafit.com.br</span>
     </div>
   </div>`;

await render(
  announce({
    width: 1080,
    height: 1350,
    pad: 72,
    headline: { top: 64, size: 92 },
    listGap: { top: 48, item: 22 },
    footerGap: 32,
  }),
  1080,
  1350,
  'o-que-seremos.png',
);

// Stories: margens maiores em cima e embaixo (área da barra de perfil e da resposta).
await render(
  announce({
    width: 1080,
    height: 1920,
    pad: 84,
    headline: { top: 150, size: 108 },
    listGap: { top: 72, item: 34 },
    footerGap: 40,
  }).replace(`padding:84px`, `padding:200px 84px 230px`),
  1080,
  1920,
  'o-que-seremos-story.png',
);

await browser.close();
