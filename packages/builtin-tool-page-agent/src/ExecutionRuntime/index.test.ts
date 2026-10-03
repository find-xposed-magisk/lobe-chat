// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import type { PageAgentInvocationContext, PageAgentRuntimeService } from './index';
import { PageAgentExecutionRuntime } from './index';

const DOC_ID = 'doc_test_1';
const ctxWithDoc: PageAgentInvocationContext = { documentId: DOC_ID, userId: 'u1' };
const ctxNoDoc: PageAgentInvocationContext = { userId: 'u1' };

const state = (changed: boolean) => ({ changed, exitCode: 0, output: '', success: true });

const buildService = (bash?: PageAgentRuntimeService['bash']): PageAgentRuntimeService => ({
  bash: vi.fn(bash ?? (async () => ({ content: 'ok', state: state(false) }))),
  initPage: vi.fn(async () => ({
    content: 'initialized',
    state: { changed: true, nodeCount: 1, rootId: 'root' },
  })),
});

describe('PageAgentExecutionRuntime', () => {
  it('rejects a call without documentId and never reaches the service', async () => {
    const service = buildService();
    const runtime = new PageAgentExecutionRuntime(service);

    const result = await runtime.bash({ command: 'cat /doc.md' }, ctxNoDoc);

    expect(result.success).toBe(false);
    expect((result.error as { type?: string }).type).toBe('PageAgentMissingDocumentId');
    expect(service.bash).not.toHaveBeenCalled();
  });

  it('forwards the command with context and envelopes the output with documentId', async () => {
    const service = buildService(async () => ({ content: 'changed', state: state(true) }));
    const runtime = new PageAgentExecutionRuntime(service);

    const result = await runtime.bash({ command: 'sed -i s/a/b/ /doc.xml' }, ctxWithDoc);

    expect(service.bash).toHaveBeenCalledWith({ command: 'sed -i s/a/b/ /doc.xml' }, ctxWithDoc);
    expect(result.success).toBe(true);
    expect(result.content).toBe('changed');
    expect(result.state).toMatchObject({ changed: true, documentId: DOC_ID });
  });

  it('wraps thrown service errors as PageAgentRuntimeError', async () => {
    const runtime = new PageAgentExecutionRuntime(
      buildService(async () => {
        throw new Error('boom');
      }),
    );

    const result = await runtime.bash({ command: 'true' }, ctxWithDoc);

    expect(result.success).toBe(false);
    expect(result.content).toBe('boom');
    expect((result.error as { type?: string }).type).toBe('PageAgentRuntimeError');
  });

  it('explains a document lock conflict in words the model can act on', async () => {
    const runtime = new PageAgentExecutionRuntime(
      buildService(async () => {
        throw Object.assign(new Error('Document is being edited by another user'), {
          code: 'CONFLICT',
        });
      }),
    );

    const result = await runtime.bash({ command: 'true' }, ctxWithDoc);

    expect(result.success).toBe(false);
    expect((result.error as { type?: string }).type).toBe('PageAgentDocumentLocked');
    expect(result.content).toMatch(/another member/);
    expect(result.content).toMatch(/nothing was written/i);
  });

  it('forwards initPage to the service', async () => {
    const service = buildService();
    const runtime = new PageAgentExecutionRuntime(service);

    const result = await runtime.initPage({ markdown: '# Hi' }, ctxWithDoc);

    expect(service.initPage).toHaveBeenCalledWith({ markdown: '# Hi' }, ctxWithDoc);
    expect(result).toMatchObject({ content: 'initialized', success: true });
  });
});
