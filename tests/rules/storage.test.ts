import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteObject, getBytes, ref, uploadBytes } from "firebase/storage";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

import { createEnv, staff } from "./setup";

let env: RulesTestEnvironment;

const as = (who: keyof typeof staff) =>
  env.authenticatedContext(staff[who].uid, staff[who].token).storage();
const anon = () => env.unauthenticatedContext().storage();

const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF", synthetic
const PATH = "attachments/PR-2026-000001/quotation.pdf";

beforeAll(async () => {
  env = await createEnv();
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), PATH), pdf, { contentType: "application/pdf" });
  });
});

describe("attachments", () => {
  it("are readable by accounts only, through the SDK", async () => {
    await assertSucceeds(getBytes(ref(as("colleague"), PATH)));
    await assertFails(getBytes(ref(anon(), PATH)));
    const anonymous = env.authenticatedContext("anon-1", { firebase: { sign_in_provider: "anonymous" } }).storage();
    await assertFails(getBytes(ref(anonymous, PATH)));
  });

  it("accept PDFs and images from any account", async () => {
    await assertSucceeds(
      uploadBytes(ref(as("colleague"), "attachments/PR-2026-000002/a.pdf"), pdf, { contentType: "application/pdf" }),
    );
    await assertSucceeds(
      uploadBytes(ref(as("admin"), "attachments/PO-2026-000001/b.png"), pdf, { contentType: "image/png" }),
    );
  });

  it("refuse other file types, oversized files and signed-out uploads", async () => {
    await assertFails(
      uploadBytes(ref(as("admin"), "attachments/PR-2026-000002/run.exe"), pdf, {
        contentType: "application/x-msdownload",
      }),
    );
    await assertFails(
      uploadBytes(ref(as("admin"), "attachments/PR-2026-000002/big.pdf"), new Uint8Array(10 * 1024 * 1024), {
        contentType: "application/pdf",
      }),
    );
    await assertFails(uploadBytes(ref(anon(), "attachments/PR-2026-000002/a.pdf"), pdf, { contentType: "application/pdf" }));
  });

  it("refuse SVG images, which can carry script", async () => {
    await assertFails(
      uploadBytes(ref(as("admin"), "attachments/PR-2026-000002/logo.svg"), pdf, { contentType: "image/svg+xml" }),
    );
  });

  it("refuse files outside the one-folder layout", async () => {
    await assertFails(
      uploadBytes(ref(as("admin"), "attachments/PR-2026-000002/sub/a.pdf"), pdf, { contentType: "application/pdf" }),
    );
    await assertFails(uploadBytes(ref(as("admin"), "attachments/a.pdf"), pdf, { contentType: "application/pdf" }));
  });

  it("can be deleted by an account, never signed out", async () => {
    await assertFails(deleteObject(ref(anon(), PATH)));
    await assertSucceeds(deleteObject(ref(as("colleague"), PATH)));
  });

  it("never overwrite an existing file", async () => {
    await assertFails(uploadBytes(ref(as("admin"), PATH), pdf, { contentType: "application/pdf" }));
  });

  it("are the only thing in the bucket anyone can reach", async () => {
    await assertFails(uploadBytes(ref(as("admin"), "elsewhere/a.pdf"), pdf, { contentType: "application/pdf" }));
  });
});
