import { describe, expect, it } from 'vitest';
import { enterDigits, isComplete, needsMfa, readMfaState } from './mfa';

const empty = () => Array<string>(6).fill('');

describe('MFA code entry', () => {
  it('moves to the next box after a digit', () => {
    expect(enterDigits(empty(), 0, '4')).toEqual({ digits: ['4', '', '', '', '', ''], focus: 1 });
  });

  it('ignores anything but digits', () => {
    const before = empty();
    expect(enterDigits(before, 2, 'a')).toEqual({ digits: before, focus: 2 });
  });

  it('spreads a pasted code over the boxes and stops at the last', () => {
    expect(enterDigits(empty(), 0, '12 34-56')).toEqual({
      digits: ['1', '2', '3', '4', '5', '6'],
      focus: 5,
    });
    expect(enterDigits(empty(), 4, '9876').digits).toEqual(['', '', '', '', '9', '8']);
  });

  it('knows when all six digits are in', () => {
    expect(isComplete(['1', '2', '3', '4', '5', '6'])).toBe(true);
    expect(isComplete(['1', '2', '3', '4', '5', ''])).toBe(false);
  });
});

describe('MFA hand-over from sign-in', () => {
  it('recognises a sign-in answer that needs a second step', () => {
    expect(needsMfa({ mfaRequired: true, mfaToken: 't' })).toBe(true);
    expect(
      needsMfa({
        token: 'jwt',
        user: { id: '1', name: 'A', email: 'a@b.c', role: 'PM', mustChangePassword: false },
      }),
    ).toBe(false);
  });

  it('accepts only router state with a token', () => {
    expect(readMfaState(null)).toBeNull();
    expect(readMfaState({ next: '/x' })).toBeNull();
    expect(readMfaState({ mfaToken: 't', next: '/x', remember: true })).toEqual({
      mfaToken: 't',
      next: '/x',
      remember: true,
    });
  });
});
