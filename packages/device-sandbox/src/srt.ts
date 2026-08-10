import type { SandboxRuntimeConfig } from '@anthropic-ai/sandbox-runtime';
import { getSrtWinPath } from '@anthropic-ai/sandbox-runtime';

import { normalizeSandboxPolicy } from './policy';
import { ensureStagedSrtWin, resolveSrtWinSource } from './srtWinStaging';
import type { SandboxPolicy } from './types';

/**
 * Point the backend at a helper the sandbox user can read. See
 * {@link ensureStagedSrtWin} — without this, a per-user app install puts the
 * helper somewhere the sandbox account has no rights to, and every launch dies
 * with an unexplained ACCESS_DENIED.
 *
 * Silent no-op off Windows and whenever staging isn't possible; the backend
 * then resolves its own packaged binary exactly as before.
 */
const resolveWindowsConfig = (): SandboxRuntimeConfig['windows'] => {
  if (process.platform !== 'win32') return undefined;
  try {
    const source = resolveSrtWinSource(getSrtWinPath);
    const staged = source ? ensureStagedSrtWin(source) : undefined;
    return staged ? { srtWin: { path: staged } } : undefined;
  } catch {
    return undefined;
  }
};

export const createSrtConfig = (input: SandboxPolicy): SandboxRuntimeConfig => {
  const policy = normalizeSandboxPolicy(input);
  const windows = resolveWindowsConfig();

  return {
    ...(windows ? { windows } : {}),
    filesystem: {
      allowRead: [...(policy.readableRoots ?? [])],
      allowWrite: [...policy.writableRoots],
      allowGitConfig: false,
      denyRead: [...(policy.deniedReadRoots ?? [])],
      denyWrite: [...(policy.deniedWriteRoots ?? [])],
    },
    network: {
      allowedDomains: policy.allowNetwork ? [...(policy.allowedNetworkDomains ?? [])] : [],
      allowAllUnixSockets: false,
      allowLocalBinding: false,
      allowUnixSockets: [],
      deniedDomains: [],
      strictAllowlist: true,
    },
    allowAppleEvents: false,
    allowPty: false,
    enableWeakerNestedSandbox: false,
    enableWeakerNetworkIsolation: false,
  };
};
