/**
 * Four-role rollout data convergence (LOBE-12329).
 *
 * `workspace_members.role` is the single source of truth for built-in
 * workspace roles; permissions expand from the in-code
 * `WORKSPACE_ROLE_PERMISSIONS` matrix at request time. The only data work the
 * rollout needs is converging legacy rows to the four-role model:
 *
 * 1. the primary owner's membership row is repaired if missing /
 *    soft-deleted / mislabelled;
 * 2. drifted non-primary rows are reconciled from the legacy RBAC grants —
 *    the pre-reversal source of truth — while those rows still exist
 *    (a non-primary owner grant converges to admin);
 * 3. leftover stray `owner` labels without any grant fall back to `admin`;
 * 4. pending Owner invitations become Admin (Owner is only produced via
 *    ownership transfer).
 *
 * Run via `scripts/workspace-rbac-backfill` in the cloud repo. Every
 * statement is idempotent; once they converge, the
 * `workspace_members_unique_active_owner_idx` index-only migration can ship.
 */

export interface WorkspaceRoleConvergeStatement {
  label: string;
  sql: string;
}

export const WORKSPACE_ROLE_CONVERGE_STATEMENTS: WorkspaceRoleConvergeStatement[] = [
  {
    label: 'repair-primary-owner-membership',
    sql: `
INSERT INTO "workspace_members" (
  "workspace_id",
  "user_id",
  "role",
  "joined_at",
  "updated_at",
  "deleted_at"
)
SELECT
  "workspaces"."id",
  "workspaces"."primary_owner_id",
  'owner',
  now(),
  now(),
  NULL
FROM "workspaces"
ON CONFLICT ("workspace_id", "user_id") DO UPDATE SET
  "role" = 'owner',
  "deleted_at" = NULL,
  "updated_at" = now();`,
  },
  {
    // Column/RBAC drift existed before the reversal (the column could lag a
    // role change while RBAC rows were authoritative). While the legacy
    // workspace-scoped grants are still in the DB, use them as the
    // last-known truth: write each non-primary member's RBAC projection back
    // into the column. A non-primary owner grant converges to admin (the
    // unique Owner is the primary owner). No-ops once the grants are
    // physically cleaned up.
    label: 'reconcile-non-primary-roles-from-rbac-grants',
    sql: `
UPDATE "workspace_members"
SET "role" = "projection"."resolved", "updated_at" = now()
FROM (
  SELECT
    "rbac_user_roles"."user_id",
    "rbac_user_roles"."workspace_id",
    CASE min(array_position(
      ARRAY['workspace_owner', 'workspace_admin', 'workspace_member', 'workspace_viewer'],
      "rbac_roles"."name"
    ))
      WHEN 1 THEN 'admin'
      WHEN 2 THEN 'admin'
      WHEN 3 THEN 'member'
      WHEN 4 THEN 'viewer'
    END AS "resolved"
  FROM "rbac_user_roles"
  INNER JOIN "rbac_roles"
    ON "rbac_roles"."id" = "rbac_user_roles"."role_id"
    AND "rbac_roles"."workspace_id" = "rbac_user_roles"."workspace_id"
  WHERE "rbac_roles"."name" IN (
    'workspace_owner', 'workspace_admin', 'workspace_member', 'workspace_viewer'
  )
    -- Mirror the predicates of the RBAC checks this data replaces: inactive
    -- roles and expired grants were never authoritative.
    AND "rbac_roles"."is_active" = true
    AND ("rbac_user_roles"."expires_at" IS NULL OR "rbac_user_roles"."expires_at" > now())
  GROUP BY "rbac_user_roles"."user_id", "rbac_user_roles"."workspace_id"
) AS "projection", "workspaces"
WHERE
  "workspace_members"."workspace_id" = "projection"."workspace_id"
  AND "workspace_members"."user_id" = "projection"."user_id"
  AND "workspaces"."id" = "workspace_members"."workspace_id"
  AND "workspace_members"."user_id" <> "workspaces"."primary_owner_id"
  AND "workspace_members"."deleted_at" IS NULL
  AND "projection"."resolved" IS NOT NULL
  AND "workspace_members"."role" IS DISTINCT FROM "projection"."resolved";`,
  },
  {
    // Leftover stray owners without any RBAC grant (nothing to reconcile
    // against) fall back to admin — the historical UI meaning of a
    // non-primary owner label.
    label: 'relabel-non-primary-owners-admin',
    sql: `
UPDATE "workspace_members"
SET "role" = 'admin', "updated_at" = now()
FROM "workspaces"
WHERE
  "workspace_members"."workspace_id" = "workspaces"."id"
  AND "workspace_members"."user_id" <> "workspaces"."primary_owner_id"
  AND "workspace_members"."role" = 'owner';`,
  },
  {
    label: 'convert-owner-invitations-admin',
    sql: `
UPDATE "workspace_invitations"
SET "role" = 'admin', "updated_at" = now()
WHERE "role" = 'owner';`,
  },
];
