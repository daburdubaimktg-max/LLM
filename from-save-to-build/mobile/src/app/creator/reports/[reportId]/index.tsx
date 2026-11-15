// Validation report view. Tester statements, counted observations, interpretations and
// recommendations are tagged separately so they can never be mistaken for one another.
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { CONFIDENCE, Quote, REVIEW_STATUS, SignInPrompt, generatorLabel, go, kindTag, param } from '@/components/creator-review';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import * as L from '@/lib/labels';
import { keys } from '@/lib/query';
import type { Finding, ReportDetail } from '@/lib/types';
import { Badge, Bullets, Button, Card, Eyebrow, H1, H3, Loading, Muted, Notice, P, QueryView, Row, Screen, Section, Stat, StatGrid, theme } from '@/ui';

const num = (v: unknown): string | number => (typeof v === 'number' && Number.isFinite(v) ? v : '—');

export default function ReportScreen() {
  const { userId } = useAuth();
  const reportId = param(useLocalSearchParams<{ reportId: string }>().reportId);
  if (!userId) return <SignInPrompt title="Validation report" />;
  return <Report reportId={reportId} />;
}

function Report({ reportId }: { reportId: string }) {
  const query = useQuery({ queryKey: keys.report(reportId), queryFn: () => api.reportDetail(reportId), enabled: !!reportId,
    refetchInterval: (q) => (q.state.data?.status === 'queued' || q.state.data?.status === 'processing' ? 1500 : false) });
  return <Screen title="Validation report"><QueryView query={query}>{(r) => <Body r={r} />}</QueryView></Screen>;
}

function Body({ r }: { r: ReportDetail }) {
  if (r.status === 'queued' || r.status === 'processing') {
    return (
      <>
        <H1>Building your report…</H1>
        <Muted>Reading the testing evidence for “{r.round_title}”. This usually takes a few seconds; the page updates by itself.</Muted>
        <Loading />
      </>
    );
  }
  if (r.status === 'failed') {
    return (
      <>
        <H1>This report could not be built</H1>
        <Notice tone="bad">{r.error ?? 'The report job failed without giving a reason.'}</Notice>
        <Button variant="secondary" title="Back to reports" onPress={() => go(`/creator/rounds/${r.round_id}/report`)} testID="back-to-reports" />
      </>
    );
  }
  const stats = (r.stats ?? {}) as Record<string, any>;
  const ratingCount = typeof stats.rating?.count === 'number' ? stats.rating.count : 0;
  const ratingAvg = typeof stats.rating?.average === 'number' ? `${stats.rating.average} / 5` : '—';
  const limitations = r.limitations ?? [];

  return (
    <>
      <Eyebrow>Validation report · snapshot</Eyebrow>
      <H1>{r.round_title}</H1>
      <Muted style={{ fontSize: theme.font.small }}>
        Product release {r.version} · generated {L.dateTime(r.created_at)} · {generatorLabel(r.generator)}
      </Muted>

      <Section title="Executive summary">
        {r.executive_summary?.trim() ? <P>{r.executive_summary}</P> : <Muted>No summary was produced.</Muted>}
      </Section>

      <Notice tone="warn" title="Limitations">
        {limitations.length === 0
          ? <Muted style={{ fontSize: theme.font.small }}>None were recorded for this report. Individual findings may still carry their own.</Muted>
          : <Bullets items={limitations} />}
      </Notice>

      <Section title="Key numbers">
        <Muted style={{ fontSize: theme.font.small }}>As they stood when this report was generated.</Muted>
        <StatGrid>
          <Stat label="Target cohort" value={num(stats.cohort_size)} hint="A target, not a result" />
          <Stat label="Applications received" value={num(stats.applications)} />
          <Stat label="Approved testers" value={num(stats.approved)} />
          <Stat label="Assigned testers" value={num(stats.assigned)} />
          <Stat label="Testing sessions started" value={num(stats.sessions_started)} />
          <Stat label="Testing sessions completed" value={num(stats.sessions_completed)} />
          <Stat label="Bugs reported" value={num(stats.bugs?.total)} />
          <Stat label="Average tester rating" value={ratingAvg} hint={ratingCount === 0 ? 'No final reviews' : `from ${ratingCount} final ${ratingCount === 1 ? 'review' : 'reviews'}`} />
        </StatGrid>
      </Section>

      {Object.entries(L.SECTIONS).map(([key, title]) => {
        const findings = r.findings.filter((f) => f.section === key);
        return (
          <Section key={key} title={title}>
            {findings.length === 0 ? <Muted>Not enough evidence for this section.</Muted>
              : findings.map((f) => <FindingCard key={f.id} f={f} r={r} />)}
          </Section>
        );
      })}
    </>
  );
}

function FindingCard({ f, r }: { f: Finding; r: ReportDetail }) {
  const tag = kindTag(f.kind, r.generator);
  const confidence = CONFIDENCE[f.confidence] ?? { label: f.confidence, tone: 'neutral' as const };
  const review = REVIEW_STATUS[f.review_status] ?? { label: f.review_status, tone: 'neutral' as const };
  const body = f.edited_body ?? f.body;
  const edited = !!(f.edited_title || f.edited_body);
  return (
    <Card onPress={() => go(`/creator/reports/${r.id}/finding/${f.id}`)} testID={`finding-${f.id}`}>
      <Row wrap><Badge label={tag.label} tone={tag.tone} />{edited && <Badge label="Edited by you" />}</Row>
      <H3>{f.edited_title ?? f.title}</H3>
      {f.kind === 'tester_statement' ? <Quote>{body}</Quote> : <P>{body}</P>}
      <Muted style={{ fontSize: theme.font.small }}>
        Supported by {f.supporting_tester_count} of {f.total_testers} testers · {f.evidence.length === 1 ? '1 source' : `${f.evidence.length} sources`}
        {f.task_title ? ` · Task: ${f.task_title}` : ''}
      </Muted>
      {!!f.limitations && <Muted style={{ fontSize: theme.font.small }}>Limitations: {f.limitations}</Muted>}
      <Row wrap style={{ justifyContent: 'space-between' }}>
        <Row wrap><Badge label={confidence.label} tone={confidence.tone} /><Badge label={review.label} tone={review.tone} /></Row>
        <Muted style={{ fontSize: theme.font.small }}>Review ›</Muted>
      </Row>
    </Card>
  );
}
