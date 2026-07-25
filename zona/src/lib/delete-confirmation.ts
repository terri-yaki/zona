/**
 * Pure two-step confirmation state machine for the Settings "Delete account
 * and data" flow. The destructive call is only allowed once both explicit
 * confirmations have been given; canceling either step resets the flow. No
 * React Native imports — the settings screen only wires dialogs to this unit.
 */

export type DeleteConfirmationStep = 'idle' | 'firstConfirmed' | 'doubleConfirmed';

export const DELETE_CONFIRMATION_IDLE: DeleteConfirmationStep = 'idle';

/**
 * Advance one explicit confirmation. `idle` → `firstConfirmed` →
 * `doubleConfirmed`; advancing past the armed state is a no-op so a
 * double-fired dialog action cannot skip ahead.
 */
export function advanceDeleteConfirmation(step: DeleteConfirmationStep): DeleteConfirmationStep {
  if (step === 'idle') return 'firstConfirmed';
  if (step === 'firstConfirmed') return 'doubleConfirmed';
  return 'doubleConfirmed';
}

/** Cancel at any point — both dialogs reset the flow to idle. */
export function cancelDeleteConfirmation(): DeleteConfirmationStep {
  return DELETE_CONFIRMATION_IDLE;
}

/** The delete request may only fire from the doubly-confirmed state. */
export function canDeleteAccount(step: DeleteConfirmationStep): boolean {
  return step === 'doubleConfirmed';
}
