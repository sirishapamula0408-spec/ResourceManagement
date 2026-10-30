import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthCard } from '../components/AuthCard';
import { api, auth, ROLE_LABEL, type Role } from '../lib/api';
import { buttonClass, errorMessage } from '../lib/forms';

/**
 * Consent for the Claude connector: Claude sends people here (via the API's /authorize) to sign
 * in and approve access. Approving sends them back to Claude, which then acts as them.
 */
export function ConnectPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const request = params.get('request') ?? '';

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ name: string; email: string; role: Role }>('/auth/me'),
  });
  const details = useQuery({
    queryKey: ['oauth-request', request],
    queryFn: () =>
      api<{ clientName: string; redirectHost: string }>(
        `/oauth/request?request=${encodeURIComponent(request)}`,
      ),
    enabled: !!request,
    retry: false,
  });

  const answer = useMutation({
    mutationFn: (choice: 'approve' | 'deny') =>
      api<{ redirect: string }>(`/oauth/${choice}`, {
        method: 'POST',
        body: JSON.stringify({ request }),
      }),
    onSuccess: ({ redirect }) => window.location.assign(redirect),
  });

  function switchAccount() {
    auth.clear();
    navigate(`/login?next=${encodeURIComponent(`/connect?request=${request}`)}`, { replace: true });
  }

  if (!request || details.error) {
    return (
      <AuthCard title="Connection request not valid">
        <p role="alert" className="rounded-md bg-red-soft px-3 py-2 text-red">
          {details.error ? errorMessage(details.error) : 'This link is incomplete.'}
        </p>
      </AuthCard>
    );
  }

  const client = details.data?.clientName ?? '…';
  return (
    <AuthCard
      title={`Connect ${client}`}
      intro={
        <>
          <strong>{client}</strong> ({details.data?.redirectHost ?? '…'}) wants to use Resource
          Board as you. It will see and change exactly what you can in the app, nothing more.
        </>
      }
    >
      {me && (
        <p className="mb-4 rounded-md border border-line px-3 py-2">
          Signed in as <strong>{me.name}</strong> ({me.email}), {ROLE_LABEL[me.role]}.{' '}
          <button type="button" className="text-teal underline" onClick={switchAccount}>
            Not you?
          </button>
        </p>
      )}
      {answer.error && (
        <p role="alert" className="mb-3 rounded-md bg-red-soft px-3 py-2 text-red">
          {errorMessage(answer.error)}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          className={`${buttonClass('primary')} flex-1`}
          disabled={!details.data || answer.isPending}
          onClick={() => answer.mutate('approve')}
        >
          Allow
        </button>
        <button
          type="button"
          className={`${buttonClass()} flex-1`}
          disabled={!details.data || answer.isPending}
          onClick={() => answer.mutate('deny')}
        >
          Deny
        </button>
      </div>
      <p className="mt-4 text-muted">
        You can disconnect at any time from Claude’s connector settings.
      </p>
    </AuthCard>
  );
}
