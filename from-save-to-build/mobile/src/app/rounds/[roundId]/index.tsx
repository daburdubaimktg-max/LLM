import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { Image, Linking, Text, View } from 'react-native';
import { go, minutesRange } from '@/components/tester';
import { api } from '@/lib/api';
import { CATEGORIES, COUNTRIES, DEVICES, REWARDS, STAGES, TASK_TYPES, date } from '@/lib/labels';
import { keys } from '@/lib/query';
import type { RoundDetail } from '@/lib/types';
import { Badge, Bullets, Button, Card, Divider, H1, H3, KeyValue, Muted, Notice, P, QueryView, Row, Screen, Section, theme } from '@/ui';

function Footer({ d }: { d: RoundDetail }) {
  const id = d.round.id;
  const app = d.my_application;
  const asg = d.my_assignment;
  if (d.is_creator) {
    return (
      <>
        <Muted style={{ fontSize: theme.font.small }}>This is your own round, so you cannot apply to it.</Muted>
        <Button title="Manage this round" testID="manage-round" onPress={() => go(`/creator/rounds/${id}`)} />
      </>
    );
  }
  if (asg && (asg.status === 'invited' || asg.status === 'accepted' || asg.status === 'in_progress')) {
    return <Button title="Open your testing invitation" testID="open-invitation" onPress={() => go(`/assignments/${asg.id}`)} />;
  }
  if (!app) {
    if (d.round.status !== 'published') return <Muted>This testing round is no longer taking applications.</Muted>;
    return (
      <>
        {d.stats.remaining_places === 0 && <Muted style={{ fontSize: theme.font.small }}>All places are taken right now. You can still apply — you may be put on the waitlist.</Muted>}
        <Button title="Apply to test" testID="apply-to-test" onPress={() => go(`/rounds/${id}/apply`)} />
      </>
    );
  }
  if (app.status === 'draft') return <Button title="Continue your application" testID="continue-application" onPress={() => go(`/rounds/${id}/apply`)} />;
  return <Button title="View application status" testID="view-application" onPress={() => go(`/rounds/${id}/application`)} />;
}

