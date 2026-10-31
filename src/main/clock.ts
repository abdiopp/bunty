/** Injected wherever "today" matters, so tests can pin the date. */
export interface Clock {
  now(): Date
}

export const systemClock: Clock = { now: () => new Date() }
