// Bug report management list for one round.
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { SignInPrompt, go, param, severityTone, taskOptions, taskTitles, triageTone, useCreatorRound } from '@/components/creator-review';
import { useAuth } from '@/lib/auth';
import * as L from '@/lib/labels';
import type { CreatorRoundData } from '@/lib/types';
import { Badge, Card, ChipSelect, Empty, H3, Muted, QueryView, Row, Screen, theme } from '@/ui';

const SEVERITIES = Object.entries(L.SEVERITY).map(([value, label]) => ({ value, label }));
const TRIAGE = Object.entries(L.TRIAGE).map(([value, label]) => ({ value, label }));

export default function BugsScreen() {
  const { userId } = useAuth();
  const id = param(useLocalSearchParams<{ id: string }>().id);
  if (!userId) return <SignInPrompt title="Bug reports" />;
  return <Bugs roundId={id} />;
}

function Bugs({ roundId }: { roundId: string }) {
  const query = useCreatorRound(roundId);
  return <Screen title="Bug reports"><QueryView query={query}>{(data) => <BugList data={data} />}</QueryView></Screen>;
}

function BugList({ data }: { data: CreatorRoundData }) {
  const [severity, setSeverity] = useState('');
  const [triage, setTriage] = useState('');
  const [taskId, setTaskId] = useState('');
  const titles = useMemo(() => taskTitles(data), [data]);
  const tasks = useMemo(() => taskOptions(data), [data]);
  const rows = data.bugs.filter((b) => (!severity || b.severity === severity) && (!triage || b.triage?.status === triage) && (!taskId || b.task_id === taskId));

  if (data.bugs.length === 0) return <Empty title="No bugs reported yet" body="Issues testers report during this round appear here." />;
  return (
    <>
      <Muted>
        {rows.length === data.bugs.length ? `${data.bugs.length} reported in this round.` : `Showing ${rows.length} of ${data.bugs.length} reported in this round.`}
      </Muted>
      <ChipSelect label="Severity" options={SEVERITIES} value={severity} onChange={setSeverity} />
      <ChipSelect label="Triage status" options={TRIAGE} value={triage} onChange={setTriage} />
      {tasks.length > 0 && <ChipSelect label="Task" options={tasks} value={taskId} onChange={setTaskId} />}
      {rows.length === 0 && <Empty title="Nothing matches these filters" />}
      {rows.map((b) => {
        const device = [b.device, b.operating_system].filter(Boolean).join(' · ');
        return (
          <Card key={b.id} onPress={() => go(`/bugs/${b.id}`)} testID={`bug-${b.id}`}>
            <H3>{b.title}</H3>
            <Row wrap>
              <Badge label={L.SEVERITY[b.severity] ?? b.severity} tone={severityTone(b.severity)} />
              {b.triage && <Badge label={L.TRIAGE[b.triage.status] ?? b.triage.status} tone={triageTone(b.triage.status)} />}
              {!!b.triage?.category && <Badge label={b.triage.category} />}
            </Row>
            <Muted style={{ fontSize: theme.font.small }}>
              {b.task_id ? `Task: ${titles.get(b.task_id) ?? 'Removed task'}` : 'Not linked to a task'}
            </Muted>
            <Muted style={{ fontSize: theme.font.small }}>
              {device || 'Device not given'} · {b.attachment_count === 1 ? '1 attachment' : `${b.attachment_count} attachments`} · reported {L.dateTime(b.created_at)}
            </Muted>
          </Card>
        );
      })}
    </>
  );
}
