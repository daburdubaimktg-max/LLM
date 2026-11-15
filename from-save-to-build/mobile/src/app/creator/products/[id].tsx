import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { SignInPrompt } from '@/components/creator/parts';
import { countsLine, go, invalidate, newestFirst, optionsOf, orNull, param, releaseOptions, ROUND_STATUS } from '@/components/creator/util';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { CATEGORIES, date, STAGES } from '@/lib/labels';
import { keys } from '@/lib/query';
import { fieldErrors, productSchema, releaseSchema } from '@/lib/schemas';
import type { Asset, ProductBundle, ProjectTask, RoundSummary } from '@/lib/types';
import { Badge, Button, Card, Choice, confirm, Divider, ErrorNote, Field, H1, H3, KeyValue, Muted, Notice, P, QueryView, Row, Screen, Section,
  theme, useAction, type Tone } from '@/ui';

const ASSET_KINDS: Record<Asset['kind'], string> = { screenshot: 'Screenshot', demo_link: 'Demo link', logo: 'Logo' };
const TASK_STATUS: Record<ProjectTask['status'], { label: string; tone: Tone }> = {
  open: { label: 'Open', tone: 'neutral' }, in_progress: { label: 'In progress', tone: 'info' }, resolved: { label: 'Resolved', tone: 'good' },
  wont_fix: { label: 'Won’t fix', tone: 'neutral' } };
const PRIORITY: Record<ProjectTask['priority'], { label: string; tone: Tone }> = {
  low: { label: 'Low priority', tone: 'neutral' }, medium: { label: 'Medium priority', tone: 'info' }, high: { label: 'High priority', tone: 'warn' },
  urgent: { label: 'Urgent', tone: 'bad' } };

export default function ProductManagement() {
  const { userId } = useAuth();
  const id = param(useLocalSearchParams<{ id: string }>().id) ?? '';
  const product = useQuery({ queryKey: keys.product(id), queryFn: () => api.productDetail(id), enabled: !!userId && !!id });
  if (!userId) return <Screen title="Product"><SignInPrompt body="Sign in to manage your product." /></Screen>;
  return (
    <Screen title="Product">
      <QueryView query={product}>
        {(p) => <>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <H1 style={{ flex: 1 }}>{p.name}</H1>
            {p.is_demo && <Badge label="Demo" tone="info" />}
          </Row>
          <Details product={p} />
          <Assets product={p} />
          <Releases product={p} />
          <Rounds product={p} />
          <Improvements product={p} />
        </>}
      </QueryView>
    </Screen>
  );
}

const refresh = (productId: string) => invalidate(keys.product(productId), keys.creatorHome, keys.marketplace);

// ---------------------------------------------------------------- (a) details
function Details({ product: p }: { product: ProductBundle }) {
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ name: '', description: '', category: '', stage: '', stage_label: '', target_audience: '', demo_url: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (v: string) => setF((cur) => ({ ...cur, [k]: v }));
  const open = () => {
    setF({ name: p.name, description: p.description, category: p.category, stage: p.stage, stage_label: p.stage_label ?? '',
      target_audience: p.target_audience ?? '', demo_url: p.demo_url ?? '' });
    setErrors({}); setEditing(true);
  };
  const save = useAction(async () => {
    const parsed = productSchema.safeParse({ ...f, stage_label: f.stage_label.trim(), target_audience: f.target_audience.trim(), demo_url: f.demo_url.trim() });
    setErrors(fieldErrors(parsed));
    if (!parsed.success) throw new Error('Please check the highlighted fields.');
    await api.updateProduct(p.id, { name: parsed.data.name, description: parsed.data.description, category: parsed.data.category, stage: parsed.data.stage,
      stage_label: orNull(f.stage_label), target_audience: orNull(f.target_audience), demo_url: orNull(f.demo_url) });
    await refresh(p.id);
    setEditing(false);
  });
  return (
    <Section title="Details" action={!editing ? <Button small variant="secondary" title="Edit" onPress={open} testID="edit-product" /> : undefined}>
      {!editing
        ? <Card>
            <P>{p.description}</P>
            <Divider />
            <KeyValue k="Category" v={CATEGORIES[p.category] ?? p.category} />
            <KeyValue k="Stage" v={p.stage_label ? `${STAGES[p.stage] ?? p.stage} · ${p.stage_label}` : STAGES[p.stage] ?? p.stage} />
            <KeyValue k="Target audience" v={p.target_audience || '—'} />
            <KeyValue k="Demo link" v={p.demo_url || '—'} />
          </Card>
        : <>
            <Field label="Product name" value={f.name} onChangeText={set('name')} error={errors.name} testID="product-name" />
            <Field label="Description" value={f.description} onChangeText={set('description')} error={errors.description} multiline testID="product-description" />
            <Choice label="Category" options={optionsOf(CATEGORIES)} value={f.category} onChange={set('category')} error={errors.category} testID="product-category" />
            <Choice label="Stage" options={optionsOf(STAGES)} value={f.stage} onChange={set('stage')} error={errors.stage} testID="product-stage" />
            <Field label="Stage label" hint="Optional. Your own wording, for example “Beta prototype”." value={f.stage_label} onChangeText={set('stage_label')}
              error={errors.stage_label} testID="product-stage-label" />
            <Field label="Target audience" hint="Optional." value={f.target_audience} onChangeText={set('target_audience')} error={errors.target_audience} multiline testID="product-audience" />
            <Field label="Demo link" hint="Optional. A full link, starting with https://" value={f.demo_url} onChangeText={set('demo_url')} error={errors.demo_url}
              keyboardType="url" autoCapitalize="none" testID="product-demo-url" />
            <ErrorNote error={save.error} />
            <Button title="Save details" onPress={() => save.run()} loading={save.loading} testID="save-product" />
            <Button variant="ghost" title="Cancel" onPress={() => { save.clearError(); setEditing(false); }} />
          </>}
    </Section>
  );
}

