import { type Request, Router } from 'express';
import { z } from 'zod';
import { LeaveType } from '../../generated/prisma/enums.js';
import { HttpError, parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { STAFFING_ROLES } from '../../lib/permissions.js';
import { isMember } from '../../lib/visibility.js';
import * as service from './leave.service.js';

const day = z.iso.date().transform((s) => new Date(`${s}T00:00:00Z`));

const leaveSchema = z.object({
  personId: z.string().min(1),
  startDate: day,
  endDate: day,
  type: z.enum(LeaveType).default('VACATION'),
  note: z.string().trim().max(200).nullable().optional(),
});

const MAX_DAYS = 366;
function checkDates(start?: Date, end?: Date) {
  if (!start || !end) return;
  if (end < start) throw new HttpError(400, 'The last day can’t be before the first day');
  if ((end.getTime() - start.getTime()) / 86_400_000 >= MAX_DAYS)
    throw new HttpError(400, 'Record leave of up to a year at a time');
}

const listQuery = z.object({
  personId: z.string().min(1).optional(),
  from: day.optional(),
  to: day.optional(),
});

/** Staffing roles record anyone's leave; everyone else only their own. */
function requireCanEdit(req: Request, personId: string) {
  if (STAFFING_ROLES.includes(req.user!.role) || personId === req.user!.id) return;
  throw new HttpError(403, 'You can only record your own leave');
}

export const leaveRouter = Router();

leaveRouter.get('/', async (req, res) => {
  const q = parse(listQuery, req.query);
  res.json(
    await service.listLeave({ ...q, personId: isMember(req.user) ? req.user!.id : q.personId }),
  );
});

leaveRouter.post('/', async (req, res) => {
  const input = parse(leaveSchema, req.body);
  requireCanEdit(req, input.personId);
  checkDates(input.startDate, input.endDate);
  const leave = await service.createLeave(input);
  await audit(req, 'leave.create', 'Leave', leave.id, { after: input });
  res.status(201).json(leave);
});

leaveRouter.patch('/:id', async (req, res) => {
  const input = parse(leaveSchema.omit({ personId: true }).partial(), req.body);
  const existing = await service.findLeave(String(req.params.id));
  requireCanEdit(req, existing.personId);
  checkDates(input.startDate ?? existing.startDate, input.endDate ?? existing.endDate);
  const leave = await service.updateLeave(existing.id, input);
  await audit(req, 'leave.update', 'Leave', existing.id, { before: existing, after: input });
  res.json(leave);
});

leaveRouter.delete('/:id', async (req, res) => {
  const existing = await service.findLeave(String(req.params.id));
  requireCanEdit(req, existing.personId);
  await service.deleteLeave(existing.id);
  await audit(req, 'leave.delete', 'Leave', existing.id, { before: existing });
  res.status(204).end();
});
