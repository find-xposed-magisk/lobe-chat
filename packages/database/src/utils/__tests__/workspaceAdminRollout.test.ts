// @vitest-environment node
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import {
  roles,
  userRoles,
  users,
  workspaceInvitations,
  workspaceMembers,
  workspaces,
} from '../../schemas';
import type { LobeChatDatabase } from '../../type';
import { WORKSPACE_ROLE_CONVERGE_STATEMENTS } from '../workspaceAdminRollout';

const serverDB: LobeChatDatabase = await getTestDB();
const ownerId = 'role-converge-owner';
const legacyOwnerId = 'role-converge-legacy-owner';
const driftedMemberId = 'role-converge-drifted-member';
const workspaceId = 'role-converge-workspace';
const invitationId = 'role-converge-invitation';

const runConverge = async () => {
  for (const statement of WORKSPACE_ROLE_CONVERGE_STATEMENTS) {
    await serverDB.execute(sql.raw(statement.sql));
  }
};

const cleanup = async () => {
  await serverDB.delete(userRoles);
  await serverDB.delete(roles);
  await serverDB.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await serverDB.delete(users);
};

beforeEach(async () => {
  await cleanup();
  await serverDB
    .insert(users)
    .values([{ id: ownerId }, { id: legacyOwnerId }, { id: driftedMemberId }]);
  await serverDB.insert(workspaces).values({
    id: workspaceId,
    name: 'Role converge',
    primaryOwnerId: ownerId,
    slug: workspaceId,
  });
  await serverDB.insert(workspaceMembers).values([
    // Primary owner's row is soft-deleted and mislabelled — must be repaired.
    { deletedAt: new Date(), role: 'member', userId: ownerId, workspaceId },
    // Legacy co-owner without any RBAC grant falls back to admin.
    { role: 'owner', userId: legacyOwnerId, workspaceId },
    // Drifted row: column says owner, but the legacy RBAC grant (the
    // pre-reversal truth) says member — must reconcile to member.
    { role: 'owner', userId: driftedMemberId, workspaceId },
  ]);
  const [memberRole] = await serverDB
    .insert(roles)
    .values({
      displayName: 'Member',
      isActive: true,
      isSystem: true,
      name: 'workspace_member',
      workspaceId,
    })
    .returning({ id: roles.id });
  await serverDB
    .insert(userRoles)
    .values({ roleId: memberRole.id, userId: driftedMemberId, workspaceId });
  // An expired member grant on the stray co-owner must be ignored — the
  // convergence mirrors the RBAC checks' active/non-expired predicates, so
  // this row falls through to the admin fallback instead of becoming member.
  await serverDB.insert(userRoles).values({
    expiresAt: new Date(Date.now() - 86_400_000),
    roleId: memberRole.id,
    userId: legacyOwnerId,
    workspaceId,
  });
  await serverDB.insert(workspaceInvitations).values({
    email: 'pending-owner@example.com',
    expiresAt: new Date(Date.now() + 86_400_000),
    id: invitationId,
    inviterId: ownerId,
    role: 'owner',
    token: `${invitationId}-token`,
    workspaceId,
  });
});

afterEach(cleanup);

describe('workspace role convergence statements', () => {
  it('converges legacy rows to the four-role model and is idempotent', async () => {
    await runConverge();
    await runConverge();

    const memberships = await serverDB.query.workspaceMembers.findMany({
      where: eq(workspaceMembers.workspaceId, workspaceId),
    });

    const primary = memberships.find(({ userId }) => userId === ownerId);
    expect(primary?.role).toBe('owner');
    expect(primary?.deletedAt).toBeNull();

    expect(memberships.find(({ userId }) => userId === legacyOwnerId)?.role).toBe('admin');
    expect(memberships.find(({ userId }) => userId === driftedMemberId)?.role).toBe('member');

    const invitation = await serverDB.query.workspaceInvitations.findFirst({
      where: eq(workspaceInvitations.id, invitationId),
    });
    expect(invitation?.role).toBe('admin');
  });
});
