import { describe, expect, it } from 'vitest';
import { upcomingSlots, zonedToUtc } from '../core/time.js';

describe('timezone scheduling', () => {
  it('converts wall-clock time to UTC across DST', () => {
    expect(zonedToUtc(2026, 0, 15, 10, 0, 'America/New_York').toISOString()).toBe(
      '2026-01-15T15:00:00.000Z',
    );
    expect(zonedToUtc(2026, 6, 15, 10, 0, 'America/New_York').toISOString()).toBe(
      '2026-07-15T14:00:00.000Z',
    );
  });

  it('lists upcoming weekly slots', () => {
    const from = new Date('2026-11-16T00:00:00Z'); // Monday
    const slots = upcomingSlots([2, 4], '09:30', 'UTC', 7, from);
    expect(slots.map((s) => s.toISOString())).toEqual([
      '2026-11-17T09:30:00.000Z',
      '2026-11-19T09:30:00.000Z',
    ]);
  });
});
