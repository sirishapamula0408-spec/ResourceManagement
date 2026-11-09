import { createHash, randomBytes } from 'node:crypto';
import { config } from '../../config.js';
import { HttpError } from '../../lib/http.js';
import { escapeHtml, sendMail } from '../../lib/mailer.js';
import { prisma } from '../../lib/prisma.js';
import { hashPassword } from './auth.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Where people open the app; invite links point at its /invite page. */
const appUrl = () => (config.PUBLIC_URL ?? config.CORS_ORIGIN).replace(/\/+$/, '');

export const inviteLink = (token: string) => `${appUrl()}/invite/${token}`;

/**
 * Start (or restart) an invitation: a fresh one-time link replaces any earlier one, and the
 * person is emailed. Only for people who haven't set a password yet. Returns when the link expires.
 */
export async function sendInvite(personId: string, invitedBy?: string) {
  const person = await prisma.person.findUnique({ where: { id: personId } });
  if (!person) throw new HttpError(404, 'Person not found');
  if (!person.active) throw new HttpError(400, 'This person has been removed from the team');
  if (person.passwordHash) {
    throw new HttpError(400, 'This person has already set a password. Reset it instead.');
  }

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + config.INVITE_EXPIRES_DAYS * DAY_MS);
  await prisma.person.update({
    where: { id: personId },
    data: { inviteTokenHash: hashToken(token), inviteExpiresAt: expiresAt },
  });

  const link = inviteLink(token);
  const by = invitedBy ? `${invitedBy} has invited you` : 'You have been invited';
  const until = expiresAt.toUTCString();
  await sendMail({
    to: person.email,
    subject: 'You are invited to SedHub',
    text: `Hi ${person.name},\n\n${by} to SedHub.\n\nAccept the invitation and choose your password here:\n${link}\n\nThe link works once and expires on ${until}. After that, ask your administrator to send a new one.\n`,
    html: `<p>Hi ${escapeHtml(person.name)},</p>
<p>${escapeHtml(by)} to SedHub.</p>
<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#0f3bcf;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">Accept invitation</a></p>
<p>Or open this link: <a href="${link}">${link}</a></p>
<p style="color:#666;font-size:13px">The link works once and expires on ${until}. After that, ask your administrator to send a new one.</p>`,
  });
  return { inviteExpiresAt: expiresAt };
}

async function pendingInvite(token: string) {
  const person = await prisma.person.findUnique({ where: { inviteTokenHash: hashToken(token) } });
  if (!person || !person.active || person.passwordHash) {
    throw new HttpError(404, 'This invitation link is not valid or has already been used.', {
      code: 'INVITE_INVALID',
    });
  }
  if (!person.inviteExpiresAt || person.inviteExpiresAt.getTime() < Date.now()) {
    throw new HttpError(
      410,
      'This invitation has expired. Ask your administrator to send a new one.',
      {
        code: 'INVITE_EXPIRED',
      },
    );
  }
  return person;
}

/** What the accept page shows before the person chooses a password. */
export async function describeInvite(token: string) {
  const person = await pendingInvite(token);
  return { name: person.name, email: person.email };
}

/** Accept: set the person's own password and close the invitation. They then sign in as usual. */
export async function acceptInvite(token: string, password: string) {
  const person = await pendingInvite(token);
  await prisma.person.update({
    where: { id: person.id },
    data: {
      passwordHash: await hashPassword(password),
      mustChangePassword: false,
      inviteTokenHash: null,
      inviteExpiresAt: null,
    },
  });
  await prisma.auditLog.create({
    data: {
      actorId: person.id,
      action: 'auth.invite_accepted',
      entityType: 'Person',
      entityId: person.id,
    },
  });
  return { email: person.email };
}
