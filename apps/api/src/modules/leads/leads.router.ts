import { Router } from 'express';
import { z } from 'zod';
import { LeadPriority, LeadSource, LeadStage } from '../../generated/prisma/enums.js';
import { parse } from '../../lib/http.js';
import { LEAD_EDIT_ROLES, LEAD_VIEW_ROLES } from '../../lib/permissions.js';
import { requireRole } from '../../middleware/auth.js';
import * as service from './leads.service.js';

const optionalText = z.string().trim().max(2000).nullable().optional();
const optionalDate = z.coerce.date().nullable().optional();

const leadFields = z.object({
  company: z.string().trim().min(1, 'Add the company name').max(200),
  contactName: z.string().trim().min(1, 'Add a contact name').max(200),
  contactEmail: z
    .union([z.email(), z.literal('')])
    .transform((s) => s || null)
    .nullable()
    .optional(),
  contactPhone: z.string().trim().max(40).nullable().optional(),
  source: z.enum(LeadSource).optional(),
  stage: z.enum(LeadStage).optional(),
  priority: z.enum(LeadPriority).optional(),
  estimatedValue: z.number().min(0).max(1e12).nullable().optional(),
  expectedCloseDate: optionalDate,
  nextFollowUp: optionalDate,
  notes: optionalText,
  lostReason: optionalText,
  ownerId: z.string().min(1).nullable().optional(),
});

export const leadsRouter = Router();

const canView = requireRole(...LEAD_VIEW_ROLES);
const canEdit = requireRole(...LEAD_EDIT_ROLES);

leadsRouter.get('/', canView, async (_req, res) => {
  res.json(await service.listLeads());
});

leadsRouter.get('/owners', canView, async (_req, res) => {
  res.json(await service.listLeadOwners());
});

leadsRouter.post('/', canEdit, async (req, res) => {
  res.status(201).json(await service.createLead(parse(leadFields, req.body), req.user!.id));
});

leadsRouter.patch('/:id', canEdit, async (req, res) => {
  res.json(await service.updateLead(String(req.params.id), parse(leadFields.partial(), req.body)));
});

leadsRouter.delete('/:id', canEdit, async (req, res) => {
  await service.deleteLead(String(req.params.id));
  res.status(204).end();
});
