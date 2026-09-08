import type { Config } from '../config';
import type { SendStrategy, StrategyDeps } from './sendStrategy';
import { SmtpStrategy } from './smtpStrategy';
import { OAuthSmtpStrategy } from './oauthSmtpStrategy';
import { GraphStrategy } from './graphStrategy';

/**
 * Pick the send transport for a per-account Config slice. Reads
 * `config.account.transport`; an absent value means classic SMTP, so existing
 * single-account installs (and any caller that builds a bare `{ smtp }` config)
 * keep working unchanged.
 *
 * Electron-only transports are not imported here (this module is shared with the
 * pure-Node CLI). The main process supplies them via `deps`:
 *  - 'browser' needs `deps.createBrowserStrategy`
 *  - 'graph'   needs `deps.getGraphAccessToken`
 *  - 'smtp' + oauthProvider 'google' needs `deps.getGoogleAccessToken`
 */
export function makeStrategy(config: Config, deps?: StrategyDeps): SendStrategy {
  const transport = config.account?.transport ?? 'smtp';
  switch (transport) {
    case 'smtp':
      // A Gmail account connected with "Sign in with Google" is still plain SMTP
      // on the wire; only AUTH differs (XOAUTH2 bearer instead of a password).
      if (config.account?.oauthProvider === 'google') {
        if (!deps?.getGoogleAccessToken) {
          throw new Error('Google OAuth SMTP requires a Google token getter (Electron only).');
        }
        return new OAuthSmtpStrategy(config, config.account, deps.getGoogleAccessToken);
      }
      return new SmtpStrategy(config);

    case 'browser':
      if (!deps?.createBrowserStrategy) {
        throw new Error('browser transport requires Electron (no browser strategy provided).');
      }
      return deps.createBrowserStrategy(config, config.account!);

    case 'graph':
      if (!deps?.getGraphAccessToken) {
        throw new Error('graph transport requires a Graph token getter (Electron only).');
      }
      return new GraphStrategy(config, config.account!, deps.getGraphAccessToken);

    default:
      throw new Error(`Unknown transport: ${transport}`);
  }
}
