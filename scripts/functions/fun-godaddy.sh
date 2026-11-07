#!/usr/bin/env bash

# GoDaddy: the GoDaddy API (developer.godaddy.com) for the domain and its DNS, SSH to the hosting
# account for everything that touches the site. The hooks the hosting dispatcher
# (fun-godaddy-tool.sh) calls for one project directory. Everything defaults to read-only;
# --link, --push, --pull-db and --pull-files each demand their flag, and nothing here ever changes
# a DNS record.

function godaddy_key() { printf '%s' "${GODADDY_API_KEY:-${api_key:-}}" ; }
function godaddy_secret() { printf '%s' "${GODADDY_API_SECRET:-${api_secret:-}}" ; }
function godaddy_ssh_key() { local k="${GODADDY_SSH_KEY:-${ssh_key:-~/.ssh/id_ed25519}}"; printf '%s' "${k/#\~/${HOME}}" ; }

function ensure_godaddy() {
  for tool in curl python3 ; do
    command -v "${tool}" > /dev/null 2>&1 || { echo "${tool} is not installed, and the GoDaddy tool needs it."; return 1; } ;
  done
  if [ -z "$(godaddy_key)" ] || [ "$(godaddy_key)" == 'CHANGE_ME' ] ; then
    echo "No GoDaddy API key: set api_key and api_secret in core/config/plugin.godaddy.settings.yml (developer.godaddy.com → API Keys, production)." ;
    return 1 ;
  fi
  return 0 ;
}

function godaddy_api() {
  curl -sS -m 30 -H "Authorization: sso-key $(godaddy_key):$(godaddy_secret)" -H "Accept: application/json" "https://api.godaddy.com/v1/$1" ;
}

# domain[,user@host:/remote/docroot]
function godaddy_do_link() {
  local project_path="$1" spec="$2" domain ssh user host remote;
  domain="${spec%%,*}"; ssh="${spec#*,}"; [ "${ssh}" == "${spec}" ] && ssh="";
  godaddy_api "domains/${domain}" | python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(1 if d.get("code") else 0)' \
    || { echo "The GoDaddy account does not have ${domain} (or the key cannot see it)."; return 1; } ;
  godaddy_link_set "${project_path}" id "${domain}" ;
  godaddy_link_set "${project_path}" env "${domain}" ;
  if [ -n "${ssh}" ] ; then
    [[ "${ssh}" =~ ^([^@]+)@([^:]+):(/.+)$ ]] || { echo "The hosting part is user@host:/remote/docroot, got: ${ssh}"; return 1; } ;
    user="${BASH_REMATCH[1]}"; host="${BASH_REMATCH[2]}"; remote="${BASH_REMATCH[3]}";
    godaddy_link_set "${project_path}" ssh "${user}@${host}" ;
    godaddy_link_set "${project_path}" remote "${remote}" ;
    if ssh -i "$(godaddy_ssh_key)" -o BatchMode=yes -o ConnectTimeout=10 "${user}@${host}" "test -d '${remote}'" 2>/dev/null ; then
      echo "  SSH reaches ${user}@${host} and ${remote} exists." ;
    else
      echo "  SSH could not reach ${user}@${host} with $(godaddy_ssh_key): enable SSH in the hosting dashboard and authorize the key." ;
    fi
  else
    echo "  DNS only: add ,user@host:/remote/docroot to the link for the pulls, the deploy and the log." ;
  fi
}

function godaddy_list_environments() {
  local domain="$2";
  echo "${domain}";
  godaddy_api "domains/${domain}/records" | python3 -c 'import json,sys
for r in json.load(sys.stdin):
    if r.get("type") in ("A","CNAME") and r.get("name") not in ("@","*"): print("%s.%s" % (r["name"], sys.argv[1]))' "${domain}" 2>/dev/null ;
}

function godaddy_do_environments() {
  local domain="$2";
  godaddy_api "domains/${domain}" | python3 -c 'import json,sys
d=json.load(sys.stdin)
if d.get("code"): print("  " + str(d.get("message", d["code"]))); sys.exit(1)
print("  %-40s %-10s expires %s   ns %s" % (d.get("domain",""), (d.get("status") or "").lower(), (d.get("expires") or "")[:10], ", ".join(d.get("nameServers") or [])))' || return 1 ;
  godaddy_api "domains/${domain}/records" | python3 -c 'import json,sys
for r in json.load(sys.stdin):
    if r.get("type") in ("A","CNAME"):
        host = sys.argv[1] if r["name"]=="@" else "%s.%s" % (r["name"], sys.argv[1])
        print("  %-40s %-6s %-30s https://%s" % (host, r["type"], r["data"], host))' "${domain}" 2>/dev/null ;
}

function godaddy_ssh() {
  local project_path="$1" target; shift;
  target="$(godaddy_link_get "${project_path}" ssh)";
  [ -z "${target}" ] && { echo "No hosting account in the link: relink with --link <domain>,user@host:/remote/docroot --force" >&2; return 1; } ;
  ssh -i "$(godaddy_ssh_key)" -o BatchMode=yes -o ConnectTimeout=15 "${target}" "$@" ;
}

