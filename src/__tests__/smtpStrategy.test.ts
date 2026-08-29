import { describe, it, expect } from 'vitest';
import { SmtpStrategy } from '../transport/smtpStrategy';
import type { Config } from '../config';

function cfg(port: number): Config {
  return { smtp: { host: 'smtp.example.com', port, user: 'a@example.com', pass: 'x' } } as unknown as Config;
}
/** nodemailer keeps the options a transporter was created with on `.options`. */
function options(port: number): any {
  return (new SmtpStrategy(cfg(port)) as any).transporter.options;
}

// Deliverability audit DLV-5: on the submission port nodemailer's default is
// OPPORTUNISTIC STARTTLS — if a server (or a downgrade attack stripping STARTTLS
// from EHLO) offers no TLS, the app password goes over the wire in plaintext.
// Every provider the app targets on 587 supports STARTTLS, so requiring it there
// costs nothing; other ports keep the old behavior (local bridges, port 25 relays).
describe('SmtpStrategy transport options (DLV-5)', () => {
  it('587 (submission) requires STARTTLS — a plaintext downgrade is refused', () => {
    expect(options(587)).toMatchObject({ secure: false, requireTLS: true });
  });

  it('465 is implicit TLS (secure); requireTLS is moot and stays off', () => {
    expect(options(465)).toMatchObject({ secure: true });
    expect(options(465).requireTLS).toBeFalsy();
  });

  it('other ports keep opportunistic STARTTLS (non-breaking for 25 / 2525 / local bridges)', () => {
    expect(options(2525).requireTLS).toBeFalsy();
    expect(options(25).requireTLS).toBeFalsy();
  });
});
