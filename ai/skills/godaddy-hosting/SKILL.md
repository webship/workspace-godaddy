---
name: godaddy-hosting
description: Work with a Webship Workspace site on GoDaddy through the GoDaddy plugin (`@webship.co/workspace-godaddy`) — the GODADDY menu of a project row and the command behind every entry, `cmd-tools-godaddy.sh`, with each of its options, how a project is linked, the keys of `plugin.godaddy.settings.yml` and the credential they hold, and what the command says when something is missing. Use when asked "is this site linked to GoDaddy", "link this project", "list the environments", "what was deployed last", "get the live database", "deploy this site", "the menu says not linked", or "where does the GoDaddy token go".
argument-hint: '<project>'
---

# godaddy-hosting

GoDaddy for a site of a Webship Workspace (`~/workspace`, container-based, DDEV by default). It comes
with the GoDaddy plugin (`@webship.co/workspace-godaddy`), a provider of the hosting family (`@webship.co/workspace-hosting`),
like the agent `godaddy-deployer`, the command `/godaddy-status` and the prompt `godaddy-test-then-deploy`.

## The GODADDY menu

The GODADDY menu is on the project rows of the sites folders. The caption beside it says `linked`
or `not linked`. A project that is not linked is shown how to link it; a linked one gets these
entries, and each of them runs the command of the plugin in a terminal session, from the sites
folder:

| Menu entry | The command |
| --- | --- |
| **Link, domain and DNS** | `bash cmd-tools-godaddy.sh <project>` |
| **All DNS records** | `bash cmd-tools-godaddy.sh <project> --dns` |
| **Last 50 lines of error_log** | `bash cmd-tools-godaddy.sh <project> --logs` |
| **Deploy with rsync…** | `bash cmd-tools-godaddy.sh <project> --push` |

The menu ends with the note "The domain and DNS come from the GoDaddy API; the pulls, the deploy and the log need the hosting account over SSH".

### Get the live data

The menu also offers to get the database and the files of an environment into the local site. From a terminal:

| What | The command | What it does |
| --- | --- | --- |
| The database | `bash cmd-tools-godaddy.sh <project> --environment <environment> --pull-db` | Dump the site's database over SSH (drush sql:dump in the remote docroot) and import it into DDEV. REPLACES the local database — the current one is exported to backups/ first. Client data. |
| The files | `bash cmd-tools-godaddy.sh <project> --environment <environment> --pull-files` | rsync the remote sites/default/files into the local docroot (adds and overwrites, never deletes). Client data. |

## The command

`cmd-tools-godaddy.sh` is placed in every sites folder of the workspace. The first word after it is the
project; with nothing else it says whether the project is linked, and to what.

```bash
cd ~/workspace/<folder>
bash cmd-tools-godaddy.sh <project>
bash cmd-tools-godaddy.sh <project> --link example.com,user@host:/home/user/public_html
bash cmd-tools-godaddy.sh <project> --environments
```

| Option | What it does |
| --- | --- |
| `--link <value>` | Link the project to a domain in the GoDaddy account, and its hosting over SSH: domain[,user@host:/remote/docroot]. The SSH part is needed for the pulls, the deploy and the log. |
| `--push` | Deploy: rsync the local docroot to the remote document root (excludes sites/default/files, settings.php, .git, .ddev; deletes what is gone locally). Outward-facing: asks before syncing. |
| `--environment <value>` | The domain for THIS run (the linked one, or one of its subdomains in DNS). Default: the one remembered by --select. |
| `--environments` | Show the domain (status, expiry, name servers) and its A/CNAME records, each a site. |
| `--select <value>` | Remember which host name this project works against (in .godaddy/workspace.yml, git-excluded). Checked against the DNS records. |
| `--dns` | List every DNS record of the domain. |
| `--pull-db` | Dump the site's database over SSH (drush sql:dump in the remote docroot) and import it into DDEV. REPLACES the local database — the current one is exported to backups/ first. Client data. |
| `--pull-files` | rsync the remote sites/default/files into the local docroot (adds and overwrites, never deletes). Client data. |
| `--logs` | Show the last 50 lines of the site's error_log over SSH. |
| `--no-safety-backup` | Skip exporting the local database before --pull-db replaces it. |
| `--force` | Allow --link to relink a project that already points at a different domain. |

With no project the command says that `PROJECT_NAME` is required; with a project that is not in
the folder, "No such project"; with an option that needs a link on a project that has none, "Not
linked to GoDaddy".

## Link a project

A project is linked to a domain of the GoDaddy account, and to its hosting over SSH: `domain`, optionally followed by a comma and `user@host:/remote/docroot`. The link is written to `.godaddy/workspace.yml` in the project, which git does not track. A GoDaddy link is the domain, optionally followed by a comma and the hosting account as user@host:/remote/docroot.

```bash
bash cmd-tools-godaddy.sh <project> --link example.com,user@host:/home/user/public_html
```

## The settings: `core/config/plugin.godaddy.settings.yml`

| Key | What it is |
| --- | --- |
| `api_key:` | A production API key from developer.godaddy.com → API Keys. Sent as sso-key KEY:SECRET. |
| `api_secret:` | The secret of that key. |
| `ssh_key:` | The private key the pulls and deploys use to reach the hosting account over SSH. Default: ~/.ssh/id_ed25519. |

The dashboard reaches GoDaddy with api_key and api_secret in core/config/plugin.godaddy.settings.yml. The file is created mode 600 and its secrets are
masked on the Settings page. Never print them, never copy them into another file, and never commit
the file.

## Turn it on, and check it

```bash
cd ~/workspace
bash core/scripts/plugins.sh --require @webship.co/workspace-godaddy
bash core/scripts/plugins.sh --activate godaddy --with-needs     # adds a sites folder and the AI folders when they are missing
bash core/scripts/plugins.sh --install godaddy
bash core/scripts/plugins.sh --configure godaddy
bash core/scripts/plugins.sh --check godaddy                     # the commands it needs on the machine
```

## Traps

- **Two ways in, for two things.** The domain and its DNS records come from the GoDaddy API with `api_key:` and `api_secret:` (a production key from developer.godaddy.com, API Keys); the pulls, the deploy and the log need the hosting account over SSH, with the key in `ssh_key:`.
- **A link with the domain only** shows the domain and its DNS, and nothing more: the pulls, the deploy and the log need the SSH part of the link.
- **"UNABLE_TO_AUTHENTICATE" or "ACCESS_DENIED"**: the key is refused, or it is not a production key.
- **A deploy is an rsync that deletes**: it syncs the local docroot to the remote document root and removes there what is gone here. It leaves `sites/default/files`, `settings.php`, `.git` and `.ddev` alone, and asks before it syncs.
- **The database pull runs `drush sql:dump` in the remote docroot**, over SSH: the site there needs drush. It replaces the local database; the current one is exported to `backups/` first, unless `--no-safety-backup` was given.
- **An environment here is a host name**: the linked domain, or one of its A or CNAME records.
- **A deploy is outward-facing.** The command asks before it sends anything, in a terminal: it is
  not a step for an AI assistant to take on its own.
