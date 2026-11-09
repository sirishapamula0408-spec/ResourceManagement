import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config.js';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

let transport: Transporter | undefined;

/** Whether SMTP is set up; without it, emails are logged rather than sent. */
export const mailEnabled = () => Boolean(config.SMTP_HOST);

function transporter() {
  transport ??= nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
  });
  return transport;
}

/**
 * Send an email through the configured SMTP server. With no SMTP_HOST the message is written to
 * the API log instead (handy in development); tests never send or log.
 */
export async function sendMail(mail: Mail) {
  if (config.NODE_ENV === 'test') return;
  if (!mailEnabled()) {
    console.info(
      `[mail] SMTP not configured; not sent.\nTo: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n`,
    );
    return;
  }
  await transporter().sendMail({ from: config.SMTP_FROM, ...mail });
}

/** Escape text for an HTML email body. */
export const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
