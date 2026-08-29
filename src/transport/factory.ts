import type { Config } from '../config';
import type { SendStrategy, StrategyDeps } from './sendStrategy';
import { SmtpStrategy } from './smtpStrategy';
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
 */
export function makeStrategy(config: Config, deps?: StrategyDeps): SendStrategy {
  const transport = config.account?.transport ?? 'smtp';
  switch (transport) {
    case 'smtp':
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
