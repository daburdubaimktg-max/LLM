// Creator round dashboard: live testing progress for one round (which always tests exactly one release).
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { AWAITING, NavRow, SESSION_STATUS, SignInPrompt, go, humanise, param, taskOptions, useCreatorRound } from '@/components/creator-review';
import { useAuth } from '@/lib/auth';
import { computeDashboard, segmentOptions, type DashboardFilters } from '@/lib/dashboard';
import * as L from '@/lib/labels';
import type { CreatorRoundData } from '@/lib/types';
import { Badge, Button, Card, ChipSelect, Divider, Eyebrow, H1, H3, KeyValue, Muted, Notice, P, QueryView, Row, Screen, Section, Stack2, Stat, StatGrid, theme, type Tone } from '@/ui';

const ROUND_STATUS: Record<string, { label: string; tone: Tone }> = { draft: { label: 'Draft', tone: 'neutral' }, published: { label: 'Published', tone: 'good' },
  closed: { label: 'Closed', tone: 'warn' }, completed: { label: 'Completed', tone: 'info' }, archived: { label: 'Archived', tone: 'neutral' } };
const COMPLETION_STATUS = [{ value: 'active', label: 'Active' }, { value: 'completed', label: 'Completed' }, { value: 'abandoned', label: 'Abandoned' }];
const SEVERITIES = Object.entries(L.SEVERITY).map(([value, label]) => ({ value, label }));

export default function CreatorRoundDashboard() {
  const { userId } = useAuth();
  const id = param(useLocalSearchParams<{ id: string }>().id);
  if (!userId) return <SignInPrompt title="Testing round" />;
  return <Dashboard roundId={id} />;
}

function Dashboard({ roundId }: { roundId: string }) {
  const query = useCreatorRound(roundId, true);
  return (
    <Screen title="Testing round">
      <QueryView query={query}>{(data) => <Body data={data} roundId={roundId} />}</QueryView>
    </Screen>
  );
}

