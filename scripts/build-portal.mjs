// Builds the public portal site (egso-public-portal.web.app) into dist-portal/:
// the same app and Firebase configuration as the admin build (.env.production),
// with VITE_APP_SURFACE=portal so only the portal's pages are included, at "/".
// Set here rather than in an .env file so the Firebase values live in one place;
// Vite gives variables already in the environment priority over .env files.
import { build } from "vite";

process.env.VITE_APP_SURFACE = "portal";
await build({ mode: "production", build: { outDir: "dist-portal", emptyOutDir: true } });
