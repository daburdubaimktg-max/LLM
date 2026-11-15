// Shared UI kit. One restrained accent colour, generous spacing, rounded cards, plain language.
import type { UseQueryResult } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const theme = {
  color: { bg: '#FAFAF7', surface: '#FFFFFF', ink: '#16181A', body: '#3B4043', muted: '#6E7479', line: '#E7E6E1', soft: '#F2F1EC',
    accent: '#1F6F5B', accentSoft: '#E4F1EC', onAccent: '#FFFFFF',
    good: '#1F6F5B', goodSoft: '#E4F1EC', warn: '#8A5A00', warnSoft: '#FBF1DC', bad: '#A3352B', badSoft: '#FBE9E6', info: '#2B5C8A', infoSoft: '#E6EFF8' },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { sm: 10, md: 14, lg: 20, pill: 999 },
  font: { h1: 28, h2: 21, h3: 17, body: 16, small: 14, tiny: 12 },
};
const c = theme.color;
export type Tone = 'neutral' | 'info' | 'good' | 'warn' | 'bad';
const toneColors: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: c.soft, fg: c.body }, info: { bg: c.infoSoft, fg: c.info }, good: { bg: c.goodSoft, fg: c.good },
  warn: { bg: c.warnSoft, fg: c.warn }, bad: { bg: c.badSoft, fg: c.bad },
};

// ---------------------------------------------------------------- text
type TP = { children: ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number };
export const H1 = ({ children, style }: TP) => <Text accessibilityRole="header" style={[s.h1, style]}>{children}</Text>;
export const H2 = ({ children, style }: TP) => <Text accessibilityRole="header" style={[s.h2, style]}>{children}</Text>;
export const H3 = ({ children, style }: TP) => <Text style={[s.h3, style]}>{children}</Text>;
export const P = ({ children, style, numberOfLines }: TP) => <Text numberOfLines={numberOfLines} style={[s.p, style]}>{children}</Text>;
export const Muted = ({ children, style, numberOfLines }: TP) => <Text numberOfLines={numberOfLines} style={[s.muted, style]}>{children}</Text>;
export const Eyebrow = ({ children, style }: TP) => <Text style={[s.eyebrow, style]}>{children}</Text>;

// ---------------------------------------------------------------- layout
export function Screen({ title, children, footer, scroll = true }: { title?: string; children: ReactNode; footer?: ReactNode; scroll?: boolean }) {
  const body = <View style={s.screenInner}>{children}</View>;
  return (
    <SafeAreaView style={s.screen} edges={['bottom', 'left', 'right']}>
      {title !== undefined && <Stack.Screen options={{ title }} />}
      {scroll ? <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">{body}</ScrollView> : body}
      {footer && <View style={s.footer}><View style={s.footerInner}>{footer}</View></View>}
    </SafeAreaView>
  );
}
export const Row = ({ children, style, wrap, gap = theme.space.sm }: { children: ReactNode; style?: StyleProp<ViewStyle>; wrap?: boolean; gap?: number }) =>
  <View style={[{ flexDirection: 'row', alignItems: 'center', gap, flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>{children}</View>;
export const Stack2 = ({ children, gap = theme.space.md, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) =>
  <View style={[{ gap }, style]}>{children}</View>;
export const Divider = () => <View style={{ height: 1, backgroundColor: c.line, marginVertical: theme.space.sm }} />;
export const Spacer = ({ size = theme.space.lg }: { size?: number }) => <View style={{ height: size }} />;

export function Card({ children, onPress, style, testID }: { children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>; testID?: string }) {
  if (!onPress) return <View testID={testID} style={[s.card, style]}>{children}</View>;
  return <Pressable testID={testID} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }, style]}>{children}</Pressable>;
}
export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ gap: theme.space.md, marginTop: theme.space.xl }}>
      <Row style={{ justifyContent: 'space-between' }}><H2>{title}</H2>{action}</Row>
      {children}
    </View>
  );
}

