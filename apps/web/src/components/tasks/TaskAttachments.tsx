import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type DragEvent, useRef, useState } from 'react';
import {
  api,
  auth,
  downloadFile,
  uploadFile,
  type Attachment,
  type AttachmentList,
} from '../../lib/api';
import { buttonClass, errorMessage } from '../../lib/forms';

/** "512 B", "18 KB", "2.4 MB". */
function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(/\.0$/, '')} MB`;
}

const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** A small document icon with the file's extension, e.g. PDF. */
function FileIcon({ name }: { name: string }) {
  const ext = name.includes('.') ? name.split('.').pop()!.slice(0, 4).toUpperCase() : '';
  return (
    <span
      aria-hidden
      className="relative flex h-8 w-7 shrink-0 items-end justify-center rounded-[3px] border border-line bg-panel2 pb-0.5 text-[8px] font-bold text-muted"
    >
      <span className="absolute top-0 right-0 h-2 w-2 rounded-bl-[2px] border-b border-l border-line bg-panel" />
      {ext}
    </span>
  );
}

/**
 * Files on one task (M4 JIRA-lite): download, delete (the uploader, or a manager), and upload
 * with the button or by dropping files on the section (a manager or the assignee).
 */
export function TaskAttachments({
  taskId,
  canUpload,
  manages,
}: {
  taskId: string;
  /** An admin, a PM on the project or the assignee. */
  canUpload: boolean;
  /** An admin or a PM on the project: may delete anyone's files. */
  manages: boolean;
}) {
  const qc = useQueryClient();
  const me = auth.getUser();
  const input = useRef<HTMLInputElement>(null);
  const queryKey = ['attachments', taskId];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => api<AttachmentList>(`/tasks/${taskId}/attachments`),
  });
  const attachments = data?.attachments ?? [];
  const [uploading, setUploading] = useState<{ name: string; share: number } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);

  const changed = () => {
    qc.invalidateQueries({ queryKey });
    qc.invalidateQueries({ queryKey: ['history', taskId] });
  };
  const remove = useMutation({
    mutationFn: (a: Attachment) => api(`/attachments/${a.id}`, { method: 'DELETE' }),
    onMutate: () => setErrors([]),
    onSuccess: changed,
    onError: (e) => setErrors([errorMessage(e)]),
  });

  /** Upload one after another, so progress reads clearly; each file's problem is listed. */
  const upload = async (files: File[]) => {
    if (!files.length || uploading) return;
    const problems: string[] = [];
    for (const file of files) {
      if (data && file.size > data.maxBytes) {
        problems.push(`${file.name} is too big: files can be up to ${fileSize(data.maxBytes)}.`);
        continue;
      }
      setUploading({ name: file.name, share: 0 });
      try {
        await uploadFile(
          `/tasks/${taskId}/attachments?name=${encodeURIComponent(file.name)}`,
          file,
          (share) => setUploading({ name: file.name, share }),
        );
      } catch (e) {
        const message = errorMessage(e);
        problems.push(message.includes(file.name) ? message : `${file.name}: ${message}`);
      }
    }
    setUploading(null);
    setErrors(problems);
    changed();
  };

  const download = (a: Attachment) =>
    downloadFile(`/attachments/${a.id}`, a.name).catch((e) => setErrors([errorMessage(e)]));

  const dropProps = canUpload
    ? {
        onDragOver: (e: DragEvent) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          setDragging(true);
        },
        onDragLeave: (e: DragEvent) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        },
        onDrop: (e: DragEvent) => {
          e.preventDefault();
          setDragging(false);
          void upload([...e.dataTransfer.files]);
        },
      }
    : {};

  if (!canUpload && !attachments.length && !isLoading) return null;
  return (
    <section
      className={`relative flex flex-col gap-2 rounded-md sm:col-span-2 ${dragging ? 'outline-2 outline-offset-4 outline-teal outline-dashed' : ''}`}
      aria-label="Attachments"
      {...dropProps}
    >
      <div className="flex items-center gap-2">
        <h4 className="text-xs font-medium text-muted">
          Attachments{attachments.length ? ` · ${attachments.length}` : ''}
        </h4>
        <span className="flex-1" />
        {canUpload && (
          <>
            <button
              type="button"
              className={`${buttonClass()} py-0.5 text-xs`}
              disabled={!!uploading}
              onClick={() => input.current?.click()}
            >
              Add file
            </button>
            <input
              ref={input}
              type="file"
              multiple
              className="hidden"
              aria-label="Choose files to attach"
              onChange={(e) => {
                void upload([...(e.target.files ?? [])]);
                e.target.value = '';
              }}
            />
          </>
        )}
      </div>

      {dragging && (
        <p className="rounded-md border border-dashed border-teal bg-teal-soft px-3 py-3 text-center text-sm text-teal">
          Drop files to attach them
        </p>
      )}
      {uploading && (
        <div role="status" className="flex flex-col gap-1 text-xs text-muted">
          <span>
            Uploading {uploading.name}… {Math.round(uploading.share * 100)}%
          </span>
          <span className="h-1.5 overflow-hidden rounded-sm bg-line">
            <i
              className="block h-full bg-teal transition-[width]"
              style={{ width: `${Math.round(uploading.share * 100)}%` }}
            />
          </span>
        </div>
      )}

      {attachments.length > 0 && (
        <ul className="divide-y divide-line rounded-md border border-line" aria-label="Files">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-2.5 px-2.5 py-1.5 text-sm">
              <FileIcon name={a.name} />
              <span className="flex min-w-0 flex-1 flex-col">
                <button
                  type="button"
                  className="truncate text-left font-medium hover:text-teal hover:underline"
                  title={`Download ${a.name}`}
                  onClick={() => download(a)}
                >
                  {a.name}
                </button>
                <span className="truncate text-xs text-muted">
                  {fileSize(a.size)} · {a.uploader?.name ?? 'Former user'} · {when(a.createdAt)}
                </span>
              </span>
              <button
                type="button"
                className="rounded-[3px] px-1.5 py-0.5 text-xs text-muted hover:bg-btn hover:text-ink"
                aria-label={`Download ${a.name}`}
                onClick={() => download(a)}
              >
                Download
              </button>
              {(manages || a.uploader?.id === me?.id) && (
                <button
                  type="button"
                  className="px-1 text-muted hover:text-red"
                  aria-label={`Delete ${a.name}`}
                  disabled={remove.isPending}
                  onClick={() =>
                    window.confirm(`Delete ${a.name}? This can’t be undone.`) && remove.mutate(a)
                  }
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canUpload && !attachments.length && !uploading && !dragging && (
        <p className="text-xs text-muted">
          No files yet. Use Add file or drop files here (up to{' '}
          {data ? fileSize(data.maxBytes) : '10 MB'} each).
        </p>
      )}
      {errors.length > 0 && (
        <ul role="alert" className="flex flex-col gap-0.5 text-xs text-red">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
