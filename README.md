# @webship.co/workspace-godaddy

GoDaddy for the [Webship Workspace](https://github.com/webship/workspace) dashboard: the **GODADDY**
menu on every site row, a live-site chip on the project card, "Link to GoDaddy" when a new folder is
made, and the `cmd-tools-godaddy.sh` command in every site workspace. A provider of
[`@webship.co/workspace-hosting`](https://github.com/webship/workspace-hosting), which draws the menu,
the environments modal, the get-database-and-files flow and the New-folder section for every host.

GoDaddy's API (developer.godaddy.com) answers for the domain and its DNS: the environments are the domain and the host names its A and CNAME records make live. The hosting account (Web Hosting, cPanel plans) is reached over SSH like any cPanel server, so the database, the files, the deploy and the log work the same way as `@webship.co/workspace-cpanel`. The link is `domain` for DNS only, or `domain,user@host:/remote/docroot` for the hosting too.

## Use it

```bash
cd ~/workspace
bash core/scripts/plugins.sh --require github:webship/workspace-godaddy
bash core/scripts/plugins.sh --activate godaddy
bash core/scripts/plugins.sh --install godaddy
bash core/scripts/plugins.sh --configure godaddy      # core/config/plugin.godaddy.settings.yml
```

The same four steps are buttons on the dashboard's **Settings → Plugins** page.

## The items it carries

The workspace is container-based (DDEV by default). Each item lands in the folder of its kind, when
that folder is an active workspace folder, is listed there like any other item, and is installed
into Claude Code from there:

| What | Lands in | What it is for |
| --- | --- | --- |
| The agent `godaddy-deployer` | `ai-agents/` | Says whether a site is linked to GoDaddy and to what, reads its environments and its log, brings the live data here when asked, tests it before a deploy, and hands over the deploy line |
| The skill `godaddy-hosting` | `ai-skills/` | Every entry of the GODADDY menu and the command behind it, each option of `cmd-tools-godaddy.sh`, the link, the keys of `plugin.godaddy.settings.yml` |
| The command `/godaddy-status` | `ai-commands/` | `/godaddy-status <project>`: the link and the environments. Read-only |
| The prompt `godaddy-test-then-deploy` | `ai-prompts/` | The launch command of a session that checks a site, runs its webship-js suite when it has one, and gives the deploy line |

The plugin keeps its one command, `cmd-tools-godaddy.sh`; no other was added. The item bodies are plain Markdown any AI command-line assistant can follow; Claude Code is the default shape (frontmatter, the launch command of the prompt). A site that carries a webship-js suite is tested by the workspace's own `cmd-tools-testing.sh <project> --run` before a deploy, when it is there.

How the items are laid out and checked: [docs/plugin-items-pattern.md](docs/plugin-items-pattern.md).

## What it needs

A workspace starts empty, so the manifest says what else this plugin needs (`needs`):

- one sites folder: `dev`, `test`, `demos`, `sandboxes`, `projects` (`dev` is the one added when none is there). `cmd-tools-godaddy.sh`, which the menu's verbs run, is placed in it, and the menu is on its project rows.
- on the machine: `curl`, `python3`. A part of it also uses `ssh`, `rsync`.

`--require` says so, `--activate` and `--install` stop until the workspace has a sites folder, and `--with-needs` adds it first. A missing command is said and never added:

```bash
bash core/scripts/plugins.sh --activate godaddy --with-needs
bash core/scripts/plugins.sh --check godaddy      # each command: found, with its version, or missing, with how to install it
```

A workspace that knows none of this (Webship Workspace 1.0.8 and older) ignores the keys: add a sites folder yourself, then `--install godaddy` again.

It also needs the AI folders its items are placed in (`needs.plugins`): `ai-agents`, `ai-skills`, `ai-commands` and `ai-prompts`, beside the sites folder. `--with-needs` adds what is missing first. A kind whose folder is not an active workspace folder is skipped, and the install says so.

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
| `ai/agents/godaddy-deployer.md` | The agent `godaddy-deployer` |
| `ai/skills/godaddy-hosting/` | The skill `godaddy-hosting` |
| `ai/commands/godaddy-status.md` | The command `/godaddy-status` |
| `ai/prompts/godaddy-test-then-deploy.md` | The prompt `godaddy-test-then-deploy` |
| `tests/items.test.ts` | The shape of every item, and that it names nothing the plugin does not have |

The `workspacePlugin` block in `package.json` is the manifest the installer reads.
