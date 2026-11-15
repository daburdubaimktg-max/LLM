import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { SignInPrompt } from '@/components/creator/parts';
import { emptyRoundForm, readRoundForm, RoundFields, type RoundFormState } from '@/components/creator/RoundFields';
import { go, goReplace, invalidate, newestFirst, param } from '@/components/creator/util';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { keys } from '@/lib/query';
import type { ProductBundle } from '@/lib/types';
import { Button, Empty, ErrorNote, H1, Muted, QueryView, Screen, Spacer, useAction } from '@/ui';

export default function NewRound() {
  const { userId } = useAuth();
  const productId = param(useLocalSearchParams<{ productId?: string }>().productId) ?? '';
  const product = useQuery({ queryKey: keys.product(productId), queryFn: () => api.productDetail(productId), enabled: !!userId && !!productId });
  if (!userId) return <Screen title="New testing round"><SignInPrompt body="Sign in to set up a testing round." /></Screen>;
  if (!productId) {
    return <Screen title="New testing round"><Empty title="Choose a product first" body="A testing round belongs to one of your products."
      action={<Button title="Go to your products" onPress={() => go('/creator')} />} /></Screen>;
  }
  return (
    <Screen title="New testing round">
      <QueryView query={product}>
        {(p) => p.releases.length === 0
          ? <Empty title="Add a release first" body="Every round tests one exact release of your product."
              action={<Button title="Manage product" onPress={() => go(`/creator/products/${p.id}`)} />} />
          : <RoundForm product={p} />}
      </QueryView>
    </Screen>
  );
}

function RoundForm({ product: p }: { product: ProductBundle }) {
  const [form, setForm] = useState<RoundFormState>(() => emptyRoundForm(newestFirst(p.releases)[0]?.id ?? ''));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useAction(async () => {
    const { errors: found, values } = readRoundForm(form);
    setErrors(found);
    if (!values) throw new Error('Please check the highlighted fields.');
    const roundNumber = p.rounds.reduce((max, r) => Math.max(max, r.round_number), 0) + 1;
    const round = await api.createRound({ product_id: p.id, round_number: roundNumber, ...values });
    await invalidate(keys.product(p.id), keys.creatorHome);
    goReplace(`/creator/rounds/${round.id}/settings`);
  });
  return (
    <>
      <H1>New testing round</H1>
      <Muted>For {p.name}. This is saved as a draft — next you add objectives, the application form and the testing tasks, then publish.</Muted>
      <Spacer size={4} />
      <RoundFields value={form} onChange={setForm} errors={errors} releases={p.releases} />
      <ErrorNote error={create.error} />
      <Button title="Create draft round" onPress={() => create.run()} loading={create.loading} testID="create-round" />
    </>
  );
}
