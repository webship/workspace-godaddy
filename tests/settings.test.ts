/**
 * The command reads its own settings file. The menu's verbs run `bash cmd-tools-godaddy.sh …` with no
 * extra environment, so api_key, api_secret and ssh_key come from core/config/plugin.godaddy.settings.yml
 * (an empty value or CHANGE_ME is not set); GODADDY_API_KEY, GODADDY_API_SECRET and GODADDY_SSH_KEY,
 * which the dashboard hands its own jobs, win. No request leaves without the key and its secret.
 *
 * The hooks run here as the command runs them, in a temp workspace whose PATH holds only the basic
 * tools and stand-ins for curl and ssh that reach nothing and write down what they were given.
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

/** curl and ssh that reach nothing and write down what they were given (@ROOT@ is the workspace). */
const STAND_INS: Record<string, string> = {
  curl: 'printf "%s\\n" "$@" >> "@ROOT@/curl.calls"; echo "curl: (6) Could not resolve host" >&2; exit 6',
  ssh: 'printf "%s\\n" "$@" >> "@ROOT@/ssh.calls"; echo "ssh: Could not resolve hostname" >&2; exit 255',
};

const temps: string[] = [];
after(() => { for (const d of temps) fs.rmSync(d, { recursive: true, force: true }); });

/** A workspace: the settings file (the template with these lines in place of its own), the linked dev/site1, bin/ with the basic tools and the stand-ins. */
function workspace(settings: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'godaddy-settings-'));
  temps.push(root);
  const bin = path.join(root, 'bin');
  fs.mkdirSync(path.join(root, 'core', 'config'), { recursive: true });
  fs.mkdirSync(path.join(root, 'dev', 'site1', '.godaddy'), { recursive: true });
  fs.mkdirSync(path.join(root, 'home'));
  fs.mkdirSync(bin);
  let text = fs.readFileSync(path.join(PKG, 'config', 'plugin.godaddy.settings.yml'), 'utf8');
  for (const [key, line] of Object.entries(settings)) text = text.replace(new RegExp(`^${key}:.*$`, 'm'), line);
  fs.writeFileSync(path.join(root, 'core', 'config', 'plugin.godaddy.settings.yml'), text);
  fs.writeFileSync(path.join(root, 'dev', 'site1', '.godaddy', 'workspace.yml'), 'id: example.invalid\nenv: example.invalid\nssh: site1user@example.invalid\nremote: /home/site1user/public_html\n');
  for (const t of BASIC) { const real = which(t); if (real) fs.symlinkSync(real, path.join(bin, t)); }
  for (const [name, body] of Object.entries(STAND_INS)) fs.writeFileSync(path.join(bin, name), `#!/usr/bin/env bash\n${body.split('@ROOT@').join(root)}\n`, { mode: 0o755 });
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

const calls = (root: string, tool: string) => (fs.existsSync(path.join(root, `${tool}.calls`)) ? fs.readFileSync(path.join(root, `${tool}.calls`), 'utf8') : '');
const sent = (root: string) => (calls(root, 'curl').match(/^Authorization: sso-key (.*)$/m) || [])[1];

test('the key and the secret set in the settings file are the ones the status sends', { skip }, () => {
  const root = workspace({ api_key: 'api_key: file-key', api_secret: 'api_secret: file-secret' });
  const { out } = run(root);
  assert.doesNotMatch(out, /No GoDaddy API key/);
  assert.strictEqual(sent(root), 'file-key:file-secret');
});

test('--environments finds the key in the settings file too', { skip }, () => {
  const root = workspace({ api_key: 'api_key: file-key', api_secret: 'api_secret: file-secret' });
  const { out } = run(root, { ENVIRONMENTS: 'yes' });
  assert.doesNotMatch(out, /No GoDaddy API key/);
  assert.strictEqual(sent(root), 'file-key:file-secret');
});

test('a quoted value with a comment after it is read without the quotes and the comment', { skip }, () => {
  const root = workspace({ api_key: 'api_key: "quoted-key" # from the Settings page', api_secret: "api_secret: 'quoted-secret'" });
  run(root);
  assert.strictEqual(sent(root), 'quoted-key:quoted-secret');
});

test('GODADDY_API_KEY and GODADDY_API_SECRET, which the dashboard hands its jobs, win over the file', { skip }, () => {
  const root = workspace({ api_key: 'api_key: file-key', api_secret: 'api_secret: file-secret' });
  run(root, { GODADDY_API_KEY: 'env-key', GODADDY_API_SECRET: 'env-secret' });
  assert.strictEqual(sent(root), 'env-key:env-secret');
});

test('CHANGE_ME, as installed, is no key: nothing is sent and the status says where the key goes', { skip }, () => {
  const root = workspace({});
  const { status, out } = run(root);
  assert.strictEqual(out.split(NO_KEY).length - 1, 1, out);
  assert.strictEqual(calls(root, 'curl'), '', 'no request without a key');
  assert.notStrictEqual(status, 0);
});

test('a key without its secret is no key either: nothing is sent', { skip }, () => {
  const root = workspace({ api_key: 'api_key: file-key' });
  const { out } = run(root, { ENVIRONMENTS: 'yes' });
  assert.match(out, new RegExp(NO_KEY));
  assert.strictEqual(calls(root, 'curl'), '');
});

test('ssh_key set in the settings file is the key ssh is given, with ~ for the home folder', { skip }, () => {
  const root = workspace({ api_key: 'api_key: file-key', api_secret: 'api_secret: file-secret', ssh_key: 'ssh_key: ~/keys/godaddy_ed25519' });
  run(root, { LOGS: 'yes' });
  const args = calls(root, 'ssh').split('\n');
  assert.strictEqual(args[args.indexOf('-i') + 1], path.join(root, 'home', 'keys', 'godaddy_ed25519'));
});

test('without ssh_key in the file, ssh is given ~/.ssh/id_ed25519', { skip }, () => {
  const root = workspace({ api_key: 'api_key: file-key', api_secret: 'api_secret: file-secret', ssh_key: 'ssh_key: CHANGE_ME' });
  run(root, { LOGS: 'yes' });
  const args = calls(root, 'ssh').split('\n');
  assert.strictEqual(args[args.indexOf('-i') + 1], path.join(root, 'home', '.ssh', 'id_ed25519'));
});