// ---------------------------------------------------------------- (b) screenshots & demo links
function Assets({ product: p }: { product: ProductBundle }) {
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<Asset['kind']>('screenshot');
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [urlError, setUrlError] = useState<string | undefined>();
  const add = useAction(async () => {
    const link = url.trim();
    const ok = /^https?:\/\/\S+$/i.test(link);
    setUrlError(ok ? undefined : 'Enter a full link, starting with https://');
    if (!ok) throw new Error('Please check the link.');
    await api.addAsset(p.id, { kind, url: link, caption: orNull(caption) ?? undefined });
    await refresh(p.id);
    setUrl(''); setCaption(''); setAdding(false);
  });
  const remove = useAction(async (assetId: string) => {
    if (!(await confirm('Remove this item?', 'It will no longer appear on your listing.'))) return;
    await api.removeAsset(assetId);
    await refresh(p.id);
  });
  return (
    <Section title="Screenshots & demo links">
      {p.assets.length === 0 && <Muted>Nothing added yet. Screenshots and a demo link help testers decide whether to apply.</Muted>}
      {p.assets.map((a) => (
        <Card key={a.id}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Badge label={ASSET_KINDS[a.kind] ?? a.kind} />
              {!!a.caption && <P>{a.caption}</P>}
              <Muted style={{ fontSize: theme.font.small }} numberOfLines={2}>{a.url ?? a.storage_path ?? '—'}</Muted>
            </View>
            <Button small variant="ghost" title="Remove" disabled={remove.loading} onPress={() => remove.run(a.id)} testID={`remove-asset-${a.id}`} />
          </Row>
        </Card>
      ))}
      <ErrorNote error={remove.error} />
      {!adding
        ? <Button variant="secondary" title="Add by link" onPress={() => setAdding(true)} testID="add-asset" />
        : <>
            <Choice label="What is it?" options={optionsOf(ASSET_KINDS)} value={kind} onChange={setKind} testID="asset-kind" />
            <Field label="Link" hint="Uploading image files is not built yet — for now, paste a link to an image or demo that is already online."
              value={url} onChangeText={setUrl} error={urlError} keyboardType="url" autoCapitalize="none" placeholder="https://" testID="asset-url" />
            <Field label="Caption" hint="Optional." value={caption} onChangeText={setCaption} testID="asset-caption" />
            <ErrorNote error={add.error} />
            <Button title="Add" onPress={() => add.run()} loading={add.loading} testID="save-asset" />
            <Button variant="ghost" title="Cancel" onPress={() => { add.clearError(); setAdding(false); }} />
          </>}
    </Section>
  );
}

