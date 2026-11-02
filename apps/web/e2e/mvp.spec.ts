import { expect, test, type Page } from '@playwright/test';

/** Lê o token salvo pelo app e chama a API (para pegar ids que a UI não exibe). */
async function api<T>(page: Page, path: string): Promise<T> {
  return page.evaluate(async (p) => {
    const tokens = JSON.parse(localStorage.getItem('vetta:tokens') ?? '{}') as {
      accessToken?: string;
    };
    const tenant = localStorage.getItem('vetta:tenant');
    const r = await fetch(`http://localhost:4000${p}`, {
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        ...(tenant ? { 'X-Tenant-Id': tenant } : {}),
      },
    });
    return r.json();
  }, path) as Promise<T>;
}

test('personal se cadastra, convida, prescreve e o aluno conclui o primeiro treino pelo link público', async ({
  page,
  browser,
}) => {
  const stamp = Date.now();

  // 1. Cadastro do personal
  await page.goto('/cadastro');
  await page.getByLabel('Seu nome').fill('Paula Personal');
  await page.getByLabel('Nome do seu negócio').fill(`Studio Paula ${stamp}`);
  await page.getByLabel('E-mail').fill(`paula-${stamp}@e2e.dev`);
  await page.getByLabel('Senha').fill('Senha-forte-123');
  await page.getByRole('checkbox', { name: 'Aceito os termos' }).click();
  await page.getByRole('button', { name: 'Criar minha conta' }).click();
  await expect(page.getByText('Primeiros passos (0/3)')).toBeVisible();

  // 2. Convite do aluno (por link, com botão de WhatsApp)
  await page.goto('/alunos?convidar=1');
  await page.getByLabel('Nome').fill('Lia Aluna');
  await page.getByRole('button', { name: 'Gerar convite' }).click();
  await expect(page.getByRole('link', { name: /Enviar no WhatsApp/ })).toBeVisible();
  await expect(page.getByLabel('Link do convite')).toHaveValue(/\/convite\//);
  await page.keyboard.press('Escape');

  // 3. Prescrição no construtor
  await page.goto('/treinos/novo');
  await page.getByLabel('Nome do treino').fill('Adaptação');
  await page
    .getByRole('combobox', { name: /Aluno/ })
    .or(page.getByText('Escolha o aluno'))
    .first()
    .click();
  await page.getByRole('option', { name: 'Lia Aluna' }).click();
  await page.getByLabel('Buscar exercício').fill('agachamento livre');
  await page.getByRole('button', { name: 'Adicionar Agachamento livre' }).click();
  await expect(page.getByText('1. Agachamento livre')).toBeVisible();
  await page.getByRole('button', { name: 'Publicar para o aluno' }).click();
  await page.waitForURL(/\/treinos\/[0-9a-f-]{36}$/);
  const programId = page.url().split('/').pop()!;

  // 4. Link público
  await page.getByRole('button', { name: /Link público/ }).click();
  await expect(page.getByText('Link copiado.')).toBeVisible();
  const program = await api<{ publicToken: string }>(page, `/v1/programs/${programId}`);
  expect(program.publicToken).toBeTruthy();

  // 5. Aluno treina sem login
  const student = await (await browser.newContext({ locale: 'pt-BR' })).newPage();
  await student.goto(`/t/${program.publicToken}`);
  await expect(student.getByRole('heading', { name: /Lia, seu treino: Adaptação/ })).toBeVisible();
  await student.getByRole('button', { name: 'Começar treino A' }).click();
  for (let i = 0; i < 3; i++) {
    await student.getByRole('button', { name: 'Concluir série' }).click();
    const skipRest = student.getByRole('button', { name: 'Pular', exact: true });
    if (await skipRest.isVisible().catch(() => false)) await skipRest.click();
  }
  await expect(student.getByRole('heading', { name: 'Como foi o treino?' })).toBeVisible();
  await student.getByRole('radio', { name: '5 de 5' }).click();
  await student.getByLabel('Comentário (opcional)').fill('Amei o treino!');
  await student.getByRole('button', { name: 'Enviar e finalizar' }).click();
  await expect(student.getByRole('heading', { name: 'Treino concluído!' })).toBeVisible();

  // 6. Personal vê o feedback e o treino no dashboard
  await page.goto('/feedbacks');
  await expect(page.getByText('“Amei o treino!”')).toBeVisible();
  await page.goto('/inicio');
  await expect(page.getByText('Treinos feitos hoje')).toBeVisible();
  const dash = await api<{ workoutsToday: number; onboarding: { firstWorkout: boolean } }>(
    page,
    '/v1/dashboard',
  );
  expect(dash.workoutsToday).toBe(1);
  expect(dash.onboarding.firstWorkout).toBe(true);
});
