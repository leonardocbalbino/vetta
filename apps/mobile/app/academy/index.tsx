import { Card, EmptyState, Text, useTheme } from '@vetta/ui-native';
import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { Pressable, ScrollView } from 'react-native';
import { client } from '../../src/lib/client';
import { useSession } from '../../src/lib/session';

interface Content {
  id: string;
  slug: string;
  type: 'COURSE' | 'EBOOK' | 'POST';
  title: string;
  summary: string | null;
  requiredPlan: 'PRO' | 'PRO_PLUS' | null;
  locked: boolean;
  progress: number | null;
}
const TYPE = { COURSE: 'Curso', EBOOK: 'E-book', POST: 'Post' };

/** Personal: Academy (cursos, e-books e posts, com acesso pelo plano). */
export default function Academy() {
  const t = useTheme();
  const { active } = useSession();
  const list = useQuery({
    queryKey: ['academy', active?.tenantId],
    queryFn: () => client.request<Content[]>('GET', '/v1/academy'),
  });
  return (
    <ScrollView
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={{ padding: t.spacing[5], gap: t.spacing[3] }}
    >
      <Stack.Screen options={{ headerShown: true, title: 'Academy' }} />
      {!list.data?.length ? (
        <EmptyState title="Nada publicado ainda" description="Volte em breve." />
      ) : (
        list.data.map((c) => (
          <Pressable
            key={c.id}
            accessibilityRole="button"
            accessibilityLabel={c.title}
            disabled={c.locked}
            onPress={() => router.push({ pathname: '/academy/[slug]', params: { slug: c.slug } })}
          >
            <Card style={{ opacity: c.locked ? 0.6 : 1 }}>
              <Text variant="caption">
                {TYPE[c.type]}
                {c.locked
                  ? ` · exclusivo ${c.requiredPlan === 'PRO_PLUS' ? 'Pro Plus' : 'Pro'}`
                  : ''}
                {c.progress !== null ? ` · ${c.progress}% concluído` : ''}
              </Text>
              <Text variant="title">{c.title}</Text>
              {c.summary ? <Text>{c.summary}</Text> : null}
            </Card>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}
