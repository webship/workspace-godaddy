#!/usr/bin/env bash

argparse "$@" <<ARGEOF || exit 1
parser.add_argument('PROJECT_NAME',
                    help='The project directory in this workspace.')
parser.add_argument('-l', '--link',
                    default="_none_",
                    help='Link the project to a domain in the GoDaddy account, and its hosting over SSH: domain[,user@host:/remote/docroot]. The SSH part is needed for the pulls, the deploy and the log.')
parser.add_argument('-p', '--push',
                    action='store_true',
                    default=False,
                    help='Deploy: rsync the local docroot to the remote document root (excludes sites/default/files, settings.php, .git, .ddev; deletes what is gone locally). Outward-facing: asks before syncing.')
parser.add_argument('-e', '--environment',
                    default="_none_",
                    help='The domain for THIS run (the linked one, or one of its subdomains in DNS). Default: the one remembered by --select.')
parser.add_argument('-E', '--environments',
                    action='store_true',
                    default=False,
                    help='Show the domain (status, expiry, name servers) and its A/CNAME records, each a site.')
parser.add_argument('-s', '--select',
                    default="_none_",
                    help='Remember which host name this project works against (in .godaddy/workspace.yml, git-excluded). Checked against the DNS records.')
parser.add_argument('-n', '--dns',
                    action='store_true',
                    default=False,
                    help='List every DNS record of the domain.')
parser.add_argument('-D', '--pull-db',
                    action='store_true',
                    default=False,
                    help='Dump the site's database over SSH (drush sql:dump in the remote docroot) and import it into DDEV. REPLACES the local database — the current one is exported to backups/ first. Client data.')
parser.add_argument('-F', '--pull-files',
                    action='store_true',
                    default=False,
                    help='rsync the remote sites/default/files into the local docroot (adds and overwrites, never deletes). Client data.')
parser.add_argument('-g', '--logs',
                    action='store_true',
                    default=False,
                    help='Show the last 50 lines of the site's error_log over SSH.')
parser.add_argument('-B', '--no-safety-backup',
                    action='store_true',
                    default=False,
                    help='Skip exporting the local database before --pull-db replaces it.')
parser.add_argument('-f', '--force',
                    action='store_true',
                    default=False,
                    help='Allow --link to relink a project that already points at a different domain.')
ARGEOF
