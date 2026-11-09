import { config } from '../../config.js';
import { jiraFromConfig } from './jira.client.js';
import { syncAll } from './jira.sync.js';

/**
 * Sync every linked project every JIRA_SYNC_MINUTES (single API instance; several instances
 * would each sync, which the per-project lock doesn't prevent across processes).
 */
export function startJiraScheduler() {
  const client = jiraFromConfig();
  if (!client || config.JIRA_SYNC_MINUTES === 0) return null;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      await syncAll(client);
    } catch (err) {
      console.error('JIRA sync failed:', err);
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void tick(), config.JIRA_SYNC_MINUTES * 60_000);
  timer.unref();
  console.log(`JIRA sync every ${config.JIRA_SYNC_MINUTES} min with ${config.JIRA_BASE_URL}`);
  return timer;
}
