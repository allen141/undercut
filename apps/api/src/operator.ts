import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { createAuth, origin, tokenHash } from './auth.js';
import { db, pool } from './db.js';
import { invitations } from './schema.js';

const emailSchema = z.string().trim().toLowerCase().pipe(z.email());
const invitationLifetime = 72 * 60 * 60 * 1000;

try {
  const [command, input] = process.argv.slice(2);
  if (command !== 'invite' && command !== 'reset') {
    throw new Error('Usage: pnpm operator invite|reset email@example.com');
  }
  const email = emailSchema.parse(input);

  if (command === 'invite') {
    const token = randomBytes(32).toString('base64url');
    await db.insert(invitations).values({
      tokenHash: tokenHash(token),
      email,
      expiresAt: new Date(Date.now() + invitationLifetime),
    });
    const link = new URL('/invite', origin);
    link.hash = new URLSearchParams({ token, email }).toString();
    console.log(link.href);
  } else {
    let link = '';
    const operatorAuth = createAuth(db, { emitResetLink: (value) => { link = value; } });
    await operatorAuth.api.requestPasswordReset({ body: { email, redirectTo: `${origin}/reset` } });
    if (!link) throw new Error('No account was found for that email.');
    console.log(link);
  }
} finally {
  await pool.end();
}