function Detail({ d }: { d: RoundDetail }) {
  const { round, product, release, stats, creator } = d;
  const image = d.assets.find((a) => (a.kind === 'logo' || a.kind === 'screenshot') && !!a.url);
  const demoUrl = product.demo_url ?? d.assets.find((a) => a.kind === 'demo_link' && !!a.url)?.url ?? null;
  return (
    <>
      <Row gap={theme.space.lg} style={{ alignItems: 'flex-start' }}>
        {image?.url ? (
          <Image source={{ uri: image.url }} accessibilityLabel={image.caption ?? `${product.name} image`}
            style={{ width: 72, height: 72, borderRadius: theme.radius.md, backgroundColor: theme.color.soft }} />
        ) : (
          <View style={{ width: 72, height: 72, borderRadius: theme.radius.md, backgroundColor: theme.color.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 30, fontWeight: '700', color: theme.color.accent }}>{product.name.trim().charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1, gap: 4 }}>
          <H1>{product.name}</H1>
          <Muted style={{ fontSize: theme.font.small }}>{CATEGORIES[product.category] ?? product.category} · {product.stage_label || STAGES[product.stage] || product.stage} · Version {release.version}</Muted>
        </View>
      </Row>
      <Row wrap>
        {round.beginner_friendly && <Badge tone="info" label="Beginner-friendly" />}
        <Badge label={REWARDS[round.reward_type] ?? round.reward_type} />
        {product.is_demo && <Badge tone="warn" label="Demo listing" />}
      </Row>
      <P>{product.description}</P>
      {round.status !== 'published' && <Notice tone="warn">This testing round is {round.status} and is not taking new applications.</Notice>}

      <Section title="What you'll be asked to do">
        <P>{round.summary}</P>
        {d.outline.length > 0 && (
          <Card>
            {[...d.outline].sort((a, b) => a.position - b.position).map((t, i) => (
              <View key={`${t.position}-${i}`}>
                {i > 0 && <Divider />}
                <Row style={{ alignItems: 'flex-start' }} gap={theme.space.md}>
                  <Text style={{ width: 22, fontSize: theme.font.body, fontWeight: '700', color: theme.color.accent, lineHeight: 24 }}>{t.position}</Text>
                  <View style={{ flex: 1, gap: 2 }}>
                    <P style={{ color: theme.color.ink }}>{t.title}</P>
                    <Muted style={{ fontSize: theme.font.small }}>
                      {TASK_TYPES[t.task_type] ?? t.task_type}{t.estimated_minutes ? ` · about ${t.estimated_minutes} min` : ''}
                    </Muted>
                  </View>
                  {!t.is_required && <Badge label="Optional" />}
                </Row>
              </View>
            ))}
          </Card>
        )}
      </Section>

      {d.objectives.length > 0 && <Section title="What the team wants to learn"><Bullets items={d.objectives} /></Section>}

      <Section title="Who it's for">
        {!!(round.target_audience || product.target_audience) && <P>{round.target_audience || product.target_audience}</P>}
        <Card>
          <KeyValue k="Devices" v={round.supported_devices.length ? round.supported_devices.map((x) => DEVICES[x] ?? x).join(', ') : 'Any device'} />
          <KeyValue k="Countries" v={round.countries.length ? `Open to testers in ${round.countries.map((x) => COUNTRIES[x] ?? x).join(', ')}` : 'No country restriction'} />
          <KeyValue k="Time needed" v={minutesRange(round.expected_minutes_min, round.expected_minutes_max)} />
          <KeyValue k="Apply by" v={round.application_deadline ? date(round.application_deadline) : 'No deadline'} />
        </Card>
      </Section>

      <Section title="Places">
        <Card>
          <KeyValue k="Testers wanted" v={stats.cohort_size} />
          <KeyValue k="Approved so far" v={stats.approved_testers} />
          <KeyValue k="Places remaining" v={stats.remaining_places} />
          <Divider />
          <KeyValue k="Applications awaiting review" v={stats.pending_applications} />
        </Card>
        <Muted style={{ fontSize: theme.font.small }}>
          Applications awaiting review have not taken a place yet — a place is only taken once the team approves someone.
        </Muted>
        {stats.remaining_places === 0 && <Notice tone="warn">All places are taken for now. New applications may be put on the waitlist.</Notice>}
      </Section>

      <Section title="Reward">
        <P>{REWARDS[round.reward_type] ?? round.reward_type}{round.reward_details ? ` — ${round.reward_details}` : ''}</P>
      </Section>

      <Section title="Privacy">
        <P>{round.privacy_requirements || 'The team has not listed any special privacy requirements.'}</P>
      </Section>

      {!!demoUrl && (
        <Section title="Take a look first">
          <Muted>You can peek at the product before deciding.</Muted>
          <Button variant="secondary" title="Open the demo" testID="open-demo" onPress={() => { void Linking.openURL(demoUrl); }} />
        </Section>
      )}

      {creator && (
        <Section title="Who made it">
          <Row><H3>{creator.display_name}</H3>{creator.is_demo && <Badge tone="warn" label="Demo profile" />}</Row>
          {!!creator.bio && <P>{creator.bio}</P>}
        </Section>
      )}
    </>
  );
}

export default function RoundListing() {
  const { roundId } = useLocalSearchParams<{ roundId: string }>();
  const q = useQuery({ queryKey: keys.round(roundId), queryFn: () => api.roundDetail(roundId) });
  return (
    <Screen title={q.data?.product.name ?? 'Testing round'} footer={q.data ? <Footer d={q.data} /> : undefined}>
      <QueryView query={q}>{(d) => <Detail d={d} />}</QueryView>
    </Screen>
  );
}
