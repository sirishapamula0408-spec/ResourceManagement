import { Router } from 'express';
import { z } from 'zod';
import { HttpError, parse } from '../../lib/http.js';
import { prisma } from '../../lib/prisma.js';

/**
 * Saved filters (M4 JIRA-lite): each person's named Board / Tasks filters, kept as the page's
 * query string. A filter belongs to one project's space, or to the main pages (no project).
 * Everyone sees and changes only their own.
 */
export const filtersRouter = Router();

const listQuery = z.object({ projectId: z.string().optional() });
const createBody = z.object({
  name: z.string().trim().min(1, 'Name the filter').max(60),
  projectId: z.string().min(1).nullable().optional(),
  // Only the filter keys the pages use, e.g. "sprint=...&label=ui".
  query: z
    .string()
    .max(1000)
    .refine(
      (q) =>
        [...new URLSearchParams(q).keys()].every((k) =>
          ['project', 'assignee', 'sprint', 'epic', 'label', 'q'].includes(k),
        ),
      'Not a task filter',
    ),
});

filtersRouter.get('/', async (req, res) => {
  const { projectId } = parse(listQuery, req.query);
  res.json(
    await prisma.savedFilter.findMany({
      where: { personId: req.user!.id, projectId: projectId ?? null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, projectId: true, query: true },
    }),
  );
});

filtersRouter.post('/', async (req, res) => {
  const { name, projectId = null, query } = parse(createBody, req.body);
  // Unique per person and place (nulls are distinct in the database index, so check here).
  const taken = await prisma.savedFilter.findFirst({
    where: { personId: req.user!.id, projectId, name: { equals: name, mode: 'insensitive' } },
    select: { id: true },
  });
  if (taken) throw new HttpError(409, `You already have a filter called “${name}”`);
  const saved = await prisma.savedFilter.create({
    data: { personId: req.user!.id, projectId, name, query },
    select: { id: true, name: true, projectId: true, query: true },
  });
  res.status(201).json(saved);
});

filtersRouter.delete('/:id', async (req, res) => {
  const { count } = await prisma.savedFilter.deleteMany({
    where: { id: String(req.params.id), personId: req.user!.id },
  });
  if (!count) throw new HttpError(404, 'Filter not found');
  res.status(204).end();
});
