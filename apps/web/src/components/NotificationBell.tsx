import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type AppNotification, type NotificationList } from '../lib/api';

/** "just now", "5 min ago", "3 h ago", "2 d ago", then the date. */
function timeAgo(iso: string, now = Date.now()) {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h ago`;
  if (minutes < 7 * 24 * 60) return `${Math.floor(minutes / 60 / 24)} d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M10 20.5a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

/**
 * The bell in the top bar (M4 JIRA-lite): unread count, refreshed every 30 seconds and when the
 * window regains focus; opens a panel of recent notifications. Opening one marks it read and goes
 * to its task.
 */
export function NotificationBell() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<NotificationList>('/notifications'),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const items = data?.items ?? [];
  const unread = data?.unreadCount ?? 0;

  const changed = (res: { unreadCount: number }, readIds: string[] | 'all') =>
    qc.setQueryData<NotificationList>(['notifications'], (old) =>
      old
        ? {
            unreadCount: res.unreadCount,
            items: old.items.map((n) =>
              !n.readAt && (readIds === 'all' || readIds.includes(n.id))
                ? { ...n, readAt: new Date().toISOString() }
                : n,
            ),
          }
        : old,
    );
  const markRead = useMutation({
    mutationFn: (id: string) =>
      api<{ unreadCount: number }>(`/notifications/${id}/read`, { method: 'POST' }),
    onSuccess: (res, id) => changed(res, [id]),
  });
  const markAll = useMutation({
    mutationFn: () => api<{ unreadCount: number }>('/notifications/read-all', { method: 'POST' }),
    onSuccess: (res) => changed(res, 'all'),
  });

  // Escape and a click outside close the panel; focus goes back to the bell.
  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const close = (refocus: boolean) => {
      setOpen(false);
      if (refocus) button.current?.focus();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close(true);
    const onPointer = (e: PointerEvent) =>
      !wrapper.current?.contains(e.target as Node) && close(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  const openOne = (n: AppNotification) => {
    if (!n.readAt) markRead.mutate(n.id);
    setOpen(false);
    navigate(`/browse/${n.task.key}`);
  };

  return (
    <div ref={wrapper} className="relative">
      <button
        ref={button}
        type="button"
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-btn-ink hover:bg-btn"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <BellIcon />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 min-w-[18px] rounded-full border-2 border-panel bg-red px-1 text-center text-[10px] leading-[14px] font-bold text-white"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div
          ref={panel}
          role="dialog"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="absolute top-11 right-0 z-30 flex max-h-[70vh] w-[380px] max-w-[calc(100vw-32px)] flex-col rounded-lg border border-line bg-panel shadow-[0_8px_24px_rgba(9,30,66,0.18)] focus:outline-none"
        >
          <div className="flex items-center gap-2 border-b border-line px-3.5 py-2.5">
            <h2 id={titleId} className="flex-1 font-semibold">
              Notifications
            </h2>
            <button
              type="button"
              className="text-xs font-medium text-teal hover:underline disabled:text-muted disabled:no-underline"
              disabled={!unread || markAll.isPending}
              onClick={() => markAll.mutate()}
            >
              Mark all as read
            </button>
          </div>
          {items.length ? (
            <ul className="overflow-y-auto" aria-label="Recent notifications">
              {items.map((n) => (
                <li key={n.id} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    className={`flex w-full gap-2.5 px-3.5 py-2.5 text-left hover:bg-panel2 ${n.readAt ? '' : 'bg-teal-soft'}`}
                    onClick={() => openOne(n)}
                  >
                    <span
                      aria-hidden
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? '' : 'bg-teal'}`}
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
                      <span>
                        <b className="font-semibold">{n.actor?.name ?? 'Someone'}</b> {n.message}
                      </span>
                      <span className="truncate text-xs text-muted">
                        <span className="font-semibold">{n.task.key}</span> · {n.task.title}
                      </span>
                      <span className="text-xs text-muted">
                        {timeAgo(n.createdAt)}
                        {!n.readAt && <span className="sr-only"> · unread</span>}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3.5 py-6 text-center text-sm text-muted">
              No notifications yet. You’ll hear here when someone assigns you a task, comments on
              your tasks or changes their status.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
