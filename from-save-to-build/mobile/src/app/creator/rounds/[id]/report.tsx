// Validation reports for a round: list earlier snapshots and generate a new one.
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { NavRow, REPORT_STATUS, SignInPrompt, generatorLabel, go, param, useCreatorRound } from '@/components/creator-review';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import * as L from '@/lib/labels';
import { keys, queryClient } from '@/lib/query';
import type { CreatorRoundData } from '@/lib/types';
import { Badge, Button, Card, Divider, ErrorNote, H2, Muted, P, QueryView, Screen, Section, theme, useAction } from '@/ui';

export default function RoundReportsScreen() {
  const { userId } = useAuth();
  const id = param(useLocalSearchParams<{ id: string }>().id);
  if (!userId) return <SignInPrompt title="Validation report" />;
  return <Reports roundId={id} />;
}

function Reports({ roundId }: { roundId: string }) {
  const query = useCreatorRound(roundId);
  return <Screen title="Validation report"><QueryView query={query}>{(data) => <Body data={data} roundId={roundId} />}</QueryView></Screen>;
}

function Body({ data, roundId }: { data: CreatorRoundData; roundId: string }) {
  const generate = useAction(async () => {
    const reportId = await api.requestReport(roundId);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.creatorRound(roundId) }),
      queryClient.invalidateQueries({ queryKey: keys.product(data.product.id) }),
      queryClient.invalidateQueries({ queryKey: keys.creatorHome }),
    ]);
    go(`/creator/reports/${reportId}`);
  });
  const started = data.sessions.length;
  const completed = data.sessions.filter((s) => s.status === 'completed').length;

  return (
    <>
      <H2>{data.round.title}</H2>
      <P>A validation report summarises what testers did and said in this round. Every finding links to the tester evidence behind it, so you can check it yourself.</P>
      <Muted>Each report is a snapshot of the evidence at the moment it was generated and is never changed afterwards. Generate a new one to include later feedback.</Muted>

      <Card>
        <Muted style={{ fontSize: theme.font.small }}>
          Evidence available now: {started} testing {started === 1 ? 'session' : 'sessions'} started, {completed} completed, {data.bugs.length} {data.bugs.length === 1 ? 'bug' : 'bugs'} reported
          {' '}(target cohort {data.round.cohort_size}).
        </Muted>
        {started === 0 && <Muted style={{ fontSize: theme.font.small }}>No tester has started yet, so a report generated now will have nothing to analyse.</Muted>}
        <ErrorNote error={generate.error} />
        <Button title="Generate validation report" loading={generate.loading} onPress={() => generate.run()} testID="generate-report" />
      </Card>

      <Section title="Reports">
        {data.reports.length === 0 ? <Muted>No reports generated yet.</Muted> : (
          <Card>
            {data.reports.map((r, i) => {
              const st = REPORT_STATUS[r.status] ?? { label: r.status, tone: 'neutral' as const };
              return (
                <View key={r.id}>
                  {i > 0 && <Divider />}
                  <NavRow title={L.dateTime(r.created_at)} detail={r.status === 'failed' ? r.error ?? 'Generation failed' : r.generator ? generatorLabel(r.generator) : 'Generator not recorded yet'}
                    onPress={() => go(`/creator/reports/${r.id}`)} testID={`report-${r.id}`} right={<Badge label={st.label} tone={st.tone} />} />
                </View>
              );
            })}
          </Card>
        )}
      </Section>
    </>
  );
}
