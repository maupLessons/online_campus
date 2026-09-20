/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import i18n from './i18n';

function keysOf(lng: string): string[] {
  const bundle = i18n.getResourceBundle(lng, 'translation') as Record<string, unknown>;
  return Object.keys(bundle).sort();
}

// Object.keys() on the already-parsed bundle can never see a duplicate key —
// the parser collapses repeated keys in an object literal before the module
// even loads. To catch an accidental duplicate `'some.key': ...` line, we
// scan the raw source of the two locale blocks instead.
function findDuplicateKeys(sourceSection: string): string[] {
  const keyPattern = /^\s*'([^']+)'\s*:/gm;
  const counts = new Map<string, number>();
  let match: RegExpExecArray | null;
  while ((match = keyPattern.exec(sourceSection))) {
    const key = match[1];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key);
}

describe('i18n resources', () => {
  it('uk and en have identical key sets', () => {
    const uk = keysOf('uk');
    const en = keysOf('en');
    const onlyUk = uk.filter((k) => !en.includes(k));
    const onlyEn = en.filter((k) => !uk.includes(k));
    expect({ onlyUk, onlyEn }).toEqual({ onlyUk: [], onlyEn: [] });
  });

  it('uk and en have no duplicate keys in the source', () => {
    const filePath = fileURLToPath(new URL('./i18n.ts', import.meta.url));
    const source = readFileSync(filePath, 'utf8');

    const ukStart = source.indexOf('  uk: {');
    const enStart = source.indexOf('  en: {');
    const enEnd = source.indexOf('\n};');
    expect(ukStart).toBeGreaterThan(-1);
    expect(enStart).toBeGreaterThan(ukStart);
    expect(enEnd).toBeGreaterThan(enStart);

    const ukSection = source.slice(ukStart, enStart);
    const enSection = source.slice(enStart, enEnd);

    const ukDuplicates = findDuplicateKeys(ukSection);
    const enDuplicates = findDuplicateKeys(enSection);
    expect({ ukDuplicates, enDuplicates }).toEqual({ ukDuplicates: [], enDuplicates: [] });
  });
});
