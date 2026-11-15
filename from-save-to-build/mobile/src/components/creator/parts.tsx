// Small presentational pieces shared by the creator setup screens.
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Empty, Muted, Row, theme } from '@/ui';
import { go, moved } from './util';

export function SignInPrompt({ body }: { body: string }) {
  return <Empty title="Sign in to continue" body={body} action={<Button title="Sign in" onPress={() => go('/sign-in')} testID="go-sign-in" />} />;
}

/** Up / down / remove controls for a row in an ordered list. */
export function RowActions({ index, count, onMove, onRemove, disabled, testID }: {
  index: number; count: number; onMove: (delta: -1 | 1) => void; onRemove?: () => void; disabled?: boolean; testID?: string }) {
  return (
    <Row wrap>
      <Button small variant="secondary" title="Move up" disabled={disabled || index === 0} onPress={() => onMove(-1)} testID={testID && `${testID}-up`} />
      <Button small variant="secondary" title="Move down" disabled={disabled || index === count - 1} onPress={() => onMove(1)} testID={testID && `${testID}-down`} />
      {onRemove && <Button small variant="ghost" title="Remove" disabled={disabled} onPress={onRemove} testID={testID && `${testID}-remove`} />}
    </Row>
  );
}

/** Editable list of short text rows (objectives, instruction steps, success criteria…). */
export function StringList({ label, hint, items, onChange, addLabel = 'Add', placeholder, ordered, error, testID }: {
  label?: string; hint?: string; items: string[]; onChange: (items: string[]) => void; addLabel?: string; placeholder?: string;
  ordered?: boolean; error?: string; testID: string }) {
  const set = (i: number, v: string) => onChange(items.map((x, j) => (j === i ? v : x)));
  return (
    <View style={{ gap: theme.space.sm }}>
      {label && <Text style={s.label}>{label}</Text>}
      {hint && <Muted style={{ fontSize: theme.font.small }}>{hint}</Muted>}
      {items.map((item, i) => (
        <View key={i} style={s.row}>
          <Row style={{ alignItems: 'flex-start' }}>
            {ordered && <Text style={s.number}>{i + 1}</Text>}
            <TextInput testID={`${testID}-${i}`} accessibilityLabel={`${label ?? 'Item'} ${i + 1}`} value={item} onChangeText={(v) => set(i, v)}
              placeholder={placeholder} placeholderTextColor="#A3A8AC" multiline style={s.input} />
          </Row>
          <Row wrap>
            {ordered && items.length > 1 && <>
              <Button small variant="ghost" title="Up" disabled={i === 0} onPress={() => onChange(moved(items, i, -1))} />
              <Button small variant="ghost" title="Down" disabled={i === items.length - 1} onPress={() => onChange(moved(items, i, 1))} />
            </>}
            <Button small variant="ghost" title="Remove" onPress={() => onChange(items.filter((_, j) => j !== i))} testID={`${testID}-${i}-remove`} />
          </Row>
        </View>
      ))}
      <Button small variant="secondary" title={addLabel} onPress={() => onChange([...items, ''])} testID={`${testID}-add`} style={{ alignSelf: 'flex-start' }} />
      {!!error && <Text style={s.error}>{error}</Text>}
    </View>
  );
}

const c = theme.color;
const s = StyleSheet.create({
  label: { fontSize: theme.font.body, fontWeight: '600', color: c.ink, lineHeight: 22 },
  row: { gap: 2 },
  number: { width: 22, paddingTop: 14, fontSize: theme.font.small, fontWeight: '700', color: c.accent, textAlign: 'center' },
  input: { flex: 1, borderWidth: 1, borderColor: c.line, borderRadius: theme.radius.md, paddingHorizontal: theme.space.lg, paddingVertical: 14,
    fontSize: theme.font.body, color: c.ink, backgroundColor: c.surface, minHeight: 52, textAlignVertical: 'top' },
  error: { color: c.bad, fontSize: theme.font.small },
});
