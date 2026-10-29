/// <reference types="vite/client" />

/** Injected by vite.config.ts; shown read-only in Settings → System Information. */
declare const __BUILD_DATE__: string;

interface ImportMetaEnv {
  /** "portal" for the public portal build (scripts/build-portal.mjs); unset for the admin app. */
  readonly VITE_APP_SURFACE?: "portal";
}
