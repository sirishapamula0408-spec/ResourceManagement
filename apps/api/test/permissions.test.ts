import { describe, expect, it } from 'vitest';
import { passwordSchema, STAFFING_ROLES } from '../src/lib/permissions.js';

describe('password rule', () => {
  it.each(['Welcome1', 'longer pass 2026'])('accepts %s', (pw) => {
    expect(passwordSchema.safeParse(pw).success).toBe(true);
  });

  it.each(['short1', 'nodigitshere', '12345678'])('rejects %s', (pw) => {
    expect(passwordSchema.safeParse(pw).success).toBe(false);
  });
});

describe('staffing roles', () => {
  it('match the scope plan: admin, delivery head, resource manager (not PM or member)', () => {
    expect(STAFFING_ROLES).toEqual(['ADMIN', 'DELIVERY_HEAD', 'RESOURCE_MANAGER']);
  });
});
