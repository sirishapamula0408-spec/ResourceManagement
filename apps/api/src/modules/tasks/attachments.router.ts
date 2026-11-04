import { Router } from 'express';
import { HttpError } from '../../lib/http.js';
import * as service from './attachments.service.js';

/** One attachment (M4 JIRA-lite): download it, or delete it. Listing and upload are per task. */
export const attachmentsRouter = Router();

/**
 * Always a download, never shown inline from our origin: `Content-Disposition: attachment`,
 * nosniff, and a sandboxing content security policy in case a browser renders it anyway.
 */
attachmentsRouter.get('/:id', async (req, res, next) => {
  const { attachment, stream } = await service.downloadAttachment(req.user!, String(req.params.id));
  stream.once('error', (e) => {
    if (res.headersSent) return res.destroy(e);
    console.error(`Attachment ${attachment.id}: file ${attachment.storageKey} unreadable`, e);
    next(new HttpError(404, 'The file is no longer available'));
  });
  stream.once('open', () => {
    res.attachment(attachment.name);
    res.set({
      'Content-Type': attachment.mimeType,
      'Content-Length': String(attachment.size),
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'private, no-store',
    });
    stream.pipe(res);
  });
});

attachmentsRouter.delete('/:id', async (req, res) => {
  await service.deleteAttachment(req.user!, String(req.params.id));
  res.status(204).end();
});
