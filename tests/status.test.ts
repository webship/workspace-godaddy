/**
 * The status of a linked project for someone without the GoDaddy API key, or without an answer:
 * `cmd-tools-godaddy.sh <project>`, the menu's "Link, domain and DNS" (and `--dns`, which ends in it).
 * It shows the link, says once what is missing and how to fix it, calls nothing without a key, prints
 * no Python traceback and no "command not found", and fails.
 *
 * The hooks run here as the command runs them, in a temp workspace whose PATH holds only the basic
 * tools and the stand-ins a test gives (a curl that reaches nothing). Nothing leaves it.
 */
import test, { after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

// Compiled, these tests run from dist/tests, so the package root is one folder further up.
const PKG = fs.existsSync(path.join(__dirname, '..', 'package.json')) ? path.join(__dirname, '..') : path.join(__dirname, '..', '..');
const HOOKS = ['scripts/functions/fun-godaddy.sh', 'scripts/functions/fun-godaddy-tool.sh'].map((f) => path.join(PKG, f));
const NO_KEY = 'No GoDaddy API key: set api_key and api_secret in core/config/plugin.godaddy.settings.yml';
const KEY = { GODADDY_API_KEY: 'test-key', GODADDY_API_SECRET: 'test-secret' };

/** This machine's own copy of a tool, from its PATH. */
function which(tool: string): string | null {
  for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
    const f = path.join(dir, tool);
    try { if (fs.statSync(f).isFile()) { fs.accessSync(f, fs.constants.X_OK); return f; } } catch (_) { /* not here */ }
  }
  return null;
}
const BASIC = ['bash', 'python3', 'grep', 'sed', 'head', 'tail', 'awk', 'tr', 'cat', 'dirname', 'mkdir', 'touch', 'date', 'mktemp', 'find'];
const skip = ['bash', 'python3', 'grep', 'sed', 'head'].every((t) => which(t)) ? false : 'bash, python3, grep, sed or head is not here';

/** A curl that reaches nothing and writes down what it was asked (@ROOT@ is the workspace). */
const OFFLINE_CURL = 'printf "%s\\n" "$@" >> "@ROOT@/curl.calls"; echo "curl: (6) Could not resolve host" >&2; exit 6';
const ANSWERING_CURL = `printf "%s\\n" "$@" >> "@ROOT@/curl.calls"; case "$*" in
  */v1/domains/example.invalid/records*) echo '[{"type":"A","name":"@","data":"192.0.2.1","ttl":600},{"type":"CNAME","name":"www","data":"@","ttl":3600}]' ;;
  */v1/domains/example.invalid*) echo '{"domain":"example.invalid","status":"ACTIVE","expires":"2027-01-01T00:00:00.000Z","nameServers":["ns1.example.invalid"]}' ;;
  *) exit 6 ;;
esac`;

const temps: string[] = [];
after(() => { for (const d of temps) fs.rmSync(d, { recursive: true, force: true }); });

/** A workspace: core/config with the settings template, dev/site1 (linked unless told otherwise), bin/ with the basic tools and the stand-ins. */
function workspace(standIns: Record<string, string> = { curl: OFFLINE_CURL }, linked = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'godaddy-status-'));
  temps.push(root);
  const bin = path.join(root, 'bin');
  fs.mkdirSync(path.join(root, 'core', 'config'), { recursive: true });
  fs.mkdirSync(path.join(root, 'dev', 'site1'), { recursive: true });
  fs.mkdirSync(path.join(root, 'home'));
  fs.mkdirSync(bin);
  fs.copyFileSync(path.join(PKG, 'config', 'plugin.godaddy.settings.yml'), path.join(root, 'core', 'config', 'plugin.godaddy.settings.yml'));
  if (linked) {
    fs.mkdirSync(path.join(root, 'dev', 'site1', '.godaddy'));
    fs.writeFileSync(path.join(root, 'dev', 'site1', '.godaddy', 'workspace.yml'), 'id: example.invalid\nenv: example.invalid\nssh: site1user@example.invalid\nremote: /home/site1user/public_html\n');
  }
  for (const t of BASIC) { const real = which(t); if (real) fs.symlinkSync(real, path.join(bin, t)); }
  for (const [name, body] of Object.entries(standIns)) fs.writeFileSync(path.join(bin, name), `#!/usr/bin/env bash\n${body.split('@ROOT@').join(root)}\n`, { mode: 0o755 });
  return root;
}

