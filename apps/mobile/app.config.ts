import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Completa o app.json: projectId do EAS (do ambiente ou do próprio app.json, gravado pelo
 * eas init) para push e para o canal de EAS Update.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const projectId =
    process.env.EAS_PROJECT_ID ??
    (config.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  return {
    ...(config as ExpoConfig),
    extra: { ...config.extra, ...(projectId ? { eas: { projectId } } : {}) },
    ...(projectId
      ? {
          updates: { url: `https://u.expo.dev/${projectId}` },
          runtimeVersion: { policy: 'appVersion' as const },
        }
      : {}),
  };
};
