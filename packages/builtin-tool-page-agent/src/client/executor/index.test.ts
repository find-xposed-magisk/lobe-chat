import type { EditorRuntime } from '@lobechat/editor-runtime';
import type { BuiltinToolContext } from '@lobechat/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as BashModule from '../../bash';
import { PageChangedDuringCommandError } from '../../bash';
import { PageAgentIdentifier } from '../../types';
import { PageAgentExecutor } from './index';

const { invalidateDocumentMutation, runPageBash } = vi.hoisted(() => ({
  invalidateDocumentMutation: vi.fn().mockResolvedValue(undefined),
  runPageBash: vi.fn(),
}));

vi.mock('@/services/document/invalidation', () => ({ invalidateDocumentMutation }));
vi.mock('../../bash', async (importOriginal) => ({
  ...(await importOriginal<typeof BashModule>()),
  runPageBash,
}));

describe('PageAgentExecutor', () => {
  let executor: PageAgentExecutor;
  let runtime: EditorRuntime;
  const context = {} as BuiltinToolContext;

  beforeEach(() => {
    vi.clearAllMocks();
    runtime = {
      getCurrentDocId: vi.fn(() => 'doc-123'),
      getDebugSnapshot: vi.fn(() => ({})),
      isReady: vi.fn(() => true),
    } as unknown as EditorRuntime;
    executor = new PageAgentExecutor(runtime);
  });

  it('exposes the bash and initPage apis', () => {
    expect(executor.identifier).toBe(PageAgentIdentifier);
    expect(executor.hasApi('bash')).toBe(true);
    expect(executor.hasApi('initPage')).toBe(true);
    expect(executor.hasApi('modifyNodes')).toBe(false);
  });

  it('replaces the mounted page from Markdown with initPage', async () => {
    (runtime as any).initPage = vi.fn(async () => ({ extractedTitle: 'Fresh', nodeCount: 2 }));

    const result = await executor.invoke('initPage', { markdown: '# Fresh\n\nbody' }, context);

    expect((runtime as any).initPage).toHaveBeenCalledWith({ markdown: '# Fresh\n\nbody' });
    expect(result).toMatchObject({ state: { changed: true, nodeCount: 2 }, success: true });
  });

  it('runs the command against the mounted editor', async () => {
    runPageBash.mockResolvedValue({ content: 'done', state: { changed: true, exitCode: 0 } });

    const result = await executor.invoke('bash', { command: 'cat /doc.md' }, context);

    expect(runPageBash).toHaveBeenCalledWith(runtime, 'cat /doc.md');
    expect(result).toMatchObject({ content: 'done', state: { changed: true }, success: true });
    expect(result.state).not.toHaveProperty('documentId');
  });

  it('refuses to run while the page editor is not mounted', async () => {
    vi.mocked(runtime.isReady).mockReturnValue(false);

    const result = await executor.invoke('bash', { command: 'cat /doc.md' }, context);

    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('PageEditorNotMounted');
    expect(runPageBash).not.toHaveBeenCalled();
  });

  it('fails the call visibly when the page changed under the command', async () => {
    runPageBash.mockRejectedValue(new PageChangedDuringCommandError());

    const result = await executor.invoke('bash', { command: "sed -i 's/a/b/' /doc.xml" }, context);

    expect(result.success).toBe(false);
    expect(result.stop).toBeUndefined();
    expect(result.error?.type).toBe('PageChangedDuringCommand');
    expect(result.content).toMatch(/nothing was written/i);
  });

  it('reports a thrown error as a failed call', async () => {
    runPageBash.mockRejectedValue(new Error('boom'));

    const result = await executor.invoke('bash', { command: 'true' }, context);

    expect(result.success).toBe(false);
    expect(result.error?.message).toBe('boom');
  });

  describe('onAfterCall', () => {
    it('revalidates the page after a bash call that wrote it', async () => {
      await executor.onAfterCall({
        apiName: 'bash',
        result: { state: { changed: true, documentId: 'doc-123' }, success: true },
      } as any);

      expect(invalidateDocumentMutation).toHaveBeenCalledWith({ documentId: 'doc-123' });
    });

    it('skips a bash call that only read the page', async () => {
      await executor.onAfterCall({
        apiName: 'bash',
        result: { state: { changed: false, documentId: 'doc-123' }, success: true },
      } as any);

      expect(invalidateDocumentMutation).not.toHaveBeenCalled();
    });

    it('skips failed calls', async () => {
      await executor.onAfterCall({
        apiName: 'bash',
        result: { state: { changed: true, documentId: 'doc-123' }, success: false },
      } as any);

      expect(invalidateDocumentMutation).not.toHaveBeenCalled();
    });
  });
});
