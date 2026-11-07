/**
 * GoDaddy for Webship Workspace.
 *
 * The GODADDY menu on every site row, a live-site chip, the New-folder link option and the
 * `/godaddy-site/<workspace>/<project>` jump: all of it is the hosting family's surface
 * (@webship/workspace-hosting). This package is the GoDaddy provider plus what the installer places
 * (the per-workspace command, its bash functions, the settings template, the host install).
 *
 * Everything the dashboard is asked for goes through `api`; this package requires nothing from
 * the dashboard's own files.
 */

import type { PluginApi } from '@webship/workspace-plugin-api';
import { registerHosting } from '@webship/workspace-hosting';

import { godaddyProvider } from './lib/provider';

export { godaddyProvider };
export { godaddyLinkOf } from './lib/link';

export function register(api: PluginApi): void {
  registerHosting(api, godaddyProvider(api));
}
