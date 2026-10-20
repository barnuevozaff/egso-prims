/**
 * Refuses to run anywhere but GSO PRIMS.
 *
 * The developer account can also reach other Firebase projects, including
 * the municipality's live system. If these functions were ever deployed or
 * emulated against any project other than egso-b2c0a (or an offline demo-*
 * emulator project), they stop at load time instead of writing audit
 * entries, counters or deletes into someone else's database.
 */

export const ALLOWED_PROJECT_ID = "egso-b2c0a";

/**
 * Named on purpose, so the refusal says why: the municipality's live system,
 * and the retired GSO PRIMS development project.
 */
export const FORBIDDEN_PROJECT_IDS = ["alaminos-municipality", "egso-2k26"] as const;

export function assertAllowedProject(projectId: string | undefined): string {
  if (!projectId) throw new Error("No Firebase project is set for GSO PRIMS functions.");
  if ((FORBIDDEN_PROJECT_IDS as readonly string[]).includes(projectId)) {
    throw new Error(`Firebase project "${projectId}" is off-limits to GSO PRIMS functions.`);
  }
  if (projectId !== ALLOWED_PROJECT_ID && !projectId.startsWith("demo-")) {
    throw new Error(`GSO PRIMS functions may run only in ${ALLOWED_PROJECT_ID}, not "${projectId}".`);
  }
  return projectId;
}
