/**
 * Gera as imagens da ficha da Google Play em apps/mobile/store/android/.
 *   node apps/mobile/store/generate.mjs [https://app.vettafit.com.br] [senha-dos-usuarios-de-exemplo]
 *
 * - icon-512.png ............ ícone da ficha (512×512)
 * - feature-graphic.png ..... imagem de destaque (1024×500)
 * - screenshots/0N-*.png .... capturas de celular 1080×1920 com título
 *
 * As capturas vêm do sistema web em tamanho de celular (mesmo layout e dados do app).
 * Troque pelas capturas do app real assim que houver o primeiro build interno.
 */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// O Playwright é dependência do app web (testes e2e).
const { chromium } = createRequire(path.join(here, '../../web/package.json'))('@playwright/test');
const out = path.join(here, 'android');
mkdirSync(path.join(out, 'screenshots'), { recursive: true });

const WEB = process.argv[2] ?? 'https://app.vettafit.com.br';
const API = WEB.replace('://app.', '://api.');
const PASSWORD = process.argv[3];

const C = {
  tinta: '#101418',
  cume: '#C6F432',
  cobalto: '#2F5BFF',
  nevoa: '#F4F5F1',
  grafite: '#5B6168',
};
const FONT =
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@125,700;125,800&family=Inter:wght@400;600&display=block">';
const V = (stroke, size) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 48 48"><polyline points="7,16 19,36 41,9" fill="none" stroke="${stroke}" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const word = (color, size) =>
  `<span style="font-family:Archivo;font-weight:800;font-stretch:125%;letter-spacing:-0.03em;color:${color};font-size:${size}px;line-height:1">vetta</span>`;

const browser = await chromium.launch();

async function render(html, width, height, file) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(
    `<!doctype html><html><head>${FONT}<style>*{margin:0;box-sizing:border-box}body{width:${width}px;height:${height}px;overflow:hidden}</style></head><body>${html}</body></html>`,
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(out, file) });
  await page.close();
}

// Ícone da ficha: V cume sobre tinta (mesmo do ícone adaptativo do app).
await render(
  `<div style="width:512px;height:512px;background:${C.tinta};display:flex;align-items:center;justify-content:center">${V(C.cume, 300)}</div>`,
  512,
  512,
  'icon-512.png',
);

// Imagem de destaque.
await render(
  `<div style="width:1024px;height:500px;background:${C.tinta};display:flex;flex-direction:column;justify-content:center;padding:0 88px;gap:28px;position:relative;overflow:hidden">
    <div style="position:absolute;right:-60px;bottom:-90px;opacity:.08">${V(C.cume, 520)}</div>
    <div style="display:flex;align-items:center;gap:20px">${V(C.cume, 96)}${word(C.nevoa, 92)}</div>
    <div style="font-family:Archivo;font-weight:700;font-stretch:125%;letter-spacing:-0.045em;color:${C.nevoa};font-size:44px;line-height:1.15">Seu método. Seu aluno.<br><span style="color:${C.cume}">Sua evolução.</span></div>
    <div style="font-family:Inter;color:#A3A9AF;font-size:24px">Treinos, avaliações, agenda e cobranças para personal trainers.</div>
  </div>`,
  1024,
  500,
  'feature-graphic.png',
);

// Capturas: entra com usuários de exemplo e fotografa telas em tamanho de celular.
const SHOTS = [
  {
    user: 'aluno01',
    path: '/treino',
    file: '01-treino-do-dia',
    title: 'Seu treino do dia,',
    accent: 'pronto para começar',
  },
  {
    user: 'aluno01',
    path: '/evolucao',
    file: '02-evolucao',
    title: 'Acompanhe sua',
    accent: 'evolução',
  },
  {
    user: 'aluno01',
    path: '/mensagens',
    file: '03-chat',
    title: 'Fale com seu personal',
    accent: 'sem sair do app',
  },
  {
    user: 'proplus',
    path: '/inicio',
    file: '04-personal-inicio',
    title: 'Todos os seus alunos',
    accent: 'num só lugar',
  },
  {
    user: 'proplus',
    path: '/treinos/ia',
    file: '05-treino-com-ia',
    title: 'Monte treinos',
    accent: 'com ajuda da IA',
  },
  {
    user: 'proplus',
    path: '/agenda',
    file: '06-agenda',
    title: 'Agenda e aulas',
    accent: 'organizadas',
  },
];

if (!PASSWORD) {
  console.warn(
    'Sem senha: pulei as capturas. Informe a senha dos usuários de exemplo como 2º argumento.',
  );
} else {
  const sessions = {};
  for (const user of new Set(SHOTS.map((s) => s.user))) {
    const r = await fetch(`${API}/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `${user}@vettafit.dev`, password: PASSWORD }),
    });
    if (!r.ok) throw new Error(`login ${user}: ${r.status}`);
    const tokens = await r.json();
    const me = await (
      await fetch(`${API}/v1/me`, { headers: { authorization: `Bearer ${tokens.accessToken}` } })
    ).json();
    sessions[user] = { tokens, tenantId: me.memberships[0]?.tenantId };
  }

  for (const s of SHOTS) {
    // 1) Tela real em tamanho de celular (390×844, 3x).
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      colorScheme: 'light',
    });
    const { tokens, tenantId } = sessions[s.user];
    await ctx.addInitScript(
      ([t, tid]) => {
        localStorage.setItem('vetta:tokens', JSON.stringify(t));
        localStorage.setItem('vetta:tenant', tid);
        localStorage.setItem('theme', 'light');
      },
      [tokens, tenantId],
    );
    const page = await ctx.newPage();
    await page.goto(`${WEB}${s.path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    const shot = (await page.screenshot()).toString('base64');
    await ctx.close();

    // 2) Arte 1080×1920: título em cima, tela com cantos arredondados embaixo.
    await render(
      `<div style="width:1080px;height:1920px;background:${C.tinta};display:flex;flex-direction:column;align-items:center;padding-top:110px;gap:70px">
        <div style="text-align:center;font-family:Archivo;font-weight:800;font-stretch:125%;letter-spacing:-0.045em;font-size:76px;line-height:1.08;color:${C.nevoa}">${s.title}<br><span style="color:${C.cume}">${s.accent}</span></div>
        <div style="width:820px;height:1600px;border-radius:72px;overflow:hidden;border:14px solid #2A3036;box-shadow:0 30px 80px rgba(0,0,0,.5)">
          <img src="data:image/png;base64,${shot}" style="width:100%;display:block">
        </div>
      </div>`,
      1080,
      1920,
      `screenshots/${s.file}.png`,
    );
    console.log('ok', s.file);
  }
}

await browser.close();
console.log('Imagens em', out);
