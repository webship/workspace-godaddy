# @webship/workspace-godaddy

GoDaddy for the [Webship Workspace](https://github.com/webship/workspace) dashboard: the **GODADDY**
menu on every site row, a live-site chip on the project card, "Link to GoDaddy" when a new folder is
made, and the `cmd-tools-godaddy.sh` command in every site workspace. A provider of
[`@webship/workspace-hosting`](https://github.com/webship/workspace-hosting), which draws the menu,
the environments modal, the get-database-and-files flow and the New-folder section for every host.

GoDaddy's API (developer.godaddy.com) answers for the domain and its DNS: the environments are the domain and the host names its A and CNAME records make live. The hosting account (Web Hosting, cPanel plans) is reached over SSH like any cPanel server, so the database, the files, the deploy and the log work the same way as `@webship/workspace-cpanel`. The link is `domain` for DNS only, or `domain,user@host:/remote/docroot` for the hosting too.

## Use it

```bash
cd ~/workspace
bash core/scripts/plugins.sh --require github:webship/workspace-godaddy
bash core/scripts/plugins.sh --activate godaddy
bash core/scripts/plugins.sh --install godaddy
bash core/scripts/plugins.sh --configure godaddy      # core/config/plugin.godaddy.settings.yml
```

The same four steps are buttons on the dashboard's **Settings → Plugins** page.

## The command

```bash
cd ~/workspace/dev
bash cmd-tools-godaddy.sh <project> [verb]
```

| Verb | What it does |
| --- | --- |
| `--link` <value> | Link the project to a domain in the GoDaddy account, and its hosting over SSH: domain[,user@host:/remote/docroot]. The SSH part is needed for the pulls, the deploy and the log. |
| `--push` | Deploy: rsync the local docroot to the remote document root (excludes sites/default/files, settings.php, .git, .ddev; deletes what is gone locally). Outward-facing: asks before syncing. |
| `--environment` <value> | The domain for THIS run (the linked one, or one of its subdomains in DNS). Default: the one remembered by --select. |
| `--environments` | Show the domain (status, expiry, name servers) and its A/CNAME records, each a site. |
| `--select` <value> | Remember which host name this project works against (in .godaddy/workspace.yml, git-excluded). Checked against the DNS records. |
| `--dns` | List every DNS record of the domain. |
| `--pull-db` | Dump the site's database over SSH (drush sql:dump in the remote docroot) and import it into DDEV. REPLACES the local database — the current one is exported to backups/ first. Client data. |
| `--pull-files` | rsync the remote sites/default/files into the local docroot (adds and overwrites, never deletes). Client data. |
| `--logs` | Show the last 50 lines of the site's error_log over SSH. |
| `--no-safety-backup` | Skip exporting the local database before --pull-db replaces it. |
| `--force` | Allow --link to relink a project that already points at a different domain. |

The link lives in the project's `.godaddy/workspace.yml` (git-excluded); the dashboard reads it to know
the project is linked and which environment it works against.

## What the package holds

| Path | What it is |
| --- | --- |
| `src/index.ts` | `register(api)`: `registerHosting(api, godaddyProvider(api))` |
| `src/lib/provider.ts` | The GoDaddy provider: the credentials, the environments and their URLs, the verbs, the pulls, the console |
| `src/lib/link.ts` | The link file reader |
| `commands/cmd-tools-godaddy.sh` | The per-workspace command |
| `scripts/functions/fun-godaddy.sh` | The provider's bash hooks (its API) |
| `scripts/functions/fun-godaddy-tool.sh` | The family's dispatcher: link file, environment selection, safety export, status |
| `scripts/args/arg-godaddy.sh` | Its argparse |
| `scripts/host-install.sh` | The host side: the CLI and the credential check |
| `config/plugin.godaddy.settings.yml` | The settings template |

The `workspacePlugin` block in `package.json` is the manifest the installer reads.
