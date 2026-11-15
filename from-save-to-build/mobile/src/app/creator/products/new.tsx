import { useState } from 'react';
import { SignInPrompt } from '@/components/creator/parts';
import { goReplace, invalidate, optionsOf, orNull } from '@/components/creator/util';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { CATEGORIES, STAGES } from '@/lib/labels';
import { keys } from '@/lib/query';
import { fieldErrors, productSchema, releaseSchema } from '@/lib/schemas';
import { Button, Choice, ErrorNote, Field, H1, H2, Muted, Notice, Screen, Spacer, theme, useAction } from '@/ui';

export default function NewProduct() {
  const { userId } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [stage, setStage] = useState('');
  const [stageLabel, setStageLabel] = useState('');
  const [audience, setAudience] = useState('');
  const [demoUrl, setDemoUrl] = useState('');
  const [version, setVersion] = useState('');
  const [accessUrl, setAccessUrl] = useState('');
  const [accessInstructions, setAccessInstructions] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  // If the product saved but the release did not, retrying must not create a second product.
  const [createdId, setCreatedId] = useState<string | null>(null);

  const submit = useAction(async () => {
    const product = productSchema.safeParse({ name, description, category, stage, stage_label: stageLabel.trim(), target_audience: audience.trim(), demo_url: demoUrl.trim() });
    const release = releaseSchema.safeParse({ version, access_url: accessUrl.trim(), access_instructions: accessInstructions.trim() });
    const found = { ...fieldErrors(release), ...fieldErrors(product) };
    setErrors(found);
    if (!product.success || !release.success) throw new Error('Please check the highlighted fields.');
    let id = createdId;
    if (!id) {
      const p = product.data;
      const created = await api.createProduct({ name: p.name, description: p.description, category: p.category, stage: p.stage,
        stage_label: orNull(stageLabel), target_audience: orNull(audience), demo_url: orNull(demoUrl) });
      id = created.id;
      setCreatedId(id);
    }
    await api.createRelease(id, { version: release.data.version, access_url: orNull(accessUrl) ?? undefined, access_instructions: orNull(accessInstructions) ?? undefined });
    await invalidate(keys.creatorHome, keys.product(id));
    goReplace(`/creator/products/${id}`);
  });

  if (!userId) return <Screen title="New product"><SignInPrompt body="Sign in to add a product." /></Screen>;
  return (
    <Screen title="New product">
      <H1>Tell us about your product</H1>
      <Muted>You can change all of this later.</Muted>
      <Spacer size={4} />
      <Field label="Product name" value={name} onChangeText={setName} error={errors.name} testID="product-name" />
      <Field label="Description" hint="What it does and who it is for, in a few sentences." value={description} onChangeText={setDescription} error={errors.description}
        multiline testID="product-description" />
      <Choice label="Category" options={optionsOf(CATEGORIES)} value={category} onChange={setCategory} error={errors.category} testID="product-category" />
      <Choice label="Stage" options={optionsOf(STAGES)} value={stage} onChange={setStage} error={errors.stage} testID="product-stage" />
      <Field label="Stage label" hint="Optional. Your own wording, for example “Beta prototype”." value={stageLabel} onChangeText={setStageLabel} error={errors.stage_label}
        testID="product-stage-label" />
      <Field label="Target audience" hint="Optional." value={audience} onChangeText={setAudience} error={errors.target_audience} multiline testID="product-audience" />
      <Field label="Demo link" hint="Optional. A full link, starting with https://" value={demoUrl} onChangeText={setDemoUrl} error={errors.demo_url}
        keyboardType="url" autoCapitalize="none" testID="product-demo-url" />

      <Spacer size={theme.space.sm} />
      <H2>First release</H2>
      <Muted>Every testing round points at one exact release, so testers and results always refer to a known version.</Muted>
      <Field label="Version" placeholder="v0.1.0" value={version} onChangeText={setVersion} error={errors.version} autoCapitalize="none" testID="release-version" />
      <Field label="Access link" hint="Optional. Where testers open this release." value={accessUrl} onChangeText={setAccessUrl} error={errors.access_url}
        keyboardType="url" autoCapitalize="none" testID="release-access-url" />
      <Field label="Access instructions" hint="Optional. Anything testers need to get in." value={accessInstructions} onChangeText={setAccessInstructions}
        error={errors.access_instructions} multiline testID="release-access-instructions" />

      {createdId && !!submit.error && <Notice tone="warn">The product was saved, but its first release was not. Fix the release fields and try again.</Notice>}
      <ErrorNote error={submit.error} />
      <Button title="Create product" onPress={() => submit.run()} loading={submit.loading} testID="create-product" />
    </Screen>
  );
}
