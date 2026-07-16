// No dotenv import: it existed only to reload .env after the interactive setup wrote
// it. config.ts loads .env at import time, which is what populates process.env for
// hasConfig() below.
import { loadConfig, hasConfig, getBasePath } from './config';
import { EmailService } from './emailService';
import { MailProcessor } from './mailProcessor';
import { Scheduler } from './scheduler';
import readline from 'readline';

async function waitExit() {
  if (process.env.DOCKER) return; // Skip in headless mode
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  await new Promise(resolve => rl.question('\nPress Enter to exit...', () => {
    rl.close();
    resolve(null);
  }));
}

async function main() {
  try {
    const basePath = getBasePath();
    console.log('Base path:', basePath);
    
    // No interactive setup any more. It prompted for a password and wrote it to .env
    // in plaintext — it could not do otherwise, since encryption goes through
    // Electron's safeStorage and this is a pure-Node process. The app must never write
    // a secret it cannot protect, so configuring an account is now the desktop app's
    // job alone; it encrypts the password before it touches disk.
    //
    // This costs nothing that worked: the CLI only ever self-configured INTO that
    // insecure state, and it already could not read a GUI-written password (an `ENC:`
    // value outside Electron has nothing to decrypt it with). Supplying credentials
    // yourself still works — env vars (the Docker path) or a hand-written .env are a
    // developer's own choice about their own machine, which is a different thing from
    // the app making it for them.
    if (!hasConfig()) {
      console.error('No email account is configured.');
      console.error('Open the Email Pilots desktop app and sign in — it stores your password encrypted.');
      console.error('For headless/Docker use, supply SMTP_USER and SMTP_PASS as environment variables.');
      process.exit(1);
    }

    const config = loadConfig();
    const emailService = new EmailService(config);
    const mailProcessor = new MailProcessor(config, emailService);
    const scheduler = new Scheduler(config, mailProcessor);

    if (process.argv.includes('--test')) {
      console.log('Running immediate test send...');
      await mailProcessor.processEmails();
    }

    scheduler.start();
  } catch (error: any) {
    console.error('\n!!! APPLICATION ERROR !!!');
    console.error(error.stack || error.message);
    await waitExit();
    process.exit(1);
  }
}

// Global error handlers
process.on('uncaughtException', async (error) => {
  console.error('\n!!! UNCAUGHT EXCEPTION !!!');
  console.error(error.stack || error.message);
  await waitExit();
  process.exit(1);
});

process.on('unhandledRejection', async (reason) => {
  console.error('\n!!! UNHANDLED REJECTION !!!');
  console.error(reason);
  await waitExit();
  process.exit(1);
});

main();
