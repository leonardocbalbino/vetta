import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import { client } from './client';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/** Deep link da notificação (mesmo caminho da web) → rota do app. */
export function routeFor(path: string, mode: 'aluno' | 'personal'): string {
  const p = path.replace(/^vetta:\/\//, '/').replace(/^https?:\/\/[^/]+/, '');
  if (p.startsWith('/treino')) return '/(aluno)/treino';
  if (p.startsWith('/evolucao')) return '/(aluno)/evolucao';
  if (p.startsWith('/anamnese/')) return `/anamnese/${p.split('/')[2]}`;
  if (p.startsWith('/feedbacks')) return '/(personal)/feedbacks';
  if (p.startsWith('/alunos/')) return `/aluno/${p.split('/')[2]?.split('?')[0]}`;
  return mode === 'aluno' ? '/(aluno)/treino' : '/(personal)/hoje';
}

/** Registra o token Expo Push do aparelho na API (precisa de projectId do EAS). */
export async function registerForPush(): Promise<string | null> {
  if (!Device.isDevice) return null;
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return null;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Vetta',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
    ?.eas?.projectId;
  if (!projectId) return null;
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await client.notifications
    .registerDevice(token, Platform.OS === 'ios' ? 'IOS' : 'ANDROID', Device.modelName ?? undefined)
    .catch(() => undefined);
  return token;
}

/** Ao tocar numa notificação, abre a tela do deep link. */
export function listenNotificationTaps(mode: () => 'aluno' | 'personal') {
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    const url = (r.notification.request.content.data as { url?: string } | undefined)?.url;
    if (url) router.push(routeFor(url, mode()) as never);
  });
  return () => sub.remove();
}

const REMINDER_ID = 'vetta-daily-training';

/** Lembrete diário local no horário escolhido (funciona sem internet). */
export async function scheduleDailyReminder(time: string | null) {
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => undefined);
  if (!time) return;
  const [hour, minute] = time.split(':').map(Number);
  await Notifications.requestPermissionsAsync();
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_ID,
    content: {
      title: 'Hora do treino 💪',
      body: 'Seu treino de hoje está esperando.',
      data: { url: 'vetta://treino' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: hour ?? 7,
      minute: minute ?? 0,
    },
  });
}
