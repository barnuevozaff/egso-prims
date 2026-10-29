import type { Firestore } from "firebase-admin/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { OFFICIAL_OFFICES } from "../src/offices.js";
import { accountToken, AUTH, call } from "./helpers.js";
import { clearFirestore, connect, disconnect, PROJECT_ID } from "./setup.js";

/**
 * The office directory (29 Oct 2026): written once with the official list,
 * read by everyone (the public portal signed out), changed by any account.
 * Synthetic accounts; demo project only.
 */

let db: Firestore;
let admin: string;

type Office = { id: string; name: string };
const list = async (token?: string) => (await call("listOffices", {}, token)).result as unknown as Office[];
const manage = (data: Record<string, unknown>, token = admin) => call("manageOffice", data, token);

beforeAll(() => {
  db = connect();
});

afterAll(async () => {
  await disconnect();
});

beforeEach(async () => {
  await clearFirestore();
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: "DELETE" });
  admin = (await accountToken("admin@alaminos.gov.ph")).token;
});

describe("the office directory", () => {
  it("starts as the 31 official offices, in order, readable signed out with only ID and name", async () => {
    const offices = await list();
    expect(offices.map((o) => o.name)).toEqual(OFFICIAL_OFFICES);
    expect(Object.keys(offices[0]).sort()).toEqual(["id", "name"]);
    expect((await list(admin)).map((o) => o.name)).toEqual(OFFICIAL_OFFICES);
  });

  it("is written once: a removed office never comes back, a renamed one keeps its name", async () => {
    const offices = await list();
    await manage({ action: "remove", id: offices[0].id });
    await manage({ action: "rename", id: offices[1].id, name: "Office of the Municipal Agriculturist (MAO)" });
    const again = await list();
    expect(again).toHaveLength(30);
    expect(again.map((o) => o.name)).not.toContain(OFFICIAL_OFFICES[0]);
    expect(again[0].name).toBe("Office of the Municipal Agriculturist (MAO)");
    expect((await db.collection("offices").get()).size).toBe(31);
  });

  it("is changed by an account only, never signed out", async () => {
    const [first] = await list();
    for (const data of [{ action: "add", name: "X Office" }, { action: "rename", id: first.id, name: "Y" }, { action: "remove", id: first.id }]) {
      expect((await call("manageOffice", data)).error?.status).toBe("PERMISSION_DENIED");
    }
    expect(await list()).toHaveLength(31);
  });

  it("adds an office at the end, and refuses a name already on the list, whatever its case and spacing", async () => {
    const added = (await manage({ action: "add", name: "  Municipal   Library " })).result as unknown as Office[];
    expect(added.at(-1)?.name).toBe("Municipal Library");
    expect(added).toHaveLength(32);
    const twice = await manage({ action: "add", name: "municipal library" });
    expect(twice.error?.status).toBe("ALREADY_EXISTS");
    expect((await manage({ action: "add", name: "general services office" })).error?.status).toBe("ALREADY_EXISTS");
    expect((await manage({ action: "add", name: "x" })).error?.status).toBe("INVALID_ARGUMENT");
  });

  it("renames an office, refusing another office's name, and frees the old name", async () => {
    const offices = await list();
    const gso = offices.find((o) => o.name === "General Services Office")!;
    expect((await manage({ action: "rename", id: gso.id, name: "Rural Health Unit" })).error?.status).toBe("ALREADY_EXISTS");
    await manage({ action: "rename", id: gso.id, name: "General Services Office (GSO)" });
    expect((await manage({ action: "add", name: "General Services Office" })).error).toBeUndefined();
  });

  it("removes an office from the lists only: its document stays, and its name can be added again", async () => {
    const offices = await list();
    const market = offices.find((o) => o.name === "Public Market")!;
    const after = (await manage({ action: "remove", id: market.id })).result as unknown as Office[];
    expect(after.map((o) => o.name)).not.toContain("Public Market");
    expect((await db.doc(`offices/${market.id}`).get()).data()).toMatchObject({ name: "Public Market", active: false });
    // Removing it again changes nothing.
    expect((await manage({ action: "remove", id: market.id })).error).toBeUndefined();
    expect((await manage({ action: "add", name: "Public Market" })).error).toBeUndefined();
  });

  it("leaves documents already filed under an office untouched", async () => {
    await db.doc("purchase_requests/PR-2026-000001").set({ id: "PR-2026-000001", pr_number: "PR-2026-000001", department_code: "Public Market" });
    const market = (await list()).find((o) => o.name === "Public Market")!;
    await manage({ action: "rename", id: market.id, name: "Alaminos Public Market" });
    await manage({ action: "remove", id: market.id });
    expect((await db.doc("purchase_requests/PR-2026-000001").get()).get("department_code")).toBe("Public Market");
  });
});
