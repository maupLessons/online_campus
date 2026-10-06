import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  checkBuildDirectory,
  checkChunkBudget,
  MAX_JAVASCRIPT_CHUNK_BYTES,
} from './check-build-budget.mjs';

test('accepts chunks at or below the unchanged Vite warning threshold', () => {
  const largest = { file: 'vendor-react.js', bytes: MAX_JAVASCRIPT_CHUNK_BYTES };
  assert.deepEqual(
    checkChunkBudget([{ file: 'page.js', bytes: 1 }, largest]),
    largest,
  );
});

test('fails on oversized chunks and reports every offending asset', () => {
  assert.throws(
    () =>
      checkChunkBudget([
        { file: 'first.js', bytes: MAX_JAVASCRIPT_CHUNK_BYTES + 1 },
        { file: 'second.js', bytes: MAX_JAVASCRIPT_CHUNK_BYTES + 2 },
      ]),
    (error) =>
      error instanceof Error &&
      error.message.includes('first.js') &&
      error.message.includes('second.js'),
  );
});

test('rejects empty builds, invalid budgets, and invalid size metadata', () => {
  assert.throws(() => checkChunkBudget([]), /No JavaScript chunks/);
  assert.throws(() => checkChunkBudget([{ file: 'a.js', bytes: 1 }], 0), RangeError);
  assert.throws(() => checkChunkBudget([{ file: 'a.js', bytes: -1 }]), TypeError);
});

test('checks nested output assets and excludes source maps and CSS', () => {
  const directory = mkdtempSync(join(tmpdir(), 'campus-build-budget-'));
  try {
    mkdirSync(join(directory, 'assets'));
    writeFileSync(join(directory, 'assets', 'entry.js'), 'export {};');
    writeFileSync(join(directory, 'styles.css'), 'x'.repeat(500_001));
    writeFileSync(join(directory, 'entry.js.map'), 'x'.repeat(500_001));
    const result = checkBuildDirectory(directory);
    assert.equal(result.count, 1);
    assert.equal(result.largest.file, 'assets/entry.js');

    writeFileSync(join(directory, 'assets', 'large.js'), 'x'.repeat(500_001));
    assert.throws(() => checkBuildDirectory(directory), /large\.js/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