// ---------------------------------------------------------------- (c) releases
function Releases({ product: p }: { product: ProductBundle }) {
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ version: '', notes: '', access_url: '', access_instructions: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (v: string) => setF((cur) => ({ ...cur, [k]: v }));
  const add = useAction(async () => {
    const parsed = releaseSchema.safeParse({ version: f.version, notes: f.notes.trim(), access_url: f.access_url.trim(), access_instructions: f.access_instructions.trim() });
    setErrors(fieldErrors(parsed));
    if (!parsed.success) throw new Error('Please check the highlighted fields.');
    await api.createRelease(p.id, { version: parsed.data.version, notes: orNull(f.notes) ?? undefined, access_url: orNull(f.access_url) ?? undefined,
      access_instructions: orNull(f.access_instructions) ?? undefined });
    await refresh(p.id);
    setF({ version: '', notes: '', access_url: '', access_instructions: '' }); setAdding(false);
  });
  const releases = newestFirst(p.releases);
  return (
    <Section title="Releases">
      {releases.length === 0 && <Muted>No releases yet. Add one before creating a testing round.</Muted>}
      {releases.length > 0 && <Card>
        {releases.map((r, i) => (
          <View key={r.id} style={{ gap: 2 }}>
            {i > 0 && <Divider />}
            <Row style={{ justifyContent: 'space-between' }}><H3>{r.version}</H3><Muted style={{ fontSize: theme.font.small }}>{date(r.released_at)}</Muted></Row>
            {!!r.notes && <Muted style={{ fontSize: theme.font.small }}>{r.notes}</Muted>}
          </View>
        ))}
      </Card>}
      {!adding
        ? <Button variant="secondary" title="Add release" onPress={() => setAdding(true)} testID="add-release" />
        : <>
            <Field label="Version" placeholder="v0.2.0" value={f.version} onChangeText={set('version')} error={errors.version} autoCapitalize="none" testID="release-version" />
            <Field label="Release notes" hint="Optional. What changed." value={f.notes} onChangeText={set('notes')} error={errors.notes} multiline testID="release-notes" />
            <Field label="Access link" hint="Optional." value={f.access_url} onChangeText={set('access_url')} error={errors.access_url} keyboardType="url"
              autoCapitalize="none" testID="release-access-url" />
            <Field label="Access instructions" hint="Optional." value={f.access_instructions} onChangeText={set('access_instructions')} error={errors.access_instructions}
              multiline testID="release-access-instructions" />
            <ErrorNote error={add.error} />
            <Button title="Save release" onPress={() => add.run()} loading={add.loading} testID="save-release" />
            <Button variant="ghost" title="Cancel" onPress={() => { add.clearError(); setAdding(false); }} />
          </>}
    </Section>
  );
}

// ---------------------------------------------------------------- (d) testing rounds
function Rounds({ product: p }: { product: ProductBundle }) {
  const rounds = [...p.rounds].sort((a, b) => b.round_number - a.round_number);
  return (
    <Section title="Testing rounds">
      {p.releases.length === 0
        ? <Notice tone="neutral">Add a release first — every round tests one exact release.</Notice>
        : <Button title="New testing round" onPress={() => go(`/creator/rounds/new?productId=${p.id}`)} testID="new-round" />}
      {rounds.length === 0 && <Muted>No testing rounds yet.</Muted>}
      {rounds.map((r) => <RoundCard key={r.id} round={r} product={p} />)}
    </Section>
  );
}

