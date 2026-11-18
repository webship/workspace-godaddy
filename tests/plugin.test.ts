import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { register, godaddyProvider } from '../src/index';
import { godaddyLinkOf } from '../src/lib/link';

// Compiled, these tests run from dist/tests, so the package root is one folder further up.
const PKG = fs.existsSync(path.join(__dirname, '..', 'package.json')) ? path.join(__dirname, '..') : path.join(__dirname, '..', '..');

test('the package requires nothing outside itself', () => {
  for (const f of ['src/index.ts', 'src/lib/link.ts', 'src/lib/provider.ts']) {
    const src = fs.readFileSync(path.join(PKG, f), 'utf8');
    assert.doesNotMatch(src, /from ['"]\.\.\/\.\./, `${f} reaches outside the package`);
  }
});

test('the manifest says what the installer has to place, and every named file ships', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf8'));
  const m = pkg.workspacePlugin;
  assert.strictEqual(m.name, 'godaddy');
  const files: string[] = [m.settingsTemplate, m.labels, ...m.commands.files, ...m.scripts.functions, ...m.scripts.args, m.scripts.hostInstall, ...((m.ddev && m.ddev.compose) || []), ...(m.features || [])];
  for (const f of files) assert.ok(fs.existsSync(path.join(PKG, f)), `${f} is in the package`);
  for (const folder of pkg.files) assert.ok(fs.existsSync(path.join(PKG, folder)) || folder.startsWith('dist'), `${folder} exists`);
});

test('a project is linked when .godaddy/workspace.yml names an id', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'godaddy-'));
  const p = path.join(dir, 'site1');
  fs.mkdirSync(path.join(p, '.godaddy'), { recursive: true });
  fs.mkdirSync(path.join(p, '.git'), { recursive: true });
  fs.writeFileSync(path.join(p, '.godaddy', 'workspace.yml'), 'id: example.com\nenv: example.com\nregion: eu-1\n');
  fs.writeFileSync(path.join(p, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  const u = godaddyLinkOf(p);
  assert.strictEqual(u.id, 'example.com');
  assert.strictEqual(u.env, 'example.com');
  assert.strictEqual(u.branch, 'main');
  assert.strictEqual(u.fields.region, 'eu-1');
  assert.strictEqual(godaddyLinkOf(path.join(dir, 'nope')), null);
});

function fakeApi(root: string) {
  const calls: any = { rowMenus: {}, chips: [], actions: {}, fragments: [], pages: [], setups: [], css: [] };
  const api: any = {
    name: 'godaddy', config: {},
    settings: { file: 'plugin.godaddy.settings.yml', read: () => ({ api_key: 'CHANGE_ME', api_secret: 'CHANGE_ME', ssh_key: 'CHANGE_ME' }), set() {}, setList() {} },
    lib: {
      esc: (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)),
      ROOT: root, workspaceDir: (ws: string) => path.join(root, ws), listProjects: (dir: string) => fs.readdirSync(dir),
      isValidWorkspace: (ws: string) => /^[a-z0-9_-]+$/.test(ws), screenAction: () => {}, iconHtml: (n: string) => `<i data-icon="${n}"></i>`,
      NAME_RE: /^[a-zA-Z0-9_-]+$/, run: async () => ({ ok: false, code: 1, stdout: '', stderr: '' }), startInScreen: async () => ({ ok: true }),
      screenStartedHtml: () => '', cliError: (s: string) => s, commandBlock: () => '',
    },
    addRowMenu: (slot: string, spec: any, fn: any) => { calls.rowMenus[slot] = { spec, fn }; },
    addProjectChip: (fn: any) => calls.chips.push(fn), addAction: (name: string, fn: any) => { calls.actions[name] = fn; },
    addFragment: (fn: any) => calls.fragments.push(fn), addPage: (re: RegExp, fn: any) => calls.pages.push({ re, fn }),
    addFolderSetup: (s: any) => calls.setups.push(s), addCss: (f: string) => calls.css.push(f),
  };
  return { api, calls };
}

test('register() asks for the hosting surface under the godaddy slot', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'godaddy-ws-'));
  fs.mkdirSync(path.join(root, 'dev', 'site1'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dev', 'cmd-tools-godaddy.sh'), '#!/usr/bin/env bash\n');
  const { api, calls } = fakeApi(root);
  register(api);
  assert.deepStrictEqual(Object.keys(calls.rowMenus), ['godaddy']);
  assert.deepStrictEqual(calls.rowMenus.godaddy.spec, { label: 'GODADDY', row: 0 });
  assert.ok(calls.actions['tool-status'] && calls.actions.envs, 'the status verb and the environments modal');
  assert.ok(calls.pages[0].re.test('/godaddy-site/dev/site1'));
  const ctx: any = { key: 'dev', project: 'site1', dir: path.join(root, 'dev'), meta: {}, vals: () => "hx-vals='{}'" };
  const html = calls.rowMenus.godaddy.fn({ ...ctx, allowed: new Set(['godaddy']) });
  assert.match(html, /GODADDY/);
  assert.match(html, /not linked/);
  assert.match(html, /cmd-tools-godaddy\.sh site1 --link/);
  assert.strictEqual(calls.rowMenus.godaddy.fn({ ...ctx, allowed: new Set(['ddev']) }), null);
});

test('the provider: id, script, verbs, token gate and console', () => {
  const p = godaddyProvider(fakeApi(os.tmpdir()).api);
  assert.strictEqual(p.id, 'godaddy');
  assert.strictEqual(p.script, 'cmd-tools-godaddy.sh');
  assert.ok(p.tools.status, 'a status verb');
  assert.ok(p.tools.deploy, 'a deploy verb');
  assert.ok(p.tools.logs, 'a logs verb');
  assert.strictEqual(p.jobEnv(), null, 'CHANGE_ME is no credential');
  assert.match(String(p.consoleUrl({ id: 'example.com', fields: {} } as any)), /^https:\/\//);
});

test('the credential never rides on curl\'s command line: it is read from a header file only its owner can read, removed after', async () => {
  const PATH = process.env.PATH;
  process.env.PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'no-cli-'));   // no CLI: the REST API through curl
  try {
    const seen: any[] = [];
    const lib: any = {
      cliError: (s: string) => s,
      run: async (cmd: string, args: string[]) => {
        const at = args.find((a) => a.startsWith('@'));
        const file = at ? at.slice(1) : '';
        seen.push({ cmd, args, file, text: file ? fs.readFileSync(file, 'utf8') : '', mode: file ? (fs.statSync(file).mode & 0o777) : 0 });
        return { ok: true, code: 0, stdout: '{"status":"ACTIVE"}', stderr: '' };
      },
    };
    await (godaddyProvider(fakeApi(os.tmpdir()).api) as any).environments({ id: 'example.org' }, lib, { ...process.env, GODADDY_API_KEY: 'gd-key-x', GODADDY_API_SECRET: 'gd-secret-x' });
    assert.ok(seen.length >= 1 && seen.every((s) => s.cmd === 'curl'), JSON.stringify(seen.map((s) => s.cmd)));
    for (const s of seen) {
      assert.ok(!s.args.some((a: string) => a.includes('gd-secret-x')), `not on the command line: ${s.args.join(' ')}`);
      assert.match(s.text, /^Authorization: sso-key gd-key-x:gd-secret-x$/m, 'in the header file');
      assert.strictEqual(s.mode, 0o600);
      assert.ok(!fs.existsSync(s.file), 'the file is removed after the call');
    }
  } finally {
    process.env.PATH = PATH;
  }
});
