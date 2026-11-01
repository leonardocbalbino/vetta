import { z } from 'zod';

export const IdParamSchema = z.object({ id: z.uuid() });

export const CursorQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type CursorQuery = z.infer<typeof CursorQuerySchema>;

export const cursorPage = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.uuid().nullable() });

export const OkResponseSchema = z.object({ ok: z.literal(true) });

/** Slug público (página de vendas, white label). */
export const SlugSchema = z
  .string()
  .min(3)
  .max(40)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use letras minúsculas, números e hífens.');

export const PasswordSchema = z
  .string()
  .min(8, 'A senha precisa ter pelo menos 8 caracteres.')
  .max(128)
  .regex(/[A-Za-z]/, 'Inclua pelo menos uma letra.')
  .regex(/\d/, 'Inclua pelo menos um número.');

export const EmailSchema = z
  .email('Informe um e-mail válido.')
  .max(254)
  .transform((v) => v.trim().toLowerCase());

export const TimezoneSchema = z.string().min(3).max(64);