function RoundCard({ round: r, product: p }: { round: RoundSummary; product: ProductBundle }) {
  const [retesting, setRetesting] = useState(false);
  const releases = newestFirst(p.releases);
  const [releaseId, setReleaseId] = useState(() => releases.find((x) => x.id !== r.release_id)?.id ?? '');
  const retest = useAction(async () => {
    if (!releaseId) throw new Error('Choose the release to retest on.');
    const newId = await api.createFollowupRound(r.id, releaseId);
    await refresh(p.id);
    go(`/creator/rounds/${newId}/settings`);
  });
  return (
    <Card>
      <Pressable accessibilityRole="button" onPress={() => go(`/creator/rounds/${r.id}`)} testID={`round-${r.id}`}
        style={({ pressed }) => [{ gap: 4 }, pressed && { opacity: 0.7 }]}>
        <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <H3 style={{ flex: 1 }}>{r.title}</H3>
          <Badge label={ROUND_STATUS[r.status].label} tone={ROUND_STATUS[r.status].tone} />
        </Row>
        <Muted style={{ fontSize: theme.font.small }}>Round {r.round_number} · {r.version}</Muted>
        <Muted style={{ fontSize: theme.font.small }}>{countsLine(r)}</Muted>
        <Muted style={{ fontSize: theme.font.small }}>{r.reports === 1 ? '1 report' : `${r.reports} reports`}</Muted>
      </Pressable>
      {!retesting
        ? <Row wrap>
            {r.status === 'draft' && <Button small variant="secondary" title="Continue setup" onPress={() => go(`/creator/rounds/${r.id}/settings`)} testID={`setup-round-${r.id}`} />}
            <Button small variant="ghost" title="Retest on another release" onPress={() => setRetesting(true)} testID={`retest-round-${r.id}`} />
          </Row>
        : <View style={{ gap: theme.space.md, marginTop: theme.space.sm }}>
            <Divider />
            <Muted style={{ fontSize: theme.font.small }}>This copies the round's setup and tasks. Results and reports of the earlier round are never changed.</Muted>
            <Choice label="Release to retest on" options={releaseOptions(p.releases)} value={releaseId} onChange={setReleaseId}
              hint={releases.length < 2 ? 'This product has one release. Add a newer release above to retest after changes.' : undefined} testID={`retest-release-${r.id}`} />
            <ErrorNote error={retest.error} />
            <Button title="Create follow-up round" onPress={() => retest.run()} loading={retest.loading} testID={`create-followup-${r.id}`} />
            <Button variant="ghost" title="Cancel" onPress={() => { retest.clearError(); setRetesting(false); }} />
          </View>}
    </Card>
  );
}

// ---------------------------------------------------------------- (e) improvement tasks
function Improvements({ product: p }: { product: ProductBundle }) {
  if (p.project_tasks.length === 0) {
    return <Section title="Improvement tasks"><Muted>None yet. You can turn approved findings from a validation report into improvement tasks.</Muted></Section>;
  }
  return <Section title="Improvement tasks">{p.project_tasks.map((t) => <ImprovementCard key={t.id} task={t} product={p} />)}</Section>;
}

function ImprovementCard({ task: t, product: p }: { task: ProjectTask; product: ProductBundle }) {
  const [resolving, setResolving] = useState(false);
  const [releaseId, setReleaseId] = useState(t.resolved_in_release_id ?? '');
  const update = useAction(async (status: ProjectTask['status'], resolvedIn: string | null = null) => {
    await api.updateProjectTask(t.id, { status, resolved_in_release_id: status === 'resolved' ? resolvedIn : null });
    await refresh(p.id);
    setResolving(false);
  });
  const resolvedIn = p.releases.find((r) => r.id === t.resolved_in_release_id)?.version;
  const statuses = (Object.keys(TASK_STATUS) as ProjectTask['status'][]).filter((s) => s !== t.status);
  return (
    <Card>
      <H3>{t.title}</H3>
      <Row wrap>
        <Badge label={TASK_STATUS[t.status].label} tone={TASK_STATUS[t.status].tone} />
        <Badge label={PRIORITY[t.priority].label} tone={PRIORITY[t.priority].tone} />
        {!!t.finding_id && <Badge label="From finding" />}
      </Row>
      {!!t.description && <Muted style={{ fontSize: theme.font.small }}>{t.description}</Muted>}
      <Muted style={{ fontSize: theme.font.small }}>
        Owner: {t.owner_name || 'unassigned'} · Due: {t.due_date ? date(t.due_date) : 'no date'}{resolvedIn ? ` · Resolved in ${resolvedIn}` : ''}
      </Muted>
      {!resolving
        ? <Row wrap>{statuses.map((s) => (
            <Button key={s} small variant="secondary" title={`Mark ${TASK_STATUS[s].label.toLowerCase()}`} disabled={update.loading}
              onPress={() => (s === 'resolved' ? setResolving(true) : update.run(s))} testID={`task-${t.id}-${s}`} />
          ))}</Row>
        : <View style={{ gap: theme.space.md }}>
            <Choice label="Resolved in release" hint="Optional. Helps you retest the fix on the right version."
              options={[{ value: '', label: 'Not tied to a release' }, ...releaseOptions(p.releases)]} value={releaseId} onChange={setReleaseId} testID={`task-${t.id}-release`} />
            <Button title="Mark resolved" onPress={() => update.run('resolved', releaseId || null)} loading={update.loading} testID={`task-${t.id}-confirm-resolved`} />
            <Button variant="ghost" title="Cancel" onPress={() => setResolving(false)} />
          </View>}
      <ErrorNote error={update.error} />
    </Card>
  );
}
