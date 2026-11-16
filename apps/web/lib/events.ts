'use client';

/** Tiny app-wide event bus (e.g. API layer -> upgrade dialog) without a global store. */
type Events = { 'upgrade-required': { message: string; code: string } };

export const emit = <K extends keyof Events>(name: K, detail: Events[K]) =>
  window.dispatchEvent(new CustomEvent(name, { detail }));

export const on = <K extends keyof Events>(name: K, handler: (detail: Events[K]) => void) => {
  const listener = (e: Event) => handler((e as CustomEvent<Events[K]>).detail);
  window.addEventListener(name, listener);
  return () => window.removeEventListener(name, listener);
};
