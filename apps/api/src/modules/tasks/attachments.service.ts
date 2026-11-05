import path from 'node:path';
import { config } from '../../config.js';
import { HttpError } from '../../lib/http.js';
import { requireNotViewer } from '../../lib/permissions.js';
import { prisma } from '../../lib/prisma.js';
import { openFile, removeFiles, saveFile } from '../../lib/storage.js';
import type { AuthUser } from '../../middleware/auth.js';
import { requireSeeTask } from './comments.service.js';
import { record } from './history.service.js';
import { canManageProject } from './tasks.service.js';

/**
 * Files attached to a task (M4 JIRA-lite). Anyone who can see the task lists and downloads its
 * files; an admin, a PM on the project or the task's assignee uploads (as for links); the uploader
 * or an admin / PM on the project deletes. Viewers only list and download. Files are kept on local disk (lib/storage.ts).
 */
export const maxUploadBytes = () => Math.round(config.MAX_UPLOAD_MB * 1024 * 1024);

/**
 * Programs and scripts, and types a browser would run as a page (HTML, SVG). Downloads are
 * always sent as attachments with nosniff anyway, so this is a second line of defence.
 */
// prettier-ignore
const BLOCKED_EXTENSIONS = new Set([
  'exe', 'msi', 'com', 'scr', 'pif', 'cpl', 'dll', 'bat', 'cmd', 'ps1', 'psm1', 'vbs', 'vbe',
  'wsf', 'wsh', 'hta', 'jar', 'sh', 'bash', 'zsh', 'csh', 'app', 'apk', 'js', 'mjs', 'cjs', 'jse',
  'php', 'py', 'pl', 'rb', 'html', 'htm', 'xhtml', 'shtml', 'svg', 'svgz', 'xsl', 'swf',
  'lnk', 'reg', 'iso', 'dmg',
]);

const BLOCKED_TYPES = [
  /^text\/html$/,
  /^application\/xhtml\+xml$/,
  /^image\/svg\+xml$/,
  /^(application|text)\/(x-)?(java|ecma)script$/,
  /^application\/x-(msdownload|msdos-program|ms-installer|sh|csh|bat|executable|httpd-php)$/,
  /^application\/vnd\.microsoft\.portable-executable$/,
];

/** A file name as shown and downloaded: no folders, control characters or reserved characters. */
export function cleanName(raw: string) {
  const name = path
    .basename(raw.replace(/\\/g, '/'))
    // eslint-disable-next-line no-control-regex -- removing control characters is the point
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '_')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 200);
  return name || 'file';
}

/** The declared content type without parameters, or a generic one if it isn't a valid type. */
const cleanType = (raw: string | undefined) => {
  const type = (raw ?? '').split(';')[0].trim().toLowerCase();
  return /^[a-z0-9][\w.+-]*\/[\w.+-]+$/.test(type) ? type : 'application/octet-stream';
};

export function isBlocked(name: string, mimeType: string) {
  const ext = path.extname(name).slice(1).toLowerCase();
  return BLOCKED_EXTENSIONS.has(ext) || BLOCKED_TYPES.some((re) => re.test(mimeType));
}

const view = {
  id: true,
  taskId: true,
  name: true,
  mimeType: true,
  size: true,
  createdAt: true,
  uploader: { select: { id: true, name: true } },
} as const;

export async function listAttachments(user: AuthUser, taskId: string) {
  await requireSeeTask(user, taskId);
  const attachments = await prisma.attachment.findMany({
    where: { taskId },
    orderBy: { createdAt: 'desc' },
    select: view,
  });
  return { attachments, maxBytes: maxUploadBytes() };
}

export async function addAttachment(
  user: AuthUser,
  taskId: string,
  file: { name: string; mimeType?: string; bytes: Buffer },
) {
  requireNotViewer(user);
  await requireSeeTask(user, taskId);
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { projectId: true, assigneeId: true },
  });
  if (task.assigneeId !== user.id && !(await canManageProject(user, task.projectId))) {
    throw new HttpError(403, 'Only an admin, a PM on this project or the assignee can add files');
  }
  const name = cleanName(file.name);
  const mimeType = cleanType(file.mimeType);
  if (!file.bytes.length) throw new HttpError(400, 'The file is empty');
  if (isBlocked(name, mimeType)) {
    throw new HttpError(415, `${name}: programs, scripts and web pages can’t be attached`);
  }

  const storageKey = await saveFile(file.bytes);
  try {
    const created = await prisma.attachment.create({
      data: { taskId, uploaderId: user.id, name, mimeType, size: file.bytes.length, storageKey },
      select: view,
    });
    await record(user.id, taskId, 'task.attach', null, { attachment: name });
    return created;
  } catch (e) {
    await removeFiles([storageKey]); // e.g. the task was deleted meanwhile
    throw e;
  }
}

/** An attachment the user may see (its task visible to them), else 404. */
async function getAttachment(user: AuthUser, id: string) {
  const attachment = await prisma.attachment.findUnique({
    where: { id },
    include: { task: { select: { projectId: true } } },
  });
  if (!attachment) throw new HttpError(404, 'Attachment not found');
  await requireSeeTask(user, attachment.taskId).catch(() => {
    throw new HttpError(404, 'Attachment not found');
  });
  return attachment;
}

export async function downloadAttachment(user: AuthUser, id: string) {
  const attachment = await getAttachment(user, id);
  return { attachment, stream: openFile(attachment.storageKey) };
}

export async function deleteAttachment(user: AuthUser, id: string) {
  requireNotViewer(user);
  const attachment = await getAttachment(user, id);
  if (
    attachment.uploaderId !== user.id &&
    !(await canManageProject(user, attachment.task.projectId))
  ) {
    throw new HttpError(403, 'Only the uploader, an admin or a PM on this project can delete it');
  }
  await prisma.attachment.delete({ where: { id } });
  await removeFiles([attachment.storageKey]);
  await record(user.id, attachment.taskId, 'task.detach', { attachment: attachment.name }, null);
}

/** Storage keys of the files on some tasks, read before the tasks are deleted. */
export async function storageKeysOf(taskIds: string[]) {
  const rows = await prisma.attachment.findMany({
    where: { taskId: { in: taskIds } },
    select: { storageKey: true },
  });
  return rows.map((r) => r.storageKey);
}
