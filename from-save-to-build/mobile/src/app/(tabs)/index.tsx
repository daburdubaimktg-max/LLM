import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { go, minutesRange } from '@/components/tester';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { CATEGORIES, COUNTRIES, DEVICES, REWARDS, STAGES } from '@/lib/labels';
import { keys } from '@/lib/query';
import { emptyFilters, useMarketFilters, type MarketFilters } from '@/lib/store';
import type { Listing, Profile } from '@/lib/types';
import { Badge, Button, Card, Check, ChipSelect, Empty, H1, H3, Muted, P, QueryView, Row, Screen, theme } from '@/ui';

const DURATIONS = [{ value: '15', label: '15 min or less' }, { value: '30', label: '30 min or less' }, { value: 'long', label: 'Longer' }];
const unique = (values: string[]) => [...new Set(values.filter(Boolean))];
const options = (values: string[], labels: Record<string, string>) => unique(values).map((value) => ({ value, label: labels[value] ?? value }));

function matches(l: Listing, f: MarketFilters) {
  const r = l.round;
  if (f.category && l.product.category !== f.category) return false;
  if (f.device && !r.supported_devices.includes(f.device)) return false;
  if (f.country && r.countries.length > 0 && !r.countries.includes(f.country)) return false;
  if (f.duration === '15' && r.expected_minutes_max > 15) return false;
  if (f.duration === '30' && r.expected_minutes_max > 30) return false;
  if (f.duration === 'long' && r.expected_minutes_max <= 30) return false;
  if (f.stage && l.product.stage !== f.stage) return false;
  if (f.beginner && !r.beginner_friendly) return false;
  if (f.reward && r.reward_type !== f.reward) return false;
  return true;
}

/** Why this round suits the signed-in tester, or null when it does not (or we cannot tell). */
function matchReason(l: Listing, profile: Profile | undefined): string | null {
  if (!profile) return null;
  const r = l.round;
  const device = profile.devices.find((d) => r.supported_devices.includes(d));
  if (!device) return null;
  if (r.countries.length > 0 && (!profile.country || !r.countries.includes(profile.country))) return null;
  const where = r.countries.length > 0 && profile.country ? ` and it is open in ${COUNTRIES[profile.country] ?? profile.country}` : '';
  return `Works on your ${DEVICES[device] ?? device}${where}`;
}

function ListingCard({ listing, profile }: { listing: Listing; profile: Profile | undefined }) {
  const { round, product, release, stats } = listing;
  const reason = matchReason(listing, profile);
  return (
    <Card testID={`listing-${round.id}`} onPress={() => go(`/rounds/${round.id}`)}>
      <H3>{product.name}</H3>
      <Muted style={{ fontSize: theme.font.small }}>{CATEGORIES[product.category] ?? product.category} · {product.stage_label || STAGES[product.stage] || product.stage}</Muted>
      <P numberOfLines={2}>{product.description}</P>
      <Muted style={{ fontSize: theme.font.small }}>
        Version {release.version} · {minutesRange(round.expected_minutes_min, round.expected_minutes_max)}
        {round.supported_devices.length > 0 ? ` · ${round.supported_devices.map((d) => DEVICES[d] ?? d).join(', ')}` : ''}
      </Muted>
      <View style={{ gap: 2, marginTop: 4 }}>
        <P style={{ color: theme.color.ink, fontWeight: '600' }}>{stats.remaining_places} of {stats.cohort_size} places left</P>
        {stats.pending_applications > 0 && (
          <Muted style={{ fontSize: theme.font.small }}>
            {stats.pending_applications} {stats.pending_applications === 1 ? 'application' : 'applications'} awaiting review
          </Muted>
        )}
      </View>
      <Row wrap style={{ marginTop: 4 }}>
        {reason && <Badge tone="good" label="Good match for you" />}
        {round.beginner_friendly && <Badge tone="info" label="Beginner-friendly" />}
        <Badge label={REWARDS[round.reward_type] ?? round.reward_type} />
        {product.is_demo && <Badge tone="warn" label="Demo listing" />}
      </Row>
      {reason && <Muted style={{ fontSize: theme.font.small }}>{reason}</Muted>}
    </Card>
  );
}

export default function Marketplace() {
  const { userId } = useAuth();
  const { filters, set, reset } = useMarketFilters();
  const [showFilters, setShowFilters] = useState(false);
  const listings = useQuery({ queryKey: keys.marketplace, queryFn: () => api.marketplace() });
  const profile = useQuery({ queryKey: keys.profile, queryFn: () => api.profile(), enabled: !!userId });
  const activeCount = (Object.keys(emptyFilters) as (keyof MarketFilters)[]).filter((k) => filters[k] !== emptyFilters[k]).length;
  const all = listings.data;
  const opts = useMemo(() => ({
    category: options((all ?? []).map((l) => l.product.category), CATEGORIES),
    device: options((all ?? []).flatMap((l) => l.round.supported_devices), DEVICES),
    country: options((all ?? []).flatMap((l) => l.round.countries), COUNTRIES),
    stage: options((all ?? []).map((l) => l.product.stage), STAGES),
    reward: options((all ?? []).map((l) => l.round.reward_type), REWARDS),
  }), [all]);

  return (
    <Screen title="Discover">
      <H1>Products looking for testers</H1>
      <Muted>Try something new and tell its makers honestly how it went. No experience needed — they are testing the product, not you.</Muted>
      <Row style={{ justifyContent: 'space-between', marginTop: theme.space.sm }}>
        <Button small variant="secondary" testID="toggle-filters" onPress={() => setShowFilters(!showFilters)}
          title={showFilters ? 'Hide filters' : activeCount > 0 ? `Filters (${activeCount})` : 'Filters'} />
        {activeCount > 0 && <Button small variant="ghost" testID="clear-filters" title="Clear filters" onPress={reset} />}
      </Row>
      {showFilters && (
        <Card>
          {opts.category.length > 0 && <ChipSelect label="Category" options={opts.category} value={filters.category} onChange={(category) => set({ category })} />}
          {opts.device.length > 0 && <ChipSelect label="Device" options={opts.device} value={filters.device} onChange={(device) => set({ device })} />}
          {opts.country.length > 0 && <ChipSelect label="Open to testers in" options={opts.country} value={filters.country} onChange={(country) => set({ country })} />}
          <ChipSelect label="Time needed" options={DURATIONS} value={filters.duration} onChange={(duration) => set({ duration })} />
          {opts.stage.length > 0 && <ChipSelect label="Product stage" options={opts.stage} value={filters.stage} onChange={(stage) => set({ stage })} />}
          {opts.reward.length > 0 && <ChipSelect label="Reward" options={opts.reward} value={filters.reward} onChange={(reward) => set({ reward })} />}
          <Check label="Beginner-friendly only" checked={filters.beginner} onChange={(beginner) => set({ beginner })} testID="filter-beginner" />
        </Card>
      )}
      <QueryView query={listings}>
        {(data) => {
          const shown = data.filter((l) => matches(l, filters));
          if (data.length === 0) return <Empty title="Nothing to test right now" body="New testing rounds appear here as soon as product teams publish them." />;
          if (shown.length === 0) {
            return <Empty title="No tests match these filters" body="Try removing a filter or two."
              action={<Button variant="secondary" title="Clear filters" onPress={reset} />} />;
          }
          return <View style={{ gap: theme.space.md }}>{shown.map((l) => <ListingCard key={l.round.id} listing={l} profile={profile.data} />)}</View>;
        }}
      </QueryView>
    </Screen>
  );
}
