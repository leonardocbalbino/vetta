import { z } from 'zod';
import { DevicePlatform, NotificationCategory, NotificationChannel } from './enums.js';

export const NotificationSchema = z.object({
  id: z.uuid(),
  event: z.string(),
  category: z.enum(NotificationCategory),
  title: z.string(),
  body: z.string(),
  deepLink: z.string().nullable(),
  tenantId: z.uuid().nullable(),
  readAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  groupCount: z.number().int(),
});
export type NotificationDto = z.infer<typeof NotificationSchema>;

export const UnreadCountSchema = z.object({ count: z.number().int() });

export const PreferenceItemSchema = z.object({
  category: z.enum(NotificationCategory),
  channel: z.enum(NotificationChannel),
  enabled: z.boolean(),
});

export const QuietHoursSchema = z.object({
  enabled: z.boolean(),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
});

export const NotificationPreferencesSchema = z.object({
  items: z.array(PreferenceItemSchema),
  quietHours: QuietHoursSchema,
});
export type NotificationPreferences = z.infer<typeof NotificationPreferencesSchema>;

export const DEFAULT_QUIET_HOURS = { enabled: true, start: '22:00', end: '07:00' } as const;

export const RegisterDeviceSchema = z.object({
  pushToken: z.string().min(10).max(255),
  platform: z.enum(DevicePlatform),
  name: z.string().max(120).optional(),
  appVersion: z.string().max(40).optional(),
});

export const DeviceSchema = z.object({
  id: z.uuid(),
  platform: z.enum(DevicePlatform),
  name: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

/** Categorias que o usuário não pode desligar. */
export const MANDATORY_CATEGORIES: NotificationCategory[] = ['SECURITY'];
