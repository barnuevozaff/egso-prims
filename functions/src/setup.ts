// Imported first by index.ts. ES modules run their imports before their own
// body, so this has to be a module of its own to take effect before any
// function below is defined.
import { initializeApp } from "firebase-admin/app";
import { setGlobalOptions } from "firebase-functions/v2";

import { assertAllowedProject } from "./project.js";

// GCLOUD_PROJECT is set by both the Cloud Functions runtime and the emulator.
assertAllowedProject(process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT);

initializeApp();

// Same region as Firestore and Storage. maxInstances caps what a runaway
// loop or a burst of portal traffic can cost.
setGlobalOptions({ region: "asia-southeast1", maxInstances: 5 });
