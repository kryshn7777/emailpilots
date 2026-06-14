import dotenv from 'dotenv';
import { loadConfig, hasConfig, getBasePath } from './config';
import { EmailService } from './emailService';
import { MailProcessor } from './mailProcessor';
import { Scheduler } from './scheduler';
import { runInteractiveSetup } from './setup';
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
    
    if (!hasConfig()) {
      if (process.env.DOCKER) {
        console.error('Configuration missing. Please provide .env file or environment variables in Docker.');
        process.exit(1);
      }
      console.log('Configuration missing. Starting interactive setup...');
      await runInteractiveSetup(basePath);
      // Reload dotenv from the newly created file
      dotenv.config({ path: `${basePath}/.env`, override: true });
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
