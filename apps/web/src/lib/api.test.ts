import { describe, expect, it } from 'vitest';
import { ApiError, TASK_STATUSES } from './api';

describe('api client', () => {
  it('exposes board columns in workflow order', () => {
    expect(TASK_STATUSES).toEqual([
      'BACKLOG',
      'TODO',
      'IN_PROGRESS',
      'IN_REVIEW',
      'BLOCKED',
      'DONE',
    ]);
  });

  it('ApiError carries the HTTP status', () => {
    const err = new ApiError(403, 'Insufficient role');
    expect(err.status).toBe(403);
    expect(err.message).toBe('Insufficient role');
  });
});
