import { describe, expect, it } from 'vitest';
import { statusHelpKey } from '../src/core/status-help';

describe('status explanations', () => {
  it.each([
    ['clientTransferProhibited', 'card.status.restricted'],
    ['server delete prohibited', 'card.status.restricted'],
    ['clientHold', 'card.status.hold'], ['server hold', 'card.status.hold'],
    ['pendingDelete', 'card.status.pendingDelete'], ['pending delete', 'card.status.pendingDelete'],
    ['pendingTransfer', 'card.status.pending'], ['redemptionPeriod', 'card.status.redemption'],
    ['auto renew period', 'card.status.grace'], ['ok', 'card.status.active'],
    ['registered', 'card.status.active'], ['delegated', 'card.status.delegated'],
    ['inactive', 'card.status.inactive'],
  ])('%s -> %s', (status, key) => expect(statusHelpKey(status)).toBe(key));
  it('leaves unknown registry states untranslated, without guessing', () => {
    expect(statusHelpKey('not delegated')).toBeNull();
    expect(statusHelpKey('special state')).toBeNull();
    expect(statusHelpKey('pendingSomethingUnknown')).toBeNull();
  });
});
