import { Button, Card, Skeleton, Text, useTheme } from '@vetta/ui-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { client } from '../../src/lib/client';

interface Lesson {
  id: string;
  title: string;
  body: string | null;
  videoUrl: string | null;
  completed: boolean;
}
interface Content {
  title: string;
  body: string | null;
  fileUrl: string | null;
  lessons: Lesson[];
}

function LessonVideo({ url }: { url: string }) {
  const player = useVideoPlayer(url);
  return (
    <VideoView player={player} style={{ width: '100%', aspectRatio: 16 / 9 }} nativeControls />
  );
}

export default function AcademyContent() {
  const t = useTheme();
  const qc = useQueryClient();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [current, setCurrent] = useState(0);
  const c = useQuery({
    queryKey: ['academy', slug],
    queryFn: () => client.request<Content>('GET', `/v1/academy/${slug}`),
  });
  const lesson = c.data?.lessons[current];
  return (
    <ScrollView
      style={{ backgroundColor: t.colors.background }}
      contentContainerStyle={{ padding: t.spacing[5], gap: t.spacing[4] }}
    >
      <Stack.Screen options={{ headerShown: true, title: c.data?.title ?? 'Academy' }} />
      {!c.data ? (
        <Skeleton height={200} />
      ) : (
        <>
          {c.data.fileUrl ? (
            <Button
              title="Abrir e-book"
              variant="secondary"
              onPress={() => void WebBrowser.openBrowserAsync(c.data!.fileUrl!)}
            />
          ) : null}
          {c.data.body ? <Text>{c.data.body}</Text> : null}
          {lesson ? (
            <Card>
              {lesson.videoUrl ? <LessonVideo url={lesson.videoUrl} /> : null}
              <Text variant="title">{lesson.title}</Text>
              {lesson.body ? <Text>{lesson.body}</Text> : null}
              <Button
                title={lesson.completed ? 'Concluída ✓' : 'Concluir aula'}
                variant={lesson.completed ? 'secondary' : 'primary'}
                onPress={async () => {
                  await client.request('PUT', `/v1/academy/lessons/${lesson.id}/progress`, {
                    completed: !lesson.completed,
                  });
                  await qc.invalidateQueries({ queryKey: ['academy'] });
                }}
              />
            </Card>
          ) : null}
          {c.data.lessons.map((l, i) => (
            <Button
              key={l.id}
              title={`${l.completed ? '✓ ' : ''}${i + 1}. ${l.title}`}
              variant={i === current ? 'secondary' : 'ghost'}
              onPress={() => setCurrent(i)}
            />
          ))}
        </>
      )}
    </ScrollView>
  );
}
