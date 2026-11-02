/**
 * Sanitização conservadora de SVG (logos). Remove scripts, handlers de evento,
 * foreignObject, referências externas e entidades. Se algo perigoso restar, rejeita.
 */
export function sanitizeSvg(input: string): string {
  let svg = input
    .replace(/<!DOCTYPE[^>[]*(\[[\s\S]*?\])?>/gi, '')
    .replace(/<!ENTITY[\s\S]*?>/gi, '')
    .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script[^>]*\/>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, '')
    .replace(/<(iframe|embed|object|audio|video|use)\b[\s\S]*?(\/>|<\/\1\s*>)/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(xlink:)?href\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, '')
    .replace(/url\(\s*['"]?(?!#)[^)]*\)/gi, 'none');
  svg = svg.replace(/javascript:/gi, '');
  if (/<script|javascript:|\son[a-z]+\s*=|<foreignObject|<!ENTITY/i.test(svg)) {
    throw new Error('SVG contém conteúdo não permitido');
  }
  if (!/<svg[\s>]/i.test(svg)) throw new Error('Arquivo não é um SVG válido');
  return svg;
}
