import { Redirect } from 'expo-router';
import { LogoLoader } from '@vetta/ui-native';
import { useSession } from '../src/lib/session';

/** Roteia para login, escolha de modo/vínculo ou as abas do perfil ativo. */
export default function Index() {
  const s = useSession();
  if (!s.ready) {
    return <LogoLoader fullscreen />;
  }
  if (!s.me && !s.active) return <Redirect href="/login" />;
  if (!s.active) return <Redirect href="/vinculo" />;
  return <Redirect href={s.mode === 'aluno' ? '/(aluno)/treino' : '/(personal)/hoje'} />;
}
