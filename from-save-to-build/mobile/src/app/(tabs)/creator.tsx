import { useQuery } from '@tanstack/react-query';
import { Pressable, View } from 'react-native';
import { SignInPrompt } from '@/components/creator/parts';
import { countsLine, go, newestFirst, ROUND_STATUS } from '@/components/creator/util';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { CATEGORIES, STAGES } from '@/lib/labels';
import { keys } from '@/lib/query';
import type { ProductBundle } from '@/lib/types';
import { Badge, Button, Card, Divider, Empty, H1, H2, H3, Loading, Muted, QueryView, Row, Screen, Spacer, theme } from '@/ui';

export default function CreatorHome() {
  const { userId, ready } = useAuth();
  if (!ready) return <Screen><Loading /></Screen>;
  if (!userId) return <Screen><SignInPrompt body="Add your product, set up a testing round and hear from real testers." /></Screen>;
  return <Home />;
}

function Home() {
  const home = useQuery({ queryKey: keys.creatorHome, queryFn: () => api.creatorHome() });
  return (
    <Screen>
      <H1>Your products</H1>
      <Muted>Set up a product, point a testing round at an exact release, and decide what testers do.</Muted>
      <QueryView query={home}>
        {(products) => products.length === 0
          ? <Empty title="Add your first product" body="A product holds your releases and testing rounds. It takes a couple of minutes."
              action={<Button title="New product" onPress={() => go('/creator/products/new')} testID="new-product" />} />
          : <>
              {products.map((p) => <ProductCard key={p.id} product={p} />)}
              <Spacer size={theme.space.sm} />
              <Button title="New product" variant="secondary" onPress={() => go('/creator/products/new')} testID="new-product" />
            </>}
      </QueryView>
      <Button title="Task template library" variant="ghost" onPress={() => go('/creator/templates')} testID="open-templates" />
    </Screen>
  );
}

function ProductCard({ product: p }: { product: ProductBundle }) {
  const latest = newestFirst(p.releases)[0];
  const rounds = [...p.rounds].sort((a, b) => b.round_number - a.round_number);
  return (
    <Card testID={`product-${p.id}`}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <H2 style={{ flex: 1 }}>{p.name}</H2>
        {p.is_demo && <Badge label="Demo" tone="info" />}
      </Row>
      <Muted style={{ fontSize: theme.font.small }}>
        {CATEGORIES[p.category] ?? p.category} · {p.stage_label || STAGES[p.stage] || p.stage}{latest ? ` · Latest release ${latest.version}` : ' · No release yet'}
      </Muted>
      {rounds.length === 0
        ? <Muted style={{ fontSize: theme.font.small }}>No testing rounds yet.</Muted>
        : rounds.map((r) => (
            <View key={r.id}>
              <Divider />
              <Pressable accessibilityRole="button" onPress={() => go(`/creator/rounds/${r.id}`)} testID={`round-${r.id}`}
                style={({ pressed }) => [{ gap: 4, paddingVertical: 4 }, pressed && { opacity: 0.7 }]}>
                <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <H3 style={{ flex: 1 }}>{r.title}</H3>
                  <Badge label={ROUND_STATUS[r.status].label} tone={ROUND_STATUS[r.status].tone} />
                </Row>
                <Muted style={{ fontSize: theme.font.small }}>Round {r.round_number} · {r.version}</Muted>
                <Muted style={{ fontSize: theme.font.small }}>{countsLine(r)}</Muted>
              </Pressable>
            </View>
          ))}
      <Spacer size={4} />
      <Button small variant="secondary" title="Manage product" onPress={() => go(`/creator/products/${p.id}`)} testID={`manage-product-${p.id}`} />
    </Card>
  );
}
