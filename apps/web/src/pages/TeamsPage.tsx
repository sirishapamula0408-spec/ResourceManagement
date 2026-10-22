import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '../components/PageHeader';
import { api, type Team } from '../lib/api';

/** TODO(M1): create/edit teams, manage members. */
export function TeamsPage() {
  const { data: teams = [], isLoading } = useQuery({
    queryKey: ['teams'],
    queryFn: () => api<Team[]>('/teams'),
  });

  return (
    <>
      <PageHeader title="Teams" />
      {isLoading && <p className="text-slate-500">Loading...</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {teams.map((team) => (
          <div key={team.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="font-medium">{team.name}</div>
            <div className="text-sm text-slate-500">{team.description}</div>
            <ul className="mt-3 text-sm">
              {team.members.map((m) => (
                <li key={m.person.id}>
                  {m.person.name}{' '}
                  {m.isLead && <span className="text-xs text-indigo-600">(lead)</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}
