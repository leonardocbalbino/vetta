import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

export const LOCALES = ['pt-BR', 'en', 'es'] as const;
export type AppLocale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = 'pt-BR';

/** Idioma: cookie "locale" → Accept-Language → pt-BR. Fuso exibido é o do usuário. */
export default getRequestConfig(async () => {
  const fromCookie = (await cookies()).get('locale')?.value;
  const accept = (await headers()).get('accept-language') ?? '';
  const fromHeader = LOCALES.find((l) =>
    accept.toLowerCase().startsWith(l.toLowerCase().slice(0, 2)),
  );
  const locale = (LOCALES as readonly string[]).includes(fromCookie ?? '')
    ? (fromCookie as AppLocale)
    : (fromHeader ?? DEFAULT_LOCALE);
  return {
    locale,
    timeZone: 'America/Sao_Paulo',
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
