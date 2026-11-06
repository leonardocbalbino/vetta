import { expect, test, type Browser, type Page } from '@playwright/test';

/** Usuários do seed de desenvolvimento (packages/db/src/seed). */
const PASSWORD = process.env.SEED_PASSWORD ?? 'Vetta@2026dev';

async function login(page: Page, email: string) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: /^Entrar$/ }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/entrar'));
}

async function newUser(browser: Browser, email: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, email);
  return { page, close: () => ctx.close() };
}

test('biblioteca: ver detalhes de um exercício da Vetta, duplicar e editar a cópia', async ({
  page,
}) => {
  const stamp = Date.now();
  await login(page, 'pro@vettafit.dev');
  await page.goto('/biblioteca');
  await page.getByLabel('Buscar exercício').fill('supino reto');
  await page
    .getByRole('button', { name: /Supino reto com barra/ })
    .first()
    .click();

  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Supino reto com barra' })).toBeVisible();
  await expect(sheet.getByText('Biblioteca Vetta', { exact: true })).toBeVisible();
  await expect(sheet.getByText('Músculos principais')).toBeVisible();

  await sheet.getByRole('button', { name: 'Duplicar e editar' }).click();
  await expect(
    sheet.getByRole('heading', { name: /^Editar: Supino reto com barra \(cópia\)/ }),
  ).toBeVisible();
  const name = `Supino do e2e ${stamp}`;
  await sheet.getByLabel('Nome').fill(name);
  await sheet.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(sheet.getByRole('heading', { name })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Editar' })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByLabel('Buscar exercício').fill(`e2e ${stamp}`);
  const card = page.getByRole('button', { name: new RegExp(`^${name}`) });
  await expect(card).toBeVisible();
  await expect(card.getByText('meu')).toBeVisible();
});

test('chat: aluno recebe a mensagem e a resposta chega ao personal em tempo real', async ({
  page,
  browser,
}) => {
  const stamp = Date.now();
  await login(page, 'pro@vettafit.dev');
  await page.goto('/mensagens');
  await page.getByRole('button', { name: /Aluno 03/ }).click();
  await page.getByRole('textbox', { name: 'Mensagem' }).fill(`Treino novo no app ${stamp}`);
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByText(`Treino novo no app ${stamp}`)).toBeVisible();

  const aluno = await newUser(browser, 'aluno03@vettafit.dev');
  await aluno.page.goto('/mensagens');
  await expect(aluno.page.getByText(`Treino novo no app ${stamp}`)).toBeVisible();
  await aluno.page.getByRole('textbox', { name: 'Mensagem' }).fill(`Vi aqui, obrigado ${stamp}`);
  await aluno.page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(aluno.page.getByText(`Vi aqui, obrigado ${stamp}`)).toBeVisible();

  // Sem recarregar: a resposta chega pelo WebSocket.
  await expect(page.getByText(`Vi aqui, obrigado ${stamp}`)).toBeVisible();
  await aluno.close();
});

test('agenda: personal marca uma aula e o aluno vê na agenda dele', async ({ page, browser }) => {
  const stamp = Date.now();
  const title = `Avaliação e2e ${stamp}`;
  // Dia e hora variam a cada execução: o horário do aluno não pode estar ocupado.
  const day = new Date(Date.now() + (1 + (stamp % 5)) * 86_400_000).toISOString().slice(0, 10);
  const hour = `${String(6 + (Math.floor(stamp / 7) % 15)).padStart(2, '0')}:00`;

  await login(page, 'pro@vettafit.dev');
  await page.goto('/agenda');
  await page.getByRole('button', { name: 'Nova aula' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nova aula' });
  await dialog.getByLabel('Título').fill(title);
  await dialog.getByLabel('Data').fill(day);
  await dialog.getByLabel('Início').fill(hour);
  await dialog.getByRole('checkbox', { name: 'Aluno 04' }).check();
  await dialog.getByRole('button', { name: 'Criar' }).click();
  await expect(dialog).toBeHidden();

  const aluno = await newUser(browser, 'aluno04@vettafit.dev');
  await aluno.page.goto('/agenda');
  const aula = aluno.page.getByRole('listitem').filter({ hasText: title });
  await expect(aula).toContainText('reservado');
  await aula.getByRole('button', { name: 'Confirmar' }).click();
  await expect(aula).toContainText('confirmado');
  await aluno.close();
});