function Body({ data, roundId }: { data: CreatorRoundData; roundId: string }) {
  const [filters, setFilters] = useState<DashboardFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const dash = useMemo(() => computeDashboard(data, filters), [data, filters]);
  const segments = useMemo(() => segmentOptions(data), [data]);
  const tasks = useMemo(() => taskOptions(data), [data]);
  const base = `/creator/rounds/${roundId}`;
  const status = ROUND_STATUS[data.round.status] ?? { label: humanise(data.round.status), tone: 'neutral' as Tone };
  const awaiting = data.applications.filter((a) => AWAITING.includes(a.status)).length;
  const activeFilterCount = [filters.taskId, filters.severity, filters.sessionStatus, ...Object.values(filters.segments ?? {})].filter(Boolean).length;
  const overdue = !!data.round.testing_deadline && new Date(data.round.testing_deadline) < new Date();
  const verdictTotal = Object.values(dash.verdicts).reduce((a, n) => a + n, 0);
  const pct = dash.taskCompletionRate === null ? '—' : `${Math.round(dash.taskCompletionRate * 100)}%`;

  return (
    <>
      <Eyebrow>{data.product.name}</Eyebrow>
      <H1>{data.round.title}</H1>
      <Row wrap>
        <Badge label={status.label} tone={status.tone} />
        <Muted style={{ fontSize: theme.font.small }}>Round {data.round.round_number} · tests release {data.release.version}</Muted>
      </Row>

      {data.round.status === 'draft' && (
        <Notice tone="warn" title="This round is still a draft">
          <P style={{ fontSize: theme.font.small }}>Testers cannot see it or apply until it is published.</P>
          <Button small variant="secondary" title="Finish setup" onPress={() => go(`${base}/settings`)} testID="finish-setup" />
        </Notice>
      )}

      <Section title="Progress" action={<Button small variant="ghost" title={showFilters ? 'Hide filters' : activeFilterCount ? `Filters (${activeFilterCount})` : 'Filters'}
        onPress={() => setShowFilters(!showFilters)} testID="toggle-filters" />}>
        {showFilters && (
          <Card>
            <Muted style={{ fontSize: theme.font.small }}>
              Showing product release {data.release.version}, testing round “{data.round.title}”. A round always tests exactly one release.
            </Muted>
            {segments.map((seg) => seg.values.length > 0 && (
              <ChipSelect key={seg.key} label={seg.label} options={seg.values} value={filters.segments?.[seg.key] ?? ''}
                onChange={(v) => setFilters({ ...filters, segments: { ...filters.segments, [seg.key]: v } })} />
            ))}
            {tasks.length > 0 && <ChipSelect label="Task" options={tasks} value={filters.taskId ?? ''} onChange={(v) => setFilters({ ...filters, taskId: v || undefined })} />}
            <ChipSelect label="Severity" options={SEVERITIES} value={filters.severity ?? ''} onChange={(v) => setFilters({ ...filters, severity: v || undefined })} />
            <ChipSelect label="Completion status" options={COMPLETION_STATUS} value={filters.sessionStatus ?? ''} onChange={(v) => setFilters({ ...filters, sessionStatus: v || undefined })} />
            <Muted style={{ fontSize: theme.font.tiny }}>
              Segment filters narrow every figure. Task and completion status narrow only the testing figures (sessions, tasks, bugs, reviews); severity narrows only bugs.
              Applications, approvals and assignments are never narrowed by them.
            </Muted>
            {dash.isFiltered && <Button small variant="secondary" title="Clear filters" onPress={() => setFilters({})} testID="clear-filters" />}
          </Card>
        )}
        {dash.isFiltered && (
          <Notice tone="info">{`Showing ${dash.filteredTesters} of ${data.sessions.length} testers who have started testing. Filters are on.`}</Notice>
        )}
        <StatGrid>
          <Stat label="Target cohort" value={dash.targetCohort} hint="A target, not a result" />
          <Stat label="Applications received" value={dash.applicationsReceived} />
          <Stat label="Approved testers" value={dash.approved} hint="Approved, not necessarily assigned" />
          <Stat label="Waitlisted testers" value={dash.waitlisted} />
          <Stat label="Assigned testers" value={dash.assigned} hint="Invited or further along" />
          <Stat label="Active testing sessions" value={dash.activeSessions} hint="Started, not finished" />
          <Stat label="Completed testing sessions" value={dash.completedSessions} />
          <Stat label="Abandoned sessions" value={dash.abandonedSessions} />
          <Stat label="Task completion rate" value={pct}
            hint={dash.taskCompletionRate === null ? 'No tasks attempted yet' : `${dash.tasksCompleted} of ${dash.tasksAttempted} attempted tasks`} />
          <Stat label="Bugs reported" value={dash.bugs} />
          <Stat label="Average tester rating" value={dash.averageRating === null ? '—' : `${dash.averageRating} / 5`}
            hint={dash.ratings === 0 ? 'No final reviews yet' : `from ${dash.ratings} final ${dash.ratings === 1 ? 'review' : 'reviews'}`} />
        </StatGrid>
      </Section>

      <Section title="Issues by severity">
        <Card>
          {dash.bugs === 0 && <Muted style={{ fontSize: theme.font.small }}>No bugs reported{dash.isFiltered ? ' in this view' : ' yet'}.</Muted>}
          <KeyValue k="Critical" v={dash.bySeverity.critical} />
          <KeyValue k="Major" v={dash.bySeverity.major} />
          <KeyValue k="Minor" v={dash.bySeverity.minor} />
        </Card>
      </Section>

      <Section title="Tester verdicts">
        <Card>
          {verdictTotal === 0 ? <Muted>No final reviews yet.</Muted> : (
            <>
              {L.VERDICTS.map((v) => <KeyValue key={v.value} k={v.label} v={dash.verdicts[v.value] ?? 0} />)}
              <Muted style={{ fontSize: theme.font.tiny }}>Counted from {verdictTotal} final {verdictTotal === 1 ? 'review' : 'reviews'}.</Muted>
            </>
          )}
        </Card>
      </Section>

      <Section title="Tasks">
        {dash.perTask.length === 0 ? <Muted>No data yet. Task figures appear once a tester starts a session.</Muted> : (
          <Card>
            {dash.perTask.map((t, i) => (
              <View key={t.taskId} style={{ gap: 4 }}>
                {i > 0 && <Divider />}
                <H3>{t.position}. {t.title}</H3>
                <Muted style={{ fontSize: theme.font.small }}>
                  Attempted {t.attempted} · Completed {t.completed} · Blocked {t.blocked} · Skipped {t.skipped}
                </Muted>
                <Muted style={{ fontSize: theme.font.small }}>
                  Help requested {t.helpRequested} · Median time {t.medianSeconds === null ? '—' : L.duration(t.medianSeconds)}
                </Muted>
              </View>
            ))}
          </Card>
        )}
      </Section>

      <Section title="Manage">
        <Card>
          <NavRow title="Applications" detail={awaiting === 0 ? 'None awaiting review' : `${awaiting} awaiting review`} onPress={() => go(`${base}/applications`)} testID="nav-applications" />
          <Divider />
          <NavRow title="Assignments" detail="Send testing invitations to approved testers" onPress={() => go(`${base}/assignments`)} testID="nav-assignments" />
          <Divider />
          <NavRow title="Bug reports" detail={`${data.bugs.length} reported`} onPress={() => go(`${base}/bugs`)} testID="nav-bugs" />
          <Divider />
          <NavRow title="Feedback explorer" detail="Read what testers wrote, task by task" onPress={() => go(`${base}/feedback`)} testID="nav-feedback" />
          <Divider />
          <NavRow title="Validation report" detail={data.reports.length === 0 ? 'None generated yet' : `${data.reports.length} generated`} onPress={() => go(`${base}/report`)} testID="nav-report" />
          <Divider />
          <NavRow title="Round setup & tasks" onPress={() => go(`${base}/settings`)} testID="nav-settings" />
        </Card>
      </Section>

      <Section title="Live sessions">
        {data.sessions.length === 0 ? <Muted>No tester has started testing yet.</Muted> : (
          <Card>
            <Muted style={{ fontSize: theme.font.tiny }}>Refreshes every 15 seconds while this screen is open.</Muted>
            {data.sessions.map((s, i) => {
              const cs = data.completions.filter((c) => c.session_id === s.id);
              const done = cs.filter((c) => c.status === 'completed').length;
              const lapsed = overdue && s.status !== 'completed' && s.status !== 'abandoned';
              const st = lapsed ? { label: 'Abandoned (deadline passed)', tone: 'bad' as Tone } : SESSION_STATUS[s.status];
              return (
                <View key={s.id}>
                  {i > 0 && <Divider />}
                  <NavRow title={s.tester_name ?? 'Former tester'} onPress={() => go(`/creator/sessions/${s.id}`)} testID={`session-${s.id}`}
                    detail={`${done} of ${cs.length} tasks completed · last activity ${L.dateTime(s.last_activity_at)}`}
                    right={<Badge label={st.label} tone={st.tone} />} />
                </View>
              );
            })}
          </Card>
        )}
      </Section>

      <Section title="Recent activity">
        {data.activity.length === 0 ? <Muted>Nothing has happened in this round yet.</Muted> : (
          <Card>
            <Stack2 gap={theme.space.sm}>
              {data.activity.slice(0, 20).map((a) => (
                <Row key={a.id} style={{ justifyContent: 'space-between' }} gap={theme.space.md}>
                  <P style={{ fontSize: theme.font.small, flex: 1 }}>{humanise(a.event_type)}</P>
                  <Muted style={{ fontSize: theme.font.tiny }}>{L.dateTime(a.created_at)}</Muted>
                </Row>
              ))}
            </Stack2>
          </Card>
        )}
      </Section>
    </>
  );
}
