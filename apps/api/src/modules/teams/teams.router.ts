import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { STAFFING_ROLES } from '../../lib/permissions.js';
import { isMember } from '../../lib/visibility.js';
import { requireRole } from '../../middleware/auth.js';
import * as service from './teams.service.js';

const teamSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).nullable().optional(),
  members: z
    .array(z.object({ personId: z.string().min(1), isLead: z.boolean().default(false) }))
    .max(200)
    .optional(),
});

export const teamsRouter = Router();

teamsRouter.get('/', async (req, res) => {
  res.json(await service.listTeams(isMember(req.user) ? req.user!.id : undefined));
});

// Writes: the same people who maintain the team list (admins, delivery heads, resource managers).
const canEdit = [requireRole(...STAFFING_ROLES)];

teamsRouter.post('/', ...canEdit, async (req, res) => {
  const input = parse(teamSchema, req.body);
  const team = await service.createTeam(input);
  await audit(req, 'team.create', 'Team', team.id, { after: input });
  res.status(201).json(team);
});

teamsRouter.patch('/:id', ...canEdit, async (req, res) => {
  const input = parse(teamSchema.partial(), req.body);
  const team = await service.updateTeam(String(req.params.id), input);
  await audit(req, 'team.update', 'Team', team.id, { after: input });
  res.json(team);
});

teamsRouter.delete('/:id', ...canEdit, async (req, res) => {
  await service.deleteTeam(String(req.params.id));
  await audit(req, 'team.delete', 'Team', String(req.params.id));
  res.status(204).end();
});
