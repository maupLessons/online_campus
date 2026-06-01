import { spawnSync } from 'node:child_process';

const packagePairs = [
  {
    name: 'root tooling',
    manifest: 'package.json',
    lockfile: 'package-lock.json',
  },
  {
    name: 'client',
    manifest: 'client/package.json',
    lockfile: 'client/package-lock.json',
  },
  {
    name: 'server',
    manifest: 'server/package.json',
    lockfile: 'server/package-lock.json',
  },
];

const LOCKFILE_RELEVANT_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
  'bundleDependencies',
  'bundledDependencies',
  'overrides',
  'workspaces',
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
    shell: false,
    ...options,
  });

  if (result.error) {
    console.error(`Failed to run ${command}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    if (options.capture && result.stderr) {
      console.error(result.stderr.trim());
    }
    process.exit(result.status ?? 1);
  }

  return result.stdout ?? '';
}

function readJsonFromGit(ref) {
  const content = run('git', ['show', ref], { capture: true });
  return JSON.parse(content);
}

function hasLockfileRelevantManifestChange(manifest) {
  const stagedManifest = readJsonFromGit(`:${manifest}`);
  const headManifest = readJsonFromGit(`HEAD:${manifest}`);

  return LOCKFILE_RELEVANT_FIELDS.some(
    (field) =>
      JSON.stringify(stagedManifest[field] ?? null) !==
      JSON.stringify(headManifest[field] ?? null),
  );
}

function runNpm(args) {
  if (process.env.npm_execpath) {
    run(process.execPath, [process.env.npm_execpath, ...args]);
    return;
  }

  run('npm', args, { shell: true });
}

function isCodeFile(filePath) {
  return /\.(cjs|js|jsx|mjs|ts|tsx)$/.test(filePath);
}

const stagedFiles = run(
  'git',
  ['diff', '--cached', '--name-only', '--diff-filter=ACMR'],
  { capture: true },
)
  .split(/\r?\n/)
  .map((filePath) => filePath.trim().replaceAll('\\', '/'))
  .filter(Boolean);

if (stagedFiles.length === 0) {
  process.exit(0);
}

const stagedFileSet = new Set(stagedFiles);
const missingLockfiles = packagePairs.filter(
  ({ manifest, lockfile }) =>
    stagedFileSet.has(manifest) &&
    hasLockfileRelevantManifestChange(manifest) &&
    !stagedFileSet.has(lockfile),
);

if (missingLockfiles.length > 0) {
  console.error('Package manifests must be committed with their lockfiles:');
  for (const { name, manifest, lockfile } of missingLockfiles) {
    console.error(`- ${name}: stage ${lockfile} together with ${manifest}`);
  }
  process.exit(1);
}

const hasClientCodeChanges = stagedFiles.some(
  (filePath) =>
    filePath.startsWith('client/') &&
    (filePath.startsWith('client/src/') ||
      filePath.startsWith('client/eslint.config.') ||
      filePath.startsWith('client/vite.config.')) &&
    isCodeFile(filePath),
);

const hasServerCodeChanges = stagedFiles.some(
  (filePath) =>
    filePath.startsWith('server/') &&
    (filePath.startsWith('server/src/') ||
      filePath.startsWith('server/test/') ||
      filePath.startsWith('server/eslint.config.')) &&
    isCodeFile(filePath),
);

if (hasClientCodeChanges) {
  runNpm(['--prefix', 'client', 'run', 'lint']);
}

if (hasServerCodeChanges) {
  runNpm(['--prefix', 'server', 'run', 'lint:check']);
}
