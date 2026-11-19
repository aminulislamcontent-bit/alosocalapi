import snapshot from '../../../reports/open-source-ai-catalog.json';

export const catalog = snapshot;
export type CatalogEntry = (typeof snapshot.entries)[number];
export function validateSelection(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > catalog.entries.length)
    throw Error('Expected an array of catalog IDs.');
  const known = new Set(catalog.entries.map((e) => e.id));
  if (
    new Set(value).size !== value.length ||
    value.some((id) => typeof id !== 'string' || !known.has(id))
  )
    throw Error('Unknown or duplicate catalog ID.');
  return value;
}
export const LOCAL_MODEL = 'model:qwen/qwen3-8b';
export function localModel(id: unknown) {
  const e = catalog.entries.find((e) => e.id === id);
  if (
    !e ||
    id !== LOCAL_MODEL ||
    e.archived ||
    e.ollamaTag !== 'qwen3:8b' ||
    e.weightsTerms !== 'Apache-2.0' ||
    e.weightTermsStatus !== 'upstream-readme-evidence'
  )
    throw Error('No supported local adapter for this entry.');
  return e.ollamaTag;
}