// ---------------------------------------------------------------- controls
export function Button({ title, onPress, variant = 'primary', loading, disabled, small, testID, style }: {
  title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; loading?: boolean; disabled?: boolean; small?: boolean; testID?: string; style?: StyleProp<ViewStyle> }) {
  const off = disabled || loading;
  const bg = variant === 'primary' ? c.accent : variant === 'danger' ? c.badSoft : variant === 'secondary' ? c.surface : 'transparent';
  const fg = variant === 'primary' ? c.onAccent : variant === 'danger' ? c.bad : c.ink;
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ disabled: !!off }} disabled={off} onPress={onPress}
      style={({ pressed }) => [s.button, small && s.buttonSmall, { backgroundColor: bg, borderColor: variant === 'secondary' ? c.line : 'transparent' },
        (pressed || off) && { opacity: off ? 0.5 : 0.85 }, style]}>
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[s.buttonText, small && { fontSize: theme.font.small }, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}
export function Field({ label, value, onChangeText, error, hint, placeholder, multiline, keyboardType, secure, testID, autoCapitalize }: {
  label: string; value: string; onChangeText: (v: string) => void; error?: string; hint?: string; placeholder?: string; multiline?: boolean;
  keyboardType?: 'default' | 'numeric' | 'email-address' | 'url'; secure?: boolean; testID?: string; autoCapitalize?: 'none' | 'sentences' }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      {hint && <Muted style={{ fontSize: theme.font.small }}>{hint}</Muted>}
      <TextInput testID={testID} accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#A3A8AC"
        multiline={multiline} keyboardType={keyboardType} secureTextEntry={secure} autoCapitalize={autoCapitalize}
        style={[s.input, multiline && { minHeight: 96, textAlignVertical: 'top' }, !!error && { borderColor: c.bad }]} />
      {!!error && <Text style={s.error}>{error}</Text>}
    </View>
  );
}
export interface Option { value: string; label: string }
/** Single- or multi-select list of large, tappable options. */
export function Choice({ label, options, value, onChange, multi, error, hint, testID }: { label?: string; options: Option[]; value: string | string[] | null | undefined;
  onChange: (v: any) => void; multi?: boolean; error?: string; hint?: string; testID?: string }) {
  const selected = (v: string) => (multi ? Array.isArray(value) && value.includes(v) : value === v);
  const toggle = (v: string) => {
    if (!multi) return onChange(v);
    const cur = Array.isArray(value) ? value : [];
    onChange(cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);
  };
  return (
    <View style={{ gap: theme.space.sm }} testID={testID}>
      {label && <Text style={s.label}>{label}</Text>}
      {hint && <Muted style={{ fontSize: theme.font.small }}>{hint}</Muted>}
      {options.map((o) => (
        <Pressable key={o.value} accessibilityRole={multi ? 'checkbox' : 'radio'} accessibilityState={{ checked: selected(o.value) }} onPress={() => toggle(o.value)}
          style={[s.option, selected(o.value) && s.optionOn]}>
          <View style={[multi ? s.box : s.dot, selected(o.value) && { borderColor: c.accent, backgroundColor: c.accent }]}>
            {selected(o.value) && <Text style={{ color: c.onAccent, fontSize: 12, fontWeight: '700' }}>✓</Text>}
          </View>
          <Text style={[s.p, { flex: 1, color: c.ink }]}>{o.label}</Text>
        </Pressable>
      ))}
      {!!error && <Text style={s.error}>{error}</Text>}
    </View>
  );
}
export function Check({ label, checked, onChange, hint, error, testID }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string; error?: string; testID?: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Pressable testID={testID} accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => onChange(!checked)} style={[s.option, checked && s.optionOn]}>
        <View style={[s.box, checked && { borderColor: c.accent, backgroundColor: c.accent }]}>{checked && <Text style={{ color: c.onAccent, fontSize: 12, fontWeight: '700' }}>✓</Text>}</View>
        <View style={{ flex: 1, gap: 2 }}><Text style={[s.p, { color: c.ink }]}>{label}</Text>{hint && <Muted style={{ fontSize: theme.font.small }}>{hint}</Muted>}</View>
      </Pressable>
      {!!error && <Text style={s.error}>{error}</Text>}
    </View>
  );
}
export function Chip({ label, selected, onPress, testID }: { label: string; selected?: boolean; onPress?: () => void; testID?: string }) {
  return (
    <Pressable testID={testID} disabled={!onPress} accessibilityRole="button" accessibilityState={{ selected: !!selected }} onPress={onPress}
      style={[s.chip, selected && { backgroundColor: c.ink, borderColor: c.ink }]}>
      <Text style={{ fontSize: theme.font.small, color: selected ? c.surface : c.body, fontWeight: '500' }}>{label}</Text>
    </Pressable>
  );
}
/** Horizontal single-select filter. An empty value means "any". */
export function ChipSelect({ label, options, value, onChange, anyLabel = 'Any' }: { label?: string; options: Option[]; value: string; onChange: (v: string) => void; anyLabel?: string }) {
  return (
    <View style={{ gap: 6 }}>
      {label && <Text style={s.filterLabel}>{label}</Text>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.space.sm }}>
        <Chip label={anyLabel} selected={!value} onPress={() => onChange('')} />
        {options.map((o) => <Chip key={o.value} label={o.label} selected={value === o.value} onPress={() => onChange(value === o.value ? '' : o.value)} />)}
      </ScrollView>
    </View>
  );
}
export function Rating({ value, onChange, error }: { value: number | null; onChange: (v: number) => void; error?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Row gap={theme.space.sm}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} accessibilityRole="radio" accessibilityLabel={`${n} out of 5`} accessibilityState={{ checked: value === n }} onPress={() => onChange(n)}
            style={[s.rating, value === n && { backgroundColor: c.accent, borderColor: c.accent }]}>
            <Text style={{ fontSize: theme.font.h3, fontWeight: '600', color: value === n ? c.onAccent : c.ink }}>{n}</Text>
          </Pressable>
        ))}
      </Row>
      <Row style={{ justifyContent: 'space-between', maxWidth: 5 * 52 + 4 * 8 }}><Muted style={{ fontSize: theme.font.tiny }}>Poor</Muted><Muted style={{ fontSize: theme.font.tiny }}>Excellent</Muted></Row>
      {!!error && <Text style={s.error}>{error}</Text>}
    </View>
  );
}

