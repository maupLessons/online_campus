import { readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAX_JAVASCRIPT_CHUNK_BYTES = 500_000;

export function checkChunkBudget(chunks, limit = MAX_JAVASCRIPT_CHUNK_BYTES) {
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new RangeError('Chunk budget must be a positive integer');
  }
  if (chunks.length === 0) {
    throw new Error('No JavaScript chunks found in the production build');
  }
  for (const chunk of chunks) {
    if (!Number.isSafeInteger(chunk.bytes) || chunk.bytes < 0) {
      throw new TypeError(`Invalid chunk size: ${chunk.file}`);
    }
  }

  const oversized = chunks.filter((chunk) => chunk.bytes > limit);
  if (oversized.length > 0) {
    const details = oversized
      .map((chunk) => `${chunk.file}: ${chunk.bytes} bytes`)
      .join('\n');
    throw new Error(`JavaScript chunk budget exceeded (${limit} bytes):\n${details}`);
  }
  return chunks.reduce((largest, chunk) =>
    chunk.bytes > largest.bytes ? chunk : largest,
  );
}

export function checkBuildDirectory(directory) {
  const chunks = [];
  function visit(current, prefix = '') {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = join(current, entry.name);
      const relative = `${prefix}${entry.name}`;
      if (entry.isSymbolicLink()) {
        throw new Error(`Unexpected symlink in build output: ${relative}`);
      }
      if (entry.isDirectory()) {
        visit(absolute, `${relative}/`);
      } else if (entry.isFile() && /\.(?:js|mjs|cjs)$/.test(entry.name)) {
        chunks.push({ file: relative, bytes: statSync(absolute).size });
      }
    }
  }
  visit(directory);
  return { count: chunks.length, largest: checkChunkBudget(chunks) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const output = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
    const { count, largest } = checkBuildDirectory(output);
    console.log(
      `Build budget passed: ${count} JavaScript chunks; largest ${largest.file} ` +
        `(${largest.bytes} / ${MAX_JAVASCRIPT_CHUNK_BYTES} bytes)`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
