import { describe, expect, it } from 'vitest';
import { renderNotificationEmail } from './index.js';

describe('renderNotificationEmail', () => {
  it('gera HTML e texto com CTA', async () => {
    const { html, text } = await renderNotificationEmail({
      title: 'Confirme seu e-mail',
      body: 'Olá, Ana!',
      ctaLabel: 'Confirmar',
      ctaUrl: 'https://app.vettafit.com.br/x',
    });
    expect(html).toContain('Confirme seu e-mail');
    expect(html).toContain('https://app.vettafit.com.br/x');
    expect(text).toContain('Olá, Ana!');
  });

  it('white label usa o nome e a cor do personal', async () => {
    const { html } = await renderNotificationEmail({
      title: 't',
      body: 'b',
      ctaLabel: 'Ir',
      ctaUrl: 'https://x.dev',
      brand: { name: 'Studio Carla', primaryColor: '#123456' },
    });
    expect(html).toContain('Studio Carla');
    expect(html.toLowerCase()).toContain('#123456');
  });
});
