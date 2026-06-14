import * as readline from 'readline';
import fs from 'fs';
import path from 'path';

export async function runInteractiveSetup(basePath: string): Promise<void> {
  // Use the callback-based interface and wrap it in a promise for better compatibility
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (query: string): Promise<string> => {
    return new Promise((resolve) => rl.question(query, resolve));
  };

  console.log('--- Email Pilots Setup ---');
  console.log('Details entered here will be saved for future use.');

  // Quote/escape so spaces, #, =, and Windows paths survive dotenv parsing.
  const q = (v: string) => '"' + String(v ?? '').replace(/"/g, '\\"').replace(/[\r\n]/g, ' ') + '"';

  const user = await question('Enter your Email: ');
  const pass = await question('Enter your Password (or App Password): ');
  const host = await question('SMTP host (default: smtp.office365.com): ') || 'smtp.office365.com';
  const recipients = await question('Recipient CSV filename (default: recipients.csv): ') || 'recipients.csv';
  const template = await question('Template HTML filename (default: template.html): ') || 'template.html';
  const schedule = await question('Cron Schedule (default: 0 9 * * *): ') || '0 9 * * *';

  // Keys match what the GUI writes (see electron/main.ts save-config) so a
  // CLI-configured app is fully usable from the GUI and vice versa.
  const envContent = `SMTP_HOST=${q(host)}
SMTP_PORT=587
SMTP_USER=${q(user)}
SMTP_PASS=${q(pass)}
RECIPIENTS_CSV_PATH=${q(recipients)}
RECIPIENTS_JSON_PATH=${q('recipients.json')}
TEMPLATE_HTML_PATH=${q(template)}
EMAIL_SUBJECT=${q('Daily Update')}
CRON_SCHEDULE=${q(schedule)}
`;

  fs.writeFileSync(path.join(basePath, '.env'), envContent);
  console.log('\nConfiguration saved to .env file.');
  
  rl.close();
}
