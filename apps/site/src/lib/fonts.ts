import { Archivo, Inter } from 'next/font/google';

/** Archivo com eixo de largura: títulos usam font-stretch 125% (Archivo Expanded). */
export const archivo = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  variable: '--font-archivo',
  display: 'swap',
});

export const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