// ---------------------------------------------------------------- display
export function Badge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const t = toneColors[tone];
  return <View style={[s.badge, { backgroundColor: t.bg }]}><Text style={{ color: t.fg, fontSize: theme.font.tiny, fontWeight: '600' }}>{label}</Text></View>;
}
export function Notice({ tone = 'info', title, children }: { tone?: Tone; title?: string; children?: ReactNode }) {
  const t = toneColors[tone];
  return (
    <View style={[s.notice, { backgroundColor: t.bg }]}>
      {title && <Text style={{ color: t.fg, fontWeight: '600', fontSize: theme.font.body }}>{title}</Text>}
      {typeof children === 'string' ? <Text style={{ color: t.fg, fontSize: theme.font.small, lineHeight: 20 }}>{children}</Text> : children}
    </View>
  );
}
export function Progress({ value, total, label }: { value: number; total: number; label?: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <View style={{ gap: 6 }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: value }}>
      {label && <Row style={{ justifyContent: 'space-between' }}><Muted style={{ fontSize: theme.font.small }}>{label}</Muted><Muted style={{ fontSize: theme.font.small }}>{value} of {total}</Muted></Row>}
      <View style={s.track}><View style={[s.fill, { width: `${pct}%` }]} /></View>
    </View>
  );
}
export function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <View style={s.stat}>
      <Text style={{ fontSize: 24, fontWeight: '700', color: c.ink }}>{value}</Text>
      <Text style={{ fontSize: theme.font.small, color: c.body }}>{label}</Text>
      {hint && <Muted style={{ fontSize: theme.font.tiny }}>{hint}</Muted>}
    </View>
  );
}
export const StatGrid = ({ children }: { children: ReactNode }) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm }}>{children}</View>;
export function KeyValue({ k, v }: { k: string; v: ReactNode }) {
  return (
    <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 6 }} gap={theme.space.lg}>
      <Muted style={{ fontSize: theme.font.small, flexShrink: 0 }}>{k}</Muted>
      {typeof v === 'string' || typeof v === 'number' ? <Text style={[s.p, { flex: 1, textAlign: 'right', fontSize: theme.font.small, color: c.ink }]}>{v}</Text> : <View style={{ flex: 1, alignItems: 'flex-end' }}>{v}</View>}
    </Row>
  );
}
export function Bullets({ items, ordered }: { items: string[]; ordered?: boolean }) {
  return (
    <View style={{ gap: theme.space.sm }}>
      {items.map((item, i) => (
        <Row key={i} style={{ alignItems: 'flex-start' }} gap={theme.space.md}>
          {ordered ? <View style={s.step}><Text style={{ fontSize: theme.font.tiny, fontWeight: '700', color: c.accent }}>{i + 1}</Text></View>
            : <Text style={{ color: c.muted, fontSize: theme.font.body, lineHeight: 24 }}>•</Text>}
          <Text style={[s.p, { flex: 1 }]}>{item}</Text>
        </Row>
      ))}
    </View>
  );
}
export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return <View style={s.empty}><H3 style={{ textAlign: 'center' }}>{title}</H3>{body && <Muted style={{ textAlign: 'center' }}>{body}</Muted>}{action}</View>;
}
export const Loading = () => <View style={{ padding: theme.space.xxl, alignItems: 'center' }}><ActivityIndicator color={c.accent} /></View>;
export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return <Notice tone="bad">{error instanceof Error ? error.message : String(error)}</Notice>;
}
/** Renders loading / error / data for a TanStack query. */
export function QueryView<T>({ query, children }: { query: UseQueryResult<T>; children: (data: T) => ReactNode }) {
  if (query.isPending) return <Loading />;
  if (query.isError) return <View style={{ gap: theme.space.md }}><ErrorNote error={query.error} /><Button title="Try again" variant="secondary" onPress={() => query.refetch()} /></View>;
  return <>{children(query.data as T)}</>;
}

