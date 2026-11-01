/** Substitui {{chave}} pelos valores; chaves ausentes viram string vazia. */
export function renderTemplate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const v = key
      .split('.')
      .reduce<unknown>(
        (acc, k) =>
          acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined,
        vars,
      );
    return v === undefined || v === null ? '' : String(v);
  });
}

/** Ordem de fallback de idioma: exato → base (en-US → en) → pt-BR. */
export function localeFallbacks(locale: string): string[] {
  const base = locale.split('-')[0] ?? locale;
  return [...new Set([locale, base, 'pt-BR'])];
}
