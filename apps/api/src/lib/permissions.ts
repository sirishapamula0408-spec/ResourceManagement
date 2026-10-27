import { z } from 'zod';
import type { Role } from '../generated/prisma/enums.js';

/**
 * Role rules from the scope plan's "Users and roles" table, in one place.
 * Task rules depend on the project too, so they live in the tasks service
 * (admin, or a PM who owns or is staffed on the project; assignees for status/hours).
 */

/** Maintain people, capacity, departments, projects and staffing. */
export const STAFFING_ROLES: Role[] = ['ADMIN', 'DELIVERY_HEAD', 'RESOURCE_MANAGER'];

/** Password rule for passwords people choose or are given. */
export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Include a letter')
  .regex(/[0-9]/, 'Include a number');

/** Who sees the sales pipeline (delivery heads and PMs read it to plan upcoming work). */
export const LEAD_VIEW_ROLES: Role[] = ['ADMIN', 'SALES', 'DELIVERY_HEAD', 'PM'];

/** Who adds, edits and deletes leads: every sales user can work every lead. */
export const LEAD_EDIT_ROLES: Role[] = ['ADMIN', 'SALES'];
