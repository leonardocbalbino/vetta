import type { Membership, MeResponse } from '@vetta/contracts';
import { useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { client, setActiveTenant } from './client';

const KEY = 'vetta.active';

export type Mode = 'aluno' | 'personal';

interface SessionState {
  ready: boolean;
  me: MeResponse | null;
  active: Membership | null;
  mode: Mode | null;
  /** O usuário tem os dois papéis (personal e aluno) e precisa escolher. */
  needsChoice: boolean;
  choose: (m: Membership) => Promise<void>;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionState | null>(null);
export const useSession = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession precisa do SessionProvider');
  return s;
};

export const modeOf = (m: Membership): Mode => (m.role === 'ALUNO' ? 'aluno' : 'personal');

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [active, setActive] = useState<Membership | null>(null);

  const refresh = useCallback(async () => {
    try {
      if (!(await client.tokens.get())) {
        setMe(null);
        return;
      }
      const m = await client.me();
      setMe(m);
      const saved = await SecureStore.getItemAsync(KEY);
      const pick =
        m.memberships.find((x) => x.tenantId === saved) ??
        (m.memberships.length === 1 ? m.memberships[0] : null);
      setActive(pick ?? null);
      setActiveTenant(pick?.tenantId ?? null);
    } catch {
      // Sem rede: mantém a última escolha para o treino offline continuar funcionando.
      const saved = await SecureStore.getItemAsync(`${KEY}.membership`);
      if (saved) {
        const m = JSON.parse(saved) as Membership;
        setActive(m);
        setActiveTenant(m.tenantId);
      }
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const choose = useCallback(
    async (m: Membership) => {
      await SecureStore.setItemAsync(KEY, m.tenantId);
      await SecureStore.setItemAsync(`${KEY}.membership`, JSON.stringify(m));
      setActive(m);
      setActiveTenant(m.tenantId);
      await qc.invalidateQueries();
    },
    [qc],
  );

  const signOut = useCallback(async () => {
    await client.auth.logout();
    await SecureStore.deleteItemAsync(KEY);
    await SecureStore.deleteItemAsync(`${KEY}.membership`);
    setMe(null);
    setActive(null);
    setActiveTenant(null);
    qc.clear();
  }, [qc]);

  const value: SessionState = {
    ready,
    me,
    active,
    mode: active ? modeOf(active) : null,
    needsChoice: !!me && !active && me.memberships.length > 1,
    choose,
    refresh,
    signOut,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
