import { initializeApp, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  connectAuthEmulator,
  getAuth,
  type Auth,
  type Persistence,
} from "firebase/auth";
import { connectFirestoreEmulator, initializeFirestore, type Firestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, type Functions } from "firebase/functions";
import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage";

/**
 * Firebase client for the Firestore backend that is replacing Supabase,
 * module by module (see lib/data-backend.ts). Configured entirely from
 * environment variables (see .env.example).
 *
 * Services are created on first use, not at import, so nothing connects —
 * and the project guard below does not run — until a module running on
 * Firestore actually needs them. When the variables are absent,
 * getFirebase() returns null — the same contract as `supabase` in
 * lib/supabase.ts.
 */

const env = import.meta.env;

const config = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
};

/** Emulator Suite on this PC instead of the cloud project (see firebase.json). */
export const useEmulators = env.VITE_FIREBASE_USE_EMULATORS === "true";

/**
 * The only projects this app may talk to: the GSO PRIMS project, and the
 * offline `demo-*` projects the Emulator Suite uses. The developer account can
 * also reach other Firebase projects, so a mistyped .env must stop the app
 * here rather than read or write someone else's data.
 */
export const ALLOWED_PROJECT_ID = "egso-b2c0a";

/**
 * Named on purpose, so the refusal says why: the municipality's live system,
 * and the retired GSO PRIMS development project.
 */
export const FORBIDDEN_PROJECT_IDS = ["alaminos-municipality", "egso-2k26"] as const;

function assertAllowedProject(projectId: string): void {
  if ((FORBIDDEN_PROJECT_IDS as readonly string[]).includes(projectId)) {
    throw new Error(`Firebase project "${projectId}" is off-limits to GSO PRIMS.`);
  }
  const isDemo = projectId.startsWith("demo-");
  if (isDemo && !useEmulators) {
    throw new Error(`Firebase project "${projectId}" exists only in the Emulator Suite.`);
  }
  if (!isDemo && projectId !== ALLOWED_PROJECT_ID) {
    throw new Error(
      `Firebase project "${projectId}" is not GSO PRIMS. Set VITE_FIREBASE_PROJECT_ID to ${ALLOWED_PROJECT_ID}.`,
    );
  }
}

export const isFirebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId);

/** Cloud Functions region; Firestore and Storage live in the same place. */
export const FUNCTIONS_REGION = "asia-southeast1";

export interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  storage: FirebaseStorage;
  functions: Functions;
}

function connect(): FirebaseServices {
  assertAllowedProject(config.projectId!);
  const app = initializeApp(config);
  const auth = getAuth(app);
  // The data layer writes optional fields as `undefined` (an approval's
  // remarks, a PO's TIN), which Supabase stored as null and Firestore would
  // otherwise reject. Dropping them stores nothing, which reads back the same.
  const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
  const storage = getStorage(app);
  const functions = getFunctions(app, FUNCTIONS_REGION);

  // App Check proves to the public Cloud Functions that a call comes from this
  // web app. It starts only with a site key (reCAPTCHA Enterprise, created
  // when the app is registered for App Check in the egso-b2c0a console) and
  // never against the emulators, which issue no tokens.
  const appCheckKey = env.VITE_FIREBASE_APPCHECK_SITE_KEY as string | undefined;
  if (appCheckKey && !useEmulators) {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(appCheckKey),
      isTokenAutoRefreshEnabled: true,
    });
  }

  if (useEmulators) {
    // Ports match the "emulators" block in firebase.json.
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8085);
    connectStorageEmulator(storage, "127.0.0.1", 9199);
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  }
  return { app, auth, db, storage, functions };
}

let services: FirebaseServices | null | undefined;

/** The Firebase services, created on first call; null when not configured. */
export function getFirebase(): FirebaseServices | null {
  if (services === undefined) services = isFirebaseConfigured ? connect() : null;
  return services;
}

/** The Firebase services, or an error naming the missing configuration. */
export function requireFirebase(): FirebaseServices {
  const s = getFirebase();
  if (!s) {
    throw new Error("Firebase is not configured. Add the VITE_FIREBASE_* values to .env.");
  }
  return s;
}

/**
 * "Remember me": persistent sign-in survives closing the browser, session
 * sign-in does not — the same split lib/supabase.ts makes with localStorage
 * and sessionStorage. Pass the result to `setPersistence` before signing in.
 */
export function sessionPersistence(remember: boolean): Persistence {
  return remember ? browserLocalPersistence : browserSessionPersistence;
}
