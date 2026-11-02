import type { ConfigContext, ExpoConfig } from 'expo/config';

/** Completa o app.json com o que vem do ambiente (EAS): projectId para push e canal de EAS Update. */
export default ({ config }: ConfigContext): ExpoConfig => {
  const projectId = process.env.EAS_PROJECT_ID;
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
