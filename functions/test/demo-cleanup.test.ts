import { describe, expect, it } from "vitest";

import { demoCleanupAllowed } from "../src/documents/demo-cleanup.js";

describe("deleting demo purchase requests is for the local demo only", () => {
  it("is allowed only inside the Functions emulator for demo-egso-prims", () => {
    expect(demoCleanupAllowed({ FUNCTIONS_EMULATOR: "true", GCLOUD_PROJECT: "demo-egso-prims" })).toBe(true);
  });

  it("is refused on a deployed project, the real one included", () => {
    expect(demoCleanupAllowed({ GCLOUD_PROJECT: "egso-b2c0a" })).toBe(false);
    expect(demoCleanupAllowed({ GCLOUD_PROJECT: "demo-egso-prims" })).toBe(false);
    expect(demoCleanupAllowed({ FUNCTIONS_EMULATOR: "true", GCLOUD_PROJECT: "egso-b2c0a" })).toBe(false);
    expect(demoCleanupAllowed({ FUNCTIONS_EMULATOR: "false", GCLOUD_PROJECT: "demo-egso-prims" })).toBe(false);
    expect(demoCleanupAllowed({ FUNCTIONS_EMULATOR: "true", GCLOUD_PROJECT: "demo-other" })).toBe(false);
    expect(demoCleanupAllowed({})).toBe(false);
  });
});