function godaddy_pull_db() {
  local project_path="$1" domain="$2" env="$3" stamp out dump safety remote;
  remote="$(godaddy_link_get "${project_path}" remote)";
  [ -z "${remote}" ] && { echo "No hosting account in the link: relink with --link ${domain},user@host:/remote/docroot --force"; return 1; } ;
  stamp="$(date +%Y-%m-%d-%H%M%S)";
  out="${backups}/${doc_name}/${PROJECT_NAME}";
  mkdir -p "${out}" ;
  dump="${out}/${PROJECT_NAME}-godaddy-${env}-${stamp}.sql.gz";
  safety="${out}/${PROJECT_NAME}-before-godaddy-pull-${stamp}.sql.gz";
  echo "";
  echo "Pulling the database of ${env} (drush sql:dump in ${remote} over SSH).";
  echo "  This is client data: it lands on this machine and in ${out}.";
  echo "";
  godaddy_safety_export "${project_path}" "${safety}" ;
  godaddy_ssh "${project_path}" "cd '${remote}' && (command -v drush >/dev/null 2>&1 && drush sql:dump --gzip || ../vendor/bin/drush sql:dump --gzip)" > "${dump}" || return 1 ;
  [ -s "${dump}" ] || { echo "The dump is empty — is drush on the server (vendor/bin/drush beside the docroot)?"; return 1; } ;
  godaddy_import_dump "${project_path}" "${dump}" || return 1 ;
  echo "";
  echo "  Imported ${env} into ${doc_name}/${PROJECT_NAME}.";
  echo "    pulled dump:   ${dump}";
  echo "    local backup:  ${safety}";
}

function godaddy_pull_files() {
  local project_path="$1" domain="$2" env="$3" docroot remote target;
  remote="$(godaddy_link_get "${project_path}" remote)"; target="$(godaddy_link_get "${project_path}" ssh)";
  [ -z "${remote}" ] && { echo "No hosting account in the link: relink with --link ${domain},user@host:/remote/docroot --force"; return 1; } ;
  docroot="$(godaddy_docroot "${project_path}")";
  [ -z "${docroot}" ] && { echo "No web/ or docroot/ in ${doc_name}/${PROJECT_NAME} — nothing to pull files into."; return 1; } ;
  echo "";
  echo "rsync ${target}:${remote}/sites/default/files → ${docroot}/sites/default/files (adds and overwrites, never deletes).";
  mkdir -p "${project_path}/${docroot}/sites/default/files" ;
  rsync -az --info=progress2 -e "ssh -i $(godaddy_ssh_key) -o BatchMode=yes" "${target}:${remote}/sites/default/files/" "${project_path}/${docroot}/sites/default/files/" || return 1 ;
  echo "  If Drupal still shows broken images: ddev drush cr";
}

function godaddy_do_push() {
  local project_path="$1" domain="$2" env="$3" docroot remote target a;
  remote="$(godaddy_link_get "${project_path}" remote)"; target="$(godaddy_link_get "${project_path}" ssh)";
  [ -z "${remote}" ] && { echo "No hosting account in the link: relink with --link ${domain},user@host:/remote/docroot --force"; return 1; } ;
  docroot="$(godaddy_docroot "${project_path}")";
  [ -z "${docroot}" ] && { echo "No web/ or docroot/ in ${doc_name}/${PROJECT_NAME} — nothing to deploy."; return 1; } ;
  echo "Deploy ${docroot}/ of ${doc_name}/${PROJECT_NAME} → ${target}:${remote}/ (${env})";
  echo "  rsync --delete, excluding sites/default/files, sites/*/settings*.php, .git, .ddev. The live site changes.";
  read -r -p "  Continue? [y/N] " a < /dev/tty || return 1 ;
  [[ "${a}" =~ ^[Yy] ]] || { echo "Not deployed."; return 1; } ;
  rsync -az --delete --info=progress2 -e "ssh -i $(godaddy_ssh_key) -o BatchMode=yes" \
    --exclude 'sites/default/files' --exclude 'sites/*/settings*.php' --exclude '.git' --exclude '.ddev' \
    "${project_path}/${docroot}/" "${target}:${remote}/" || return 1 ;
  if [ -d "${project_path}/vendor" ] ; then
    rsync -az --delete -e "ssh -i $(godaddy_ssh_key) -o BatchMode=yes" "${project_path}/vendor/" "${target}:$(dirname "${remote}")/vendor/" || return 1 ;
  fi
  echo "  Deployed. Clear caches on the server: ssh ${target} 'cd ${remote} && drush cr'";
}

function godaddy_do_logs() {
  local project_path="$1" remote;
  remote="$(godaddy_link_get "${project_path}" remote)";
  godaddy_ssh "${project_path}" "for f in '${remote}/error_log' \"\$HOME/logs/\"*error_log \"\$HOME/\"*error_log; do [ -f \"\$f\" ] && { echo \"— \$f —\"; tail -50 \"\$f\"; }; done" ;
}

function godaddy_do_dns() {
  godaddy_api "domains/$2/records" | python3 -c 'import json,sys
for r in json.load(sys.stdin): print("  %-6s %-30s %-40s ttl %s" % (r.get("type",""), r.get("name",""), r.get("data",""), r.get("ttl","")))' ;
}

function godaddy_status() {
  local project_path="$1" domain="$2";
  if [ -z "${domain}" ] ; then
    echo "    (the link is the domain, optionally ,user@host:/remote/docroot for the hosting)";
    return 0 ;
  fi
  echo "    hosting: $(godaddy_link_get "${project_path}" ssh):$(godaddy_link_get "${project_path}" remote)";
  echo "";
  godaddy_do_environments "${project_path}" "${domain}" ;
  if [ "${DNS:-no}" == 'yes' ] ; then echo ""; godaddy_do_dns "${project_path}" "${domain}" ; fi
  echo "";
  echo "  Console: https://dcc.godaddy.com/control/portfolio/${domain}/settings";
  echo "  Data: --pull-db and --pull-files bring the site down into DDEV over SSH; --push deploys with rsync.";
}
