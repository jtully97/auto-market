/** Offset (ms) of `timeZone` from UTC at the given instant. */
const tzOffset = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - date.getTime();
};

/** Convert a wall-clock time in `timeZone` to a UTC Date. */
export const zonedToUtc = (
  y: number,
  m: number,
  d: number,
  hh: number,
  mm: number,
  timeZone: string,
) => {
  const guess = new Date(Date.UTC(y, m, d, hh, mm));
  const offset = tzOffset(guess, timeZone);
  const result = new Date(guess.getTime() - offset);
  // Correct across DST boundaries.
  const offset2 = tzOffset(result, timeZone);
  return offset2 === offset ? result : new Date(guess.getTime() - offset2);
};

/** Wall-clock date parts of `date` in `timeZone`. */
export const zonedParts = (date: Date, timeZone: string) => {
  const local = new Date(date.getTime() + tzOffset(date, timeZone));
  return {
    y: local.getUTCFullYear(),
    m: local.getUTCMonth(),
    d: local.getUTCDate(),
    dow: local.getUTCDay(),
  };
};

/**
 * Upcoming occurrences of a weekly slot ("Tue/Thu at 10:00 America/New_York")
 * between now and `days` ahead, as UTC instants.
 */
export const upcomingSlots = (
  daysOfWeek: number[],
  timeOfDay: string,
  timeZone: string,
  days = 14,
  from = new Date(),
) => {
  const [hh, mm] = timeOfDay.split(':').map(Number) as [number, number];
  const slots: Date[] = [];
  for (let i = 0; i <= days; i++) {
    const day = new Date(from.getTime() + i * 86400_000);
    const p = zonedParts(day, timeZone);
    if (!daysOfWeek.includes(p.dow)) continue;
    const slot = zonedToUtc(p.y, p.m, p.d, hh, mm, timeZone);
    if (slot > from) slots.push(slot);
  }
  return slots;
};
