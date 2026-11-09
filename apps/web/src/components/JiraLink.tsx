import { useQuery } from '@tanstack/react-query';
import { api, type JiraStatus } from '../lib/api';

/**
 * The JIRA issue a task syncs with, as a chip that opens it in JIRA (plain text for people who
 * can't see the JIRA settings, or when JIRA isn't connected).
 */
export function JiraLink({ issueKey }: { issueKey: string }) {
  const { data } = useQuery({
    queryKey: ['jira', 'status'],
    queryFn: () => api<JiraStatus>('/jira/status'),
    retry: false,
  });
  const chip =
    'ml-2 rounded-[3px] border border-line px-1.5 py-px text-[11px] font-semibold text-muted';
  return data?.baseUrl ? (
    <a
      className={`${chip} hover:text-teal`}
      href={`${data.baseUrl.replace(/\/$/, '')}/browse/${issueKey}`}
      target="_blank"
      rel="noreferrer"
      title="Open in JIRA"
    >
      JIRA {issueKey}
    </a>
  ) : (
    <span className={chip} title="Synced with this JIRA issue">
      JIRA {issueKey}
    </span>
  );
}
