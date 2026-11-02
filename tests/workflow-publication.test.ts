import { describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const workflows = [
  { name: 'prices.yml', job: 'harvest', file: 'src/config/pricing.snapshot.json' },
  { name: 'prices-scrape.yml', job: 'harvest', file: 'src/config/pricing.snapshot.json' },
  { name: 'price-history.yml', job: 'build', file: 'src/config/price-history.json' },
] as const;
const readWorkflow = (name: string) => readFileSync(join('.github/workflows', name), 'utf8');

function commitScript(workflow: string): string {
  const block = /id: commit\n\s+run: \|\n((?: {10}[^\n]*\n)+)/.exec(workflow)?.[1];
  if (!block) throw new Error('commit step missing');
  return block.split('\n').map((line) => line.slice(10)).join('\n');
}

function runStep(name: string, file: string, mode: 'unchanged' | 'changed' | 'rejected' | 'gate') {
  const root = mkdtempSync(join(tmpdir(), 'dh-workflow-'));
  try {
    const repo = join(root, 'repo');
    const remote = join(root, 'remote.git');
    const bin = join(root, 'bin');
    mkdirSync(repo, { recursive: true }); mkdirSync(bin, { recursive: true });
    const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
    execFileSync('git', ['init', '--bare', remote], { stdio: 'ignore' });
    git('init', '-b', 'main');
    git('config', 'user.name', 'Tests'); git('config', 'user.email', 'test@example.invalid');
    git('remote', 'add', 'origin', remote);
    mkdirSync(join(repo, 'src/config'), { recursive: true });
    writeFileSync(join(repo, 'src/config/pricing.snapshot.json'), '{}\n');
    writeFileSync(join(repo, 'src/config/price-history.json'), '{}\n');
    git('add', '.'); git('commit', '-m', 'initial'); git('push', '-u', 'origin', 'main');
    if (mode !== 'unchanged') writeFileSync(join(repo, file), '{"changed":true}\n');
    if (mode === 'rejected') git('remote', 'set-url', 'origin', join(root, 'no-remote'));
    // The API gate's decision is tested separately in snapshot-gate.test.ts.
    writeFileSync(join(bin, 'node'), `#!/bin/sh\nexit ${mode === 'gate' ? 1 : 0}\n`, { mode: 0o755 });
    const output = join(root, 'output');
    writeFileSync(output, '');
    const result = spawnSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', commitScript(readWorkflow(name))], {
      cwd: repo, env: { ...process.env, GITHUB_OUTPUT: output, PATH: `${bin}:${process.env.PATH}` }, encoding: 'utf8',
    });
    return { status: result.status, output: readFileSync(output, 'utf8') };
  } finally {
    rmSync(root, { recursive: true });
  }
}

describe('price data publication workflows', () => {
  it('deploys regular price-only pushes and accepts calls with the requested ref', () => {
    const deploy = readWorkflow('deploy.yml');
    expect(deploy).toContain('  workflow_call:');
    expect(deploy).toContain('ref: ${{ inputs.checkout_ref || github.sha }}');
    expect(deploy).not.toContain("- 'src/config/pricing.snapshot.json'");
    expect(deploy).not.toContain("- 'src/config/price-history.json'");
    expect(deploy).toContain('group: pages');
  });

  it.each(workflows)('$name publishes only a successfully pushed main-branch change', ({ name, job, file }) => {
    const workflow = readWorkflow(name);
    expect(workflow).toContain('updated: ${{ steps.commit.outputs.updated }}');
    expect(workflow).toContain(`if: needs.${job}.outputs.updated == 'true' && github.ref == 'refs/heads/main'`);
    expect(workflow).toContain('uses: ./.github/workflows/deploy.yml');
    expect(workflow).toContain('checkout_ref: main');
    expect(workflow).toContain('pages: write');
    expect(workflow).toContain('id-token: write');
    expect(runStep(name, file, 'unchanged')).toEqual({ status: 0, output: '' });
    expect(runStep(name, file, 'changed')).toEqual({ status: 0, output: 'updated=true\n' });
    const failed = runStep(name, file, 'rejected');
    expect(failed.status).not.toBe(0);
    expect(failed.output).toBe('');
  });

  it('does not publish when the API snapshot delta gate skips a commit', () => {
    expect(runStep('prices.yml', 'src/config/pricing.snapshot.json', 'gate')).toEqual({ status: 0, output: '' });
  });
});