/** What `bash cmd-tools-godaddy.sh site1 [flags]` does once the workspace has loaded: the dispatcher, with the flags argparse would set. */
function run(root: string, flags: Record<string, string> = {}) {
  const r = spawnSync(which('bash') as string, ['-c', `source "${HOOKS[0]}" && source "${HOOKS[1]}" && godaddy_project_tool`], {
    cwd: path.join(root, 'dev'), input: '', encoding: 'utf8',
    env: { PATH: path.join(root, 'bin'), HOME: path.join(root, 'home'), WORKSPACE_ROOT: root, WORKSPACE_CONFIG: path.join(root, 'core', 'config'), doc_name: 'dev', PROJECT_NAME: 'site1', ...flags },
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

const times = (s: string, needle: string) => s.split(needle).length - 1;
const curlCalls = (root: string) => (fs.existsSync(path.join(root, 'curl.calls')) ? fs.readFileSync(path.join(root, 'curl.calls'), 'utf8') : '');

function clean(out: string) {
  assert.doesNotMatch(out, /Traceback|JSONDecodeError/, `no Python traceback:\n${out}`);
  assert.doesNotMatch(out, /command not found|No such file or directory/, `no shell error:\n${out}`);
}

/** The part of the status known on this machine: the link, the hosting and the console. */
function local(out: string) {
  assert.match(out, /linked:\s+example\.invalid/, 'the link still shows');
  assert.match(out, /hosting: site1user@example\.invalid:\/home\/site1user\/public_html/, 'the hosting still shows');
  assert.ok(out.includes('Console: https://dcc.godaddy.com/control/portfolio/example.invalid/settings'), 'the console still shows');
}

test('without an API key, the status of a linked project shows the link, says once where the key goes, calls nothing, and fails', { skip }, () => {
  const root = workspace();
  const { status, out } = run(root);
  clean(out);
  local(out);
  assert.strictEqual(times(out, NO_KEY), 1, out);
  assert.notStrictEqual(status, 0, 'the provider could not be reached');
  assert.strictEqual(curlCalls(root), '', 'no API call without a key');
});

test('--dns without an API key says the same once, calls nothing, and fails', { skip }, () => {
  const root = workspace();
  const { status, out } = run(root, { DNS: 'yes' });
  clean(out);
  assert.strictEqual(times(out, NO_KEY), 1, out);
  assert.notStrictEqual(status, 0);
  assert.strictEqual(curlCalls(root), '');
});

test('without curl, the status says so once, and fails', { skip }, () => {
  const { status, out } = run(workspace({}), KEY);
  clean(out);
  local(out);
  assert.strictEqual(times(out, 'curl is not installed, and the GoDaddy tool needs it.'), 1, out);
  assert.notStrictEqual(status, 0);
});

test('with a key but no answer from the API, the status says so without a traceback, and fails', { skip }, () => {
  const root = workspace();
  const { status, out } = run(root, { ...KEY, DNS: 'yes' });
  clean(out);
  local(out);
  assert.match(out, /\(no answer from the GoDaddy API for example\.invalid\)/);
  assert.match(curlCalls(root), /^Authorization: sso-key test-key:test-secret$/m);
  assert.strictEqual(times(curlCalls(root), 'https://api.godaddy.com/'), 1, 'the DNS records are not asked for after the domain went unanswered');
  assert.notStrictEqual(status, 0);
});

test('--link with a key but no answer says the domain could not be read, without a traceback', { skip }, () => {
  const { status, out } = run(workspace(), { ...KEY, LINK: 'example.invalid', FORCE: 'yes' });
  clean(out);
  assert.match(out, /The GoDaddy account does not have example\.invalid \(or the key cannot see it\)\./);
  assert.notStrictEqual(status, 0);
});

test('with a key and an answer, the domain and the DNS records are listed and the run succeeds', { skip }, () => {
  const { status, out } = run(workspace({ curl: ANSWERING_CURL }), { ...KEY, DNS: 'yes' });
  clean(out);
  local(out);
  assert.match(out, /example\.invalid\s+active\s+expires 2027-01-01\s+ns ns1\.example\.invalid/);
  assert.match(out, /www\.example\.invalid\s+CNAME/);
  assert.match(out, /A\s+@\s+192\.0\.2\.1\s+ttl 600/);
  assert.strictEqual(status, 0, out);
});

test('a project that is not linked shows how to link it, needs no key, and succeeds', { skip }, () => {
  const { status, out } = run(workspace({ curl: OFFLINE_CURL }, false));
  clean(out);
  assert.match(out, /not linked\. Link it with:/);
  assert.doesNotMatch(out, /No GoDaddy API key/);
  assert.strictEqual(status, 0, out);
});
