import { HttpError } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';

const include = {
  members: {
    // Removed (deactivated) people no longer appear in team groups.
    where: { person: { active: true } },
    orderBy: [{ isLead: 'desc' as const }, { person: { name: 'asc' as const } }],
    include: { person: { select: { id: true, name: true, email: true, role: true } } },
  },
};

/** All teams, or only the teams `personId` belongs to (a team member's view). */
export function listTeams(personId?: string) {
  return prisma.team.findMany({
    where: personId ? { members: { some: { personId } } } : undefined,
    orderBy: { name: 'asc' },
    include,
  });
}

export interface MemberInput {
  personId: string;
  isLead: boolean;
}

export interface TeamInput {
  name: string;
  description?: string | null;
  /** The full membership; people left out are removed from the team. */
  members?: MemberInput[];
}

/** Team names are unique; say so rather than the generic conflict message. */
const nameTaken = (err: unknown): never => {
  if ((err as { code?: unknown } | null)?.code === 'P2002')
    throw new HttpError(409, 'A team with that name already exists');
  throw err;
};

/** Members must be distinct, active people. */
async function checkMembers(members: MemberInput[]) {
  const ids = members.map((m) => m.personId);
  if (new Set(ids).size !== ids.length) throw new HttpError(400, 'A person is listed twice');
  const found = await prisma.person.count({ where: { id: { in: ids }, active: true } });
  if (found !== ids.length) throw new HttpError(400, 'Unknown or removed person in members');
}

export async function createTeam({ members = [], ...data }: TeamInput) {
  await checkMembers(members);
  return prisma.team
    .create({ data: { ...data, members: { create: members } }, include })
    .catch(nameTaken);
}

export async function updateTeam(id: string, { members, ...data }: Partial<TeamInput>) {
  if (members) await checkMembers(members);
  return prisma
    .$transaction(async (tx) => {
      await tx.team.update({ where: { id }, data });
      if (members) {
        // Keep existing rows (and their joined date); add new people; drop the rest.
        await tx.teamMember.deleteMany({
          where: { teamId: id, personId: { notIn: members.map((m) => m.personId) } },
        });
        for (const m of members) {
          await tx.teamMember.upsert({
            where: { teamId_personId: { teamId: id, personId: m.personId } },
            create: { teamId: id, ...m },
            update: { isLead: m.isLead },
          });
        }
      }
      return tx.team.findUniqueOrThrow({ where: { id }, include });
    })
    .catch(nameTaken);
}

export async function deleteTeam(id: string) {
  await prisma.team.delete({ where: { id } });
}