// ---------------------------------------------------------------- behaviour helpers
/** Wraps an async action with loading + error state. */
export function useAction<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const run = useCallback(async (...args: A) => {
    setLoading(true); setError(null);
    try { await fn(...args); return true; } catch (e) { setError(e); return false; } finally { setLoading(false); }
  }, [fn]);
  return { run, loading, error, clearError: () => setError(null) };
}
export function confirm(title: string, message: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(typeof window !== 'undefined' ? window.confirm(`${title}\n\n${message}`) : true);
  return new Promise((resolve) => Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) }, { text: 'Continue', onPress: () => resolve(true) }]));
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  scroll: { paddingBottom: theme.space.xxl * 2 },
  screenInner: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: theme.space.lg, gap: theme.space.md },
  footer: { borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.surface },
  footerInner: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: theme.space.lg, gap: theme.space.sm },
  h1: { fontSize: theme.font.h1, fontWeight: '700', color: c.ink, letterSpacing: -0.4, lineHeight: 34 },
  h2: { fontSize: theme.font.h2, fontWeight: '700', color: c.ink, letterSpacing: -0.2, lineHeight: 27 },
  h3: { fontSize: theme.font.h3, fontWeight: '600', color: c.ink, lineHeight: 23 },
  p: { fontSize: theme.font.body, color: c.body, lineHeight: 24 },
  muted: { fontSize: theme.font.body, color: c.muted, lineHeight: 22 },
  eyebrow: { fontSize: theme.font.tiny, color: c.muted, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  card: { backgroundColor: c.surface, borderRadius: theme.radius.lg, padding: theme.space.lg, borderWidth: 1, borderColor: c.line, gap: theme.space.sm },
  button: { minHeight: 52, borderRadius: theme.radius.md, paddingHorizontal: theme.space.xl, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  buttonSmall: { minHeight: 40, paddingHorizontal: theme.space.lg, borderRadius: theme.radius.sm },
  buttonText: { fontSize: theme.font.body, fontWeight: '600' },
  label: { fontSize: theme.font.body, fontWeight: '600', color: c.ink, lineHeight: 22 },
  filterLabel: { fontSize: theme.font.tiny, fontWeight: '600', color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { borderWidth: 1, borderColor: c.line, borderRadius: theme.radius.md, paddingHorizontal: theme.space.lg, paddingVertical: 14,
    fontSize: theme.font.body, color: c.ink, backgroundColor: c.surface, minHeight: 52 },
  error: { color: c.bad, fontSize: theme.font.small },
  option: { flexDirection: 'row', alignItems: 'center', gap: theme.space.md, padding: theme.space.lg, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, minHeight: 56 },
  optionOn: { borderColor: c.accent, backgroundColor: c.accentSoft },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#C9CCCF', alignItems: 'center', justifyContent: 'center' },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#C9CCCF', alignItems: 'center', justifyContent: 'center' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radius.pill, alignSelf: 'flex-start' },
  notice: { borderRadius: theme.radius.md, padding: theme.space.lg, gap: 6 },
  track: { height: 8, borderRadius: 4, backgroundColor: c.soft, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: c.accent },
  stat: { flexGrow: 1, flexBasis: 140, backgroundColor: c.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: c.line, padding: theme.space.lg, gap: 2 },
  step: { width: 24, height: 24, borderRadius: 12, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' },
  rating: { width: 52, height: 52, borderRadius: theme.radius.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' },
  empty: { padding: theme.space.xxl, alignItems: 'center', gap: theme.space.md },
});
