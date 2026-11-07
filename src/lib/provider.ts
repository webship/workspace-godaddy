/**
 * GoDaddy, as a hosting provider.
 *
 * The link is `.godaddy/workspace.yml` (the domain, and the hosting account's SSH target when
 * given); the domain and its DNS records come from the GoDaddy API with the key and secret from
 * plugin.godaddy.settings.yml; the pulls, the deploy and the log go over SSH through
 * cmd-tools-godaddy.sh in a screen session.
 */

import type { PluginApi, PluginLib } from '@webship/workspace-plugin-api';
import { configured } from '@webship/workspace-hosting';
import type { EnvInfo, EnvRow, HostingLink, HostingProvider } from '@webship/workspace-hosting';

import { godaddyLinkOf } from './link';

export function godaddyProvider(api: PluginApi): HostingProvider {
  const settings = () => api.settings.read() || {};

  const jobEnv = (): NodeJS.ProcessEnv | null => {
    const key = configured(settings().api_key); const secret = configured(settings().api_secret);
    return key && secret ? { ...process.env, GODADDY_API_KEY: key, GODADDY_API_SECRET: secret, GODADDY_SSH_KEY: String(settings().ssh_key || '~/.ssh/id_ed25519') } : null;
  };

  async function environments(link: HostingLink, lib: PluginLib, env: NodeJS.ProcessEnv): Promise<EnvInfo> {
    const domain = link.id as string;
    const auth = `Authorization: sso-key ${env.GODADDY_API_KEY}:${env.GODADDY_API_SECRET}`;
    const info = await lib.run('curl', ['-sS', '-m', '30', '-H', auth, `https://api.godaddy.com/v1/domains/${encodeURIComponent(domain)}`], process.env.HOME, { timeoutMs: 40 * 1000, env });
    if (!info.ok) return { id: domain, rows: [], why: 'list failed' };
    let d: any; try { d = JSON.parse(String(info.stdout)); } catch (_) { return { id: domain, rows: [], why: 'list failed' }; }
    if (d.code) return { id: domain, rows: [], why: String(d.message || d.code) };
    const rows: EnvRow[] = [{ title: `${domain} (${String(d.status || '').toLowerCase()})`, envId: domain, status: /^active$/i.test(d.status) ? 'active' : String(d.status || 'unknown').toLowerCase(), url: `https://${domain}` }];
    const recs = await lib.run('curl', ['-sS', '-m', '30', '-H', auth, `https://api.godaddy.com/v1/domains/${encodeURIComponent(domain)}/records`], process.env.HOME, { timeoutMs: 40 * 1000, env });
    if (recs.ok) {
      try {
        for (const r of JSON.parse(String(recs.stdout)) as { type: string; name: string; data: string }[]) {
          if (!/^(A|CNAME)$/.test(r.type) || r.name === '@' || r.name === '*') continue;
          const host = `${r.name}.${domain}`;
          rows.push({ title: `${host} (${r.type} → ${r.data})`, envId: host, status: 'active', url: `https://${host}` });
        }
      } catch (_) { /* no records */ }
    }
    return { id: domain, rows };
  }

  return {
    id: 'godaddy',
    label: 'GODADDY',
    title: 'GoDaddy',
    script: 'cmd-tools-godaddy.sh',
    detect: (projectDir) => godaddyLinkOf(projectDir),
    linkHint: (project) => `bash cmd-tools-godaddy.sh ${project} --link example.com,user@host:/home/user/public_html`,
    consoleUrl: (link) => (link.id ? `https://dcc.godaddy.com/control/portfolio/${encodeURIComponent(link.id)}/settings` : null),
    jobEnv,
    tokenHint: 'api_key and api_secret in core/config/plugin.godaddy.settings.yml',
    environments,
    tools: {
      status: { verb: 'godaddy', label: 'Link, domain and DNS', icon: 'info', args: [] },
      dns: { verb: 'godaddy-dns', label: 'All DNS records', icon: 'list', args: ['--dns'] },
      logs: { verb: 'godaddy-logs', label: 'Last 50 lines of error_log', icon: 'file-text', args: ['--logs'] },
      deploy: { verb: 'godaddy-push', label: 'Deploy with rsync…', icon: 'push', args: ['--push'] },
    },
    pull: {
      db: true, files: true,
      dbArgs: (e) => ['--environment', e, '--pull-db'],
      filesArgs: (e) => ['--environment', e, '--pull-files'],
      noSafetyBackupArg: '--no-safety-backup',
    },
    errorHint: (msg) => (/UNABLE_TO_AUTHENTICATE|ACCESS_DENIED|401|403/i.test(msg)
      ? `${msg}\n\nThe dashboard reaches GoDaddy with api_key and api_secret in core/config/plugin.godaddy.settings.yml: a production key from developer.godaddy.com → API Keys.`
      : msg),
    folder: {
      idPattern: /^[a-z0-9.-]+\.[a-z]{2,}(,[a-z0-9_.-]+@[a-z0-9.-]+:\/.+)?$/i,
      idPlaceholder: 'example.com,user@host:/home/user/public_html',
      idHelp: 'A GoDaddy link is the domain, optionally followed by a comma and the hosting account as user@host:/remote/docroot.',
    },
    menuNote: 'The domain and DNS come from the GoDaddy API; the pulls, the deploy and the log need the hosting account over SSH',
  };
}
