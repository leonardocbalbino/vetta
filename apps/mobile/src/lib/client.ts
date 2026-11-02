import type { AuthTokens } from '@vetta/contracts';
import { createVettaClient, type TokenStore } from '@vetta/sdk';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { z } from 'zod';

/** URL da API: EXPO_PUBLIC_API_URL (EAS) ou app.json → extra.apiUrl. */
export const API_URL = z
  .url()
  .parse(
    process.env.EXPO_PUBLIC_API_URL ??
      (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl,
  );

const KEY = 'vetta.tokens';

/** Tokens no SecureStore (Keychain/Keystore). */
const secureStore: TokenStore = {
  get: async () => {
    const raw = await SecureStore.getItemAsync(KEY);
    return raw ? (JSON.parse(raw) as AuthTokens) : null;
  },
  set: async (t) => {
    if (t) await SecureStore.setItemAsync(KEY, JSON.stringify(t));
    else await SecureStore.deleteItemAsync(KEY);
  },
};

let activeTenantId: string | null = null;
export const setActiveTenant = (id: string | null) => {
  activeTenantId = id;
};

export const client = createVettaClient({
  baseUrl: API_URL,
  tokens: secureStore,
  getTenantId: () => activeTenantId,
});
