import { Router } from 'express';
import { z } from 'zod';
import { Role } from '../../generated/prisma/enums.js';
import { HttpError, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { passwordSchema, STAFFING_ROLES } from '../../lib/permissions.js';
import { visibleProjectIds } from '../../lib/visibility.js';
import { requireRole } from '../../middleware/auth.js';
import * as mfa from '../auth/mfa.service.js';
import * as service from './people.service.js';

const personSchema = z.object({
  name: z.string().trim().min(1),
  email: z
    .email()
    .trim()
    .transform((s) => s.toLowerCase()),
  title: z.string().trim().nullable().optional(),
  role: z.enum(Role).optional(),
  department: z.string().trim().nullable().optional(),
  weeklyCapacityHours: z.number().min(1).max(80).optional(),
  /** Temporary password; the person must change it at first sign-in. */
  password: passwordSchema.optional(),
});

// A new person needs a temporary password so they can sign in.
const createSchema = personSchema.required({ password: true });

const projectsSchema = z.object({ projectIds: z.array(z.string().min(1)) });

export const peopleRouter = Router();

peopleRouter.get('/', async (req, res) => {
  const projectIds = await visibleProjectIds(req.user!);
  res.json(await service.listPeople(projectIds && { personId: req.user!.id, projectIds }));
});

peopleRouter.get('/departments', async (_req, res) => {
  res.json(await service.listDepartments());
});

// Writes: admins, delivery heads and resource managers maintain the team;
// only an admin may grant roles or change an admin.
const canEdit = [requireRole(...STAFFING_ROLES)];

const onlyAdmin = (req: { user?: { role: Role } }, message: string) => {
  if (req.user?.role !== 'ADMIN') throw new HttpError(403, message);
};

peopleRouter.post('/', ...canEdit, async (req, res) => {
  const input = parse(createSchema, req.body);
  if (input.role && input.role !== 'MEMBER')
    onlyAdmin(req, 'Only an admin can give a new person a role other than Team member');
  const person = await service.createPerson(input);
  await audit(req, 'person.create', 'Person', person.id, { after: input });
  res.status(201).json(person);
});

peopleRouter.patch('/:id', ...canEdit, async (req, res) => {
  const input = parse(personSchema.partial(), req.body);
  if (input.role !== undefined) onlyAdmin(req, 'Only an admin can change roles');
  if (req.user?.role !== 'ADMIN' && (await service.isAdmin(String(req.params.id)))) {
    throw new HttpError(403, 'Only an admin can edit an admin');
  }
  const person = await service.updatePerson(String(req.params.id), input);
  // A password reset is recorded without the password itself.
  await audit(req, 'person.update', 'Person', person.id, {
    after: { ...input, ...(input.password ? { passwordReset: true } : {}) },
  });
  res.json(person);
});

peopleRouter.delete('/:id', ...canEdit, async (req, res) => {
  if (req.params.id === req.user?.id) throw new HttpError(400, 'You cannot remove yourself');
  if (await service.isAdmin(String(req.params.id)))
    onlyAdmin(req, 'Only an admin can remove an admin');
  await service.removePerson(String(req.params.id));
  await audit(req, 'person.remove', 'Person', String(req.params.id));
  res.status(204).end();
});

// For someone who lost their phone: they sign in with just their password and set it up again.
peopleRouter.delete('/:id/mfa', requireRole('ADMIN'), async (req, res) => {
  await mfa.reset(String(req.params.id));
  await audit(req, 'person.mfa_reset', 'Person', String(req.params.id));
  res.status(204).end();
});

peopleRouter.put('/:id/projects', ...canEdit, async (req, res) => {
  const { projectIds } = parse(projectsSchema, req.body);
  await service.setPersonProjects(String(req.params.id), projectIds);
  await audit(req, 'person.projects', 'Person', String(req.params.id), { after: { projectIds } });
  res.status(204).end();
});
