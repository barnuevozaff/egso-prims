import * as React from "react";

/*
 * A deployment gives every chunk a new hashed filename and drops the old one.
 * A tab that loaded index.html before the deployment went out asks for a file
 * that is no longer on the server, and the route it was opening never
 * resolves: the page sits on "Loading…" for ever with nothing in the console.
 * One reload fetches the new index.html and the route opens.
 *
 * The flag stops a build that is genuinely broken from reloading in a loop —
 * the second failure is allowed through to the error boundary, which says so.
 * sessionStorage is unavailable in some browser configurations; without it we
 * simply lose the loop guard, so its absence must not break the page.
 */
const CHUNK_RELOAD_KEY = "gso-prims:chunk-reload";

const hasReloaded = (): boolean => {
  try {
    return sessionStorage.getItem(CHUNK_RELOAD_KEY) !== null;
  } catch {
    return false;
  }
};

const setReloaded = (value: boolean): void => {
  try {
    if (value) sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
    else sessionStorage.removeItem(CHUNK_RELOAD_KEY);
  } catch {
    /* no loop guard, but the page still works */
  }
};

export const lazyPage = <K extends string>(
  loader: () => Promise<Record<K, React.ComponentType>>,
  key: K,
) =>
  React.lazy(async () => {
    try {
      const mod = await loader();
      setReloaded(false);
      return { default: mod[key] };
    } catch (error) {
      if (hasReloaded()) throw error;
      setReloaded(true);
      window.location.reload();
      // The reload takes over; nothing after this point renders.
      return new Promise<never>(() => {});
    }
  });
