// Consent-aware evidence upload. Only offers the kinds of evidence the tester agreed to share
// when they started the session; everything here is optional.
import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { api, type EvidenceTarget } from '@/lib/api';
import { EVIDENCE, dateTime } from '@/lib/labels';
import type { EvidenceFile, EvidenceKind } from '@/lib/types';
import { Badge, Button, ErrorNote, Muted, P, Row, theme, useAction } from '@/ui';

type ConsentFlags = { screenshots: boolean; recordings: boolean; voice: boolean } | null | undefined;

const KINDS: { kind: EvidenceKind; consentKey: 'screenshots' | 'recordings' | 'voice'; mime: string; add: string; plural: string }[] = [
  { kind: 'screenshot', consentKey: 'screenshots', mime: 'image/*', add: 'Add a screenshot', plural: 'screenshots' },
  { kind: 'recording', consentKey: 'recordings', mime: 'video/*', add: 'Add a screen recording', plural: 'screen recordings' },
  { kind: 'voice', consentKey: 'voice', mime: 'audio/*', add: 'Add a voice note', plural: 'voice notes' },
];

/** Read-only list of private evidence files. Tapping one opens it through a short-lived link. */
export function EvidenceList({ files }: { files: EvidenceFile[] }) {
  const open = useAction(async (path: string) => { await Linking.openURL(await api.evidenceUrl(path)); });
  if (!files.length) return null;
  return (
    <View style={{ gap: theme.space.sm }}>
      {files.map((f) => (
        <Pressable key={f.id} accessibilityRole="link" onPress={() => open.run(f.storage_path)}
          style={{ borderWidth: 1, borderColor: theme.color.line, borderRadius: theme.radius.md, backgroundColor: theme.color.surface, padding: theme.space.md, gap: 4 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <P numberOfLines={1} style={{ flex: 1, color: theme.color.ink }}>{f.file_name ?? EVIDENCE[f.kind] ?? 'File'}</P>
            <Badge label={EVIDENCE[f.kind] ?? f.kind} />
          </Row>
          <Muted style={{ fontSize: theme.font.small }}>Added {dateTime(f.created_at)} · Tap to open</Muted>
        </Pressable>
      ))}
      <ErrorNote error={open.error} />
    </View>
  );
}

export function EvidenceUploader({ sessionId, target, consent, existing = [], onUploaded, suggested }: {
  sessionId: string; target: EvidenceTarget; consent: ConsentFlags; existing?: EvidenceFile[];
  onUploaded?: () => unknown; /** Kinds the task says would help. Purely informational. */ suggested?: EvidenceKind[] }) {
  const [justAdded, setJustAdded] = useState<{ name: string; kind: EvidenceKind }[]>([]);
  const [busyKind, setBusyKind] = useState<EvidenceKind | null>(null);
  const upload = useAction(async (kind: EvidenceKind, mime: string) => {
    const result = await DocumentPicker.getDocumentAsync({ type: mime, copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setBusyKind(kind);
    try {
      await api.uploadEvidence(sessionId, target, kind, { name: asset.name, mimeType: asset.mimeType ?? null, size: asset.size ?? null, uri: asset.uri, file: asset.file });
      setJustAdded((cur) => [...cur, { name: asset.name, kind }]);
      await onUploaded?.();
    } finally { setBusyKind(null); }
  });
  const known = new Set(existing.map((f) => f.file_name));
  const pending = justAdded.filter((f) => !known.has(f.name));
  const allowed = KINDS.filter((k) => !!consent?.[k.consentKey]);
  const declined = KINDS.filter((k) => !consent?.[k.consentKey]);

  return (
    <View style={{ gap: theme.space.md }}>
      {!!suggested?.length && (
        <Muted style={{ fontSize: theme.font.small }}>
          It would help the team to see: {suggested.map((k) => (EVIDENCE[k] ?? k).toLowerCase()).join(', ')}. This is optional — share only what you are comfortable with.
        </Muted>
      )}
      <EvidenceList files={existing} />
      {pending.map((f, i) => <Muted key={`${f.name}-${i}`} style={{ fontSize: theme.font.small }}>Uploaded: {f.name} ({(EVIDENCE[f.kind] ?? f.kind).toLowerCase()})</Muted>)}
      {allowed.map((k) => (
        <Button key={k.kind} variant="secondary" title={k.add} testID={`add-${k.kind}`} loading={busyKind === k.kind}
          disabled={upload.loading && busyKind !== k.kind} onPress={() => upload.run(k.kind, k.mime)} />
      ))}
      {declined.map((k) => <Muted key={k.kind} style={{ fontSize: theme.font.small }}>You chose not to share {k.plural} — that's fine.</Muted>)}
      <ErrorNote error={upload.error} />
    </View>
  );
}
