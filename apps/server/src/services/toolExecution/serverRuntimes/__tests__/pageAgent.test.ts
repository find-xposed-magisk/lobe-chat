// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { pageAgentRuntime } from '../pageAgent';

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  runWithDocumentLock: vi.fn(),
  updateDocument: vi.fn(),
}));

vi.mock('@/database/models/document', () => ({
  DocumentModel: class {
    findById = mocks.findById;
  },
}));
vi.mock('@/server/services/document', () => ({
  DocumentService: class {
    runWithDocumentLock = mocks.runWithDocumentLock;
    updateDocument = mocks.updateDocument;
  },
}));

const ctx = { documentId: 'doc_1', userId: 'u1' };

const createRuntime = () =>
  pageAgentRuntime.factory({ serverDB: {} as any, toolManifestMap: {}, userId: 'u1' }) as {
    bash: (args: { command: string }, context: typeof ctx) => Promise<any>;
    initPage: (args: { markdown: string }, context: typeof ctx) => Promise<any>;
  };

describe('pageAgentRuntime bash', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findById.mockResolvedValue({ content: 'para one\n', editorData: null, title: 'Page' });
    mocks.runWithDocumentLock.mockImplementation((_id, fn) => fn('owner_1'));
  });

  it('holds the document lock but writes nothing for a read-only command', async () => {
    const result = await createRuntime().bash({ command: 'cat /doc.xml' }, ctx);

    expect(result.success).toBe(true);
    expect(result.content).toContain('para one');
    expect(mocks.runWithDocumentLock).toHaveBeenCalledWith('doc_1', expect.any(Function));
    expect(mocks.updateDocument).not.toHaveBeenCalled();
  });

  it('persists an edit as an llm_call save under the lock owner', async () => {
    const result = await createRuntime().bash(
      { command: "sed -i 's/para one/para ONE/' /doc.xml" },
      ctx,
    );

    expect(result.state).toMatchObject({ changed: true, documentId: 'doc_1' });
    expect(result.state).not.toHaveProperty('documentEditorData');
    expect(mocks.updateDocument).toHaveBeenCalledWith(
      'doc_1',
      expect.objectContaining({
        content: expect.stringContaining('para ONE'),
        lockOwnerId: 'owner_1',
        saveSource: 'llm_call',
      }),
    );
  });

  it('persists only the title when only /title changes', async () => {
    await createRuntime().bash({ command: "echo 'Renamed' > /title" }, ctx);

    expect(mocks.updateDocument).toHaveBeenCalledWith(
      'doc_1',
      expect.not.objectContaining({ editorData: expect.anything() }),
    );
    expect(mocks.updateDocument.mock.calls[0][1]).toMatchObject({ title: 'Renamed' });
  });

  it('still answers a read-only command while another member holds the lock', async () => {
    mocks.runWithDocumentLock.mockRejectedValue(
      Object.assign(new Error('Document is being edited by another user'), { code: 'CONFLICT' }),
    );

    const result = await createRuntime().bash({ command: 'cat /doc.xml' }, ctx);

    expect(result.success).toBe(true);
    expect(result.content).toContain('para one');
    expect(mocks.updateDocument).not.toHaveBeenCalled();
  });

  it('reports a lock conflict for a write without saving it', async () => {
    mocks.runWithDocumentLock.mockRejectedValue(
      Object.assign(new Error('Document is being edited by another user'), { code: 'CONFLICT' }),
    );

    const result = await createRuntime().bash(
      { command: "sed -i 's/para one/para ONE/' /doc.xml" },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.error.type).toBe('PageAgentDocumentLocked');
    expect(mocks.updateDocument).not.toHaveBeenCalled();
  });

  it('replaces the page from Markdown with initPage and saves it as an llm_call', async () => {
    const result = await createRuntime().initPage({ markdown: '# Fresh\n\nnew body' }, ctx);

    expect(result.success).toBe(true);
    expect(result.state).toMatchObject({ changed: true, documentId: 'doc_1' });
    expect(mocks.updateDocument).toHaveBeenCalledWith(
      'doc_1',
      expect.objectContaining({
        content: expect.stringContaining('new body'),
        saveSource: 'llm_call',
        title: 'Fresh',
      }),
    );
  });
});
