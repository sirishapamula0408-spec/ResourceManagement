import { prisma } from '../../lib/prisma.js';
import type { LeadPriority, LeadSource, LeadStage } from '../../generated/prisma/enums.js';

const person = { select: { id: true, name: true } } as const;

export function listLeads() {
  return prisma.lead.findMany({
    orderBy: [{ updatedAt: 'desc' }],
    include: { owner: person, createdBy: person },
  });
}

/** People a lead can be assigned to: active sales users (and admins). */
export function listLeadOwners() {
  return prisma.person.findMany({
    where: { active: true, role: { in: ['SALES', 'ADMIN'] } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, role: true },
  });
}

export interface LeadInput {
  company: string;
  contactName: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  source?: LeadSource;
  stage?: LeadStage;
  priority?: LeadPriority;
  estimatedValue?: number | null;
  expectedCloseDate?: Date | null;
  nextFollowUp?: Date | null;
  notes?: string | null;
  lostReason?: string | null;
  ownerId?: string | null;
}

export function createLead(input: LeadInput, createdById: string) {
  return prisma.lead.create({
    data: { ownerId: createdById, ...input, createdById },
    include: { owner: person, createdBy: person },
  });
}

export function updateLead(id: string, input: Partial<LeadInput>) {
  // A lost reason only makes sense on a lost lead.
  const data = input.stage && input.stage !== 'LOST' ? { ...input, lostReason: null } : input;
  return prisma.lead.update({ where: { id }, data, include: { owner: person, createdBy: person } });
}

export async function deleteLead(id: string) {
  await prisma.lead.delete({ where: { id } });
}
