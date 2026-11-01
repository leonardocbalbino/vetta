import { z } from 'zod';
import { PlanCode, SubscriptionStatus } from './enums.js';

export const EntitlementsResponseSchema = z.object({
  plan: z.object({
    code: z.enum(PlanCode),
    name: z.string(),
    status: z.enum(SubscriptionStatus),
    trialEndsAt: z.iso.datetime().nullable(),
  }),
  /** Valor resolvido de cada feature: boolean ou número (-1 = ilimitado). */
  features: z.record(z.string(), z.union([z.boolean(), z.number()])),
  /** Uso atual das features de limite que têm contador. */
  limits: z.record(z.string(), z.object({ used: z.number(), max: z.number() })),
});
export type EntitlementsResponse = z.infer<typeof EntitlementsResponseSchema>;

export const FeatureOverrideSchema = z.object({
  featureKey: z.string(),
  value: z.union([z.boolean(), z.number().int().min(-1)]),
  expiresAt: z.iso.datetime().nullable().optional(),
  reason: z.string().trim().min(5).max(500),
});
