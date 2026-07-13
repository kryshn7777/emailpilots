import type { Config } from '../config';
import type { SendStrategy, StrategyDeps } from './sendStrategy';
import { SmtpStrategy } from './smtpStrategy';
import { OAuthSmtpStrategy } from './oauthSmtp';

/**
 * Pick the send transport for a per-account Config slice. Reads
 * `config.account.transport`; an absent value means classic SMTP, so existing
 * single-account installs (and any caller that builds a bare `{ smtp }` config)
 * keep working unchanged.
 *
 * Electron-only transports are not imported here (this module is shared with the
 * pure-Node CLI). The main process supplies them via `deps`:
 *  - 'oauth-smtp' needs `deps.getAccessToken`
 *  - 'browser'    needs `deps.createBrowserStrategy`
 */
export function makeStrategy(config: Config, deps?: StrategyDeps): SendStrategy {
  const transport = config.account?.transport ?? 'smtp';
  switch (transport) {
    case 'smtp':
      return new SmtpStrategy(config);

    case 'oauth-smtp':
      // Token acquisition (MSAL) is Electron-only, so it is injected. Without it
      // (e.g. the pure-Node CLI) an OAuth account cannot send.
      if (!deps?.getAccessToken) {
        throw new Error('oauth-smtp transport requires an OAuth token getter (Electron only).');
      }
      return new OAuthSmtpStrategy(config, config.account!, deps.getAccessToken);

    case 'browser':
      if (!deps?.createBrowserStrategy) {
        throw new Error('browser transport requires Electron (no browser strategy provided).');
      }
      return deps.createBrowserStrategy(config, config.account!);

    default:
      throw new Error(`Unknown transport: ${transport}`);
  }
}
