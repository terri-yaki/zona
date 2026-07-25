import { describe, expect, it } from 'vitest';

import {
  advanceDeleteConfirmation,
  cancelDeleteConfirmation,
  canDeleteAccount,
  DELETE_CONFIRMATION_IDLE,
  type DeleteConfirmationStep,
} from '../lib/delete-confirmation';

describe('delete account double confirmation', () => {
  it('advances idle → firstConfirmed → doubleConfirmed and stays armed', () => {
    const first = advanceDeleteConfirmation(DELETE_CONFIRMATION_IDLE);
    expect(first).toBe('firstConfirmed');
    const second = advanceDeleteConfirmation(first);
    expect(second).toBe('doubleConfirmed');
    // A double-fired action cannot skip past the armed state.
    expect(advanceDeleteConfirmation(second)).toBe('doubleConfirmed');
  });

  it('blocks the delete call until both confirmations are given', () => {
    expect(canDeleteAccount(DELETE_CONFIRMATION_IDLE)).toBe(false);
    expect(canDeleteAccount('firstConfirmed')).toBe(false);
    expect(canDeleteAccount('doubleConfirmed')).toBe(true);
  });

  it('resets to idle when canceled at any step', () => {
    const steps: DeleteConfirmationStep[] = ['idle', 'firstConfirmed', 'doubleConfirmed'];
    for (const step of steps) {
      expect(cancelDeleteConfirmation(), step).toBe('idle');
    }
  });

  it('simulates the full flow: confirm, confirm, delete; and cancel-aborts', () => {
    // Full path: two advances arm the delete.
    let step: DeleteConfirmationStep = DELETE_CONFIRMATION_IDLE;
    step = advanceDeleteConfirmation(step);
    expect(canDeleteAccount(step)).toBe(false);
    step = advanceDeleteConfirmation(step);
    expect(canDeleteAccount(step)).toBe(true);

    // Cancel after the first dialog: never armed, even if advanced again.
    let aborted: DeleteConfirmationStep = advanceDeleteConfirmation(DELETE_CONFIRMATION_IDLE);
    aborted = cancelDeleteConfirmation();
    expect(canDeleteAccount(aborted)).toBe(false);
    aborted = advanceDeleteConfirmation(aborted);
    expect(canDeleteAccount(aborted)).toBe(false);

    // Cancel on the final dialog disarms a previously armed flow.
    let disarmed: DeleteConfirmationStep = advanceDeleteConfirmation(advanceDeleteConfirmation(DELETE_CONFIRMATION_IDLE));
    disarmed = cancelDeleteConfirmation();
    expect(canDeleteAccount(disarmed)).toBe(false);
  });
});
