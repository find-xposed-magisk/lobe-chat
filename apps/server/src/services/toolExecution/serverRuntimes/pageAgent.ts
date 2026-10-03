import { PageAgentIdentifier, type PageAgentToolState } from '@lobechat/builtin-tool-page-agent';
import { runPageBash } from '@lobechat/builtin-tool-page-agent/bash';
import {
  PageAgentExecutionRuntime,
  type PageAgentInvocationContext,
  type PageAgentRuntimeService,
} from '@lobechat/builtin-tool-page-agent/executionRuntime';
import { EditorRuntime } from '@lobechat/editor-runtime';
import { createHeadlessEditor, type HeadlessEditor } from '@lobehub/editor/headless';
import type { SerializedEditorState, SerializedLexicalNode } from 'lexical';

import { DocumentModel } from '@/database/models/document';
import { type LobeChatDatabase } from '@/database/type';
import { isValidEditorData } from '@/libs/editor/isValidEditorData';
import { DocumentService } from '@/server/services/document';

import type { ServerRuntimeRegistration } from './types';

type SerializedEditor = SerializedEditorState<SerializedLexicalNode>;

type EditorRuntimeEditorParam = Parameters<EditorRuntime['setEditor']>[0];

interface DocumentSnapshot {
  content: string;
  editorData: Record<string, unknown> | null;
  title: string;
}

interface InvocationEnv {
  getTitle: () => string;
  headless: HeadlessEditor;
  runtime: EditorRuntime;
  setTitle: (title: string) => void;
  snapshot: DocumentSnapshot;
}

/**
 * Cheap, dependency-free fingerprint used only to detect whether a mutation
 * actually changed the document body. Collisions are tolerated — at worst we
 * miss a silent-failure warning; we never lose persistence.
 */
const hashEditorData = (data: unknown): string => {
  const json = JSON.stringify(data ?? null);
  let hash = 5381;
  for (let i = 0; i < json.length; i++) {
    hash = (hash * 33) ^ json.charCodeAt(i);
  }
  return `${json.length}:${(hash >>> 0).toString(16)}`;
};

interface InvariantFlags {
  editorChanged: boolean;
  handlerReportedChange: boolean;
  titleChanged: boolean;
}

interface InvariantViolation {
  apiName: string;
  detail: string;
  kind: 'silent-no-op' | 'unexpected-mutation';
}

const detectHandlerReportedChange = (state: PageAgentToolState): boolean => state.changed === true;

const detectInvariantViolation = (
  apiName: string,
  flags: InvariantFlags,
): InvariantViolation | undefined => {
  if (flags.handlerReportedChange && !flags.editorChanged && !flags.titleChanged) {
    return {
      apiName,
      detail: 'Handler reported successful mutation but exported editorData hash did not change.',
      kind: 'silent-no-op',
    };
  }

  if (!flags.handlerReportedChange && flags.editorChanged) {
    return {
      apiName,
      detail: 'Editor state changed even though handler did not report any successful change.',
      kind: 'unexpected-mutation',
    };
  }

  return undefined;
};

interface PageAgentServiceContext {
  documentModel: DocumentModel;
  documentService: DocumentService;
}

const loadSnapshot = async (
  documentModel: DocumentModel,
  documentId: string,
): Promise<DocumentSnapshot> => {
  const doc = await documentModel.findById(documentId);
  if (!doc) {
    throw new Error(`Page document not found: ${documentId}`);
  }
  return {
    content: doc.content ?? '',
    editorData: (doc.editorData ?? null) as Record<string, unknown> | null,
    title: doc.title ?? 'Untitled',
  };
};

const buildEnv = (snapshot: DocumentSnapshot, documentId: string): InvocationEnv => {
  const headless = createHeadlessEditor();
  let title = snapshot.title;

  if (isValidEditorData(snapshot.editorData)) {
    headless.hydrateEditorData(snapshot.editorData as unknown as SerializedEditor, {
      keepId: true,
    });
  } else if (snapshot.content.trim().length > 0) {
    headless.hydrateMarkdown(snapshot.content, { keepId: true });
  }
  // Otherwise leave the headless editor in its default empty state.

  const runtime = new EditorRuntime();
  // `headless.kernel` is structurally `IEditor`; pnpm may resolve `@lobehub/editor`
  // to a different copy here than `@lobechat/editor-runtime` does, making the two
  // `IEditor` types nominally distinct. They are runtime-identical — bridge via
  // unknown to keep the contract explicit.
  runtime.setEditor(headless.kernel as unknown as EditorRuntimeEditorParam);
  runtime.setCurrentDocId(documentId);
  // `EditorRuntime` dispatches `LITEXML_*_COMMAND` (imported from the DOM-free
  // `@lobehub/editor/litexml-commands` subpath) straight onto the kernel. The
  // headless bundle's `LitexmlPlugin` registers its listeners against the same
  // single command identities, so the dispatch lands without any adapter.
  runtime.setTitleHandlers(
    (next) => {
      title = next;
    },
    () => title,
  );

  return {
    getTitle: () => title,
    headless,
    runtime,
    setTitle: (next) => {
      title = next;
    },
    snapshot,
  };
};

interface HandlerOutput {
  content: string;
  state: PageAgentToolState;
}

const withEditor = async (
  { documentModel, documentService }: PageAgentServiceContext,
  apiName: string,
  ctx: PageAgentInvocationContext,
  handler: (env: InvocationEnv) => Promise<HandlerOutput>,
): Promise<HandlerOutput> => {
  const documentId = ctx.documentId;
  if (!documentId) {
    throw new Error('documentId is required');
  }

  const run = async (persist: boolean, lockOwnerId?: string): Promise<HandlerOutput> => {
    const snapshot = await loadSnapshot(documentModel, documentId);
    const env = buildEnv(snapshot, documentId);

    try {
      const beforeHash = hashEditorData(env.headless.export().editorData);

      const handlerResult = await handler(env);

      const exported = env.headless.export();
      const titleChanged = env.getTitle() !== snapshot.title;
      const editorChanged = beforeHash !== hashEditorData(exported.editorData);

      const invariantViolation = detectInvariantViolation(apiName, {
        editorChanged,
        handlerReportedChange: detectHandlerReportedChange(handlerResult.state),
        titleChanged,
      });

      if (invariantViolation) {
        console.warn(
          `[PageAgentServerRuntime] invariant violation in ${apiName}:`,
          invariantViolation,
          { documentId, operationId: ctx.operationId, toolCallId: ctx.toolCallId },
        );
      }

      if (persist && (editorChanged || titleChanged)) {
        await documentService.updateDocument(documentId, {
          ...(editorChanged && {
            content: exported.markdown,
            editorData: exported.editorData as unknown as Record<string, unknown>,
          }),
          ...(lockOwnerId ? { lockOwnerId } : {}),
          saveSource: 'llm_call',
          ...(titleChanged && { title: env.getTitle() }),
        });
      }

      return {
        content: handlerResult.content,
        state: {
          ...handlerResult.state,
          ...(invariantViolation ? { invariantViolation } : {}),
        },
      };
    } finally {
      env.headless.destroy();
    }
  };

  // Whether a command writes is only known after it runs, so it first runs
  // under the collaborative edit lock. While another member holds the lock it
  // reruns without saving: reads still answer, writes surface the CONFLICT.
  try {
    return await documentService.runWithDocumentLock(documentId, (lockOwnerId) =>
      run(true, lockOwnerId),
    );
  } catch (error) {
    if ((error as { code?: string }).code !== 'CONFLICT') throw error;
    const unsaved = await run(false);
    if (unsaved.state.changed) throw error;
    return unsaved;
  }
};

const buildService = (
  db: LobeChatDatabase,
  userId: string,
  workspaceId?: string,
): PageAgentRuntimeService => {
  const documentModel = new DocumentModel(db, userId, workspaceId);
  const documentService = new DocumentService(db, userId, workspaceId);
  const serviceCtx: PageAgentServiceContext = { documentModel, documentService };

  return {
    bash: (args, ctx) =>
      withEditor(serviceCtx, 'bash', ctx, ({ runtime }) => runPageBash(runtime, args.command)),
    initPage: (args, ctx) =>
      withEditor(serviceCtx, 'initPage', ctx, async ({ runtime }) => {
        const { extractedTitle, nodeCount } = await runtime.initPage(args);
        return {
          content: extractedTitle
            ? `Page replaced with ${nodeCount} blocks; title set to "${extractedTitle}".`
            : `Page replaced with ${nodeCount} blocks.`,
          state: { changed: true, nodeCount, rootId: 'root' },
        };
      }),
  };
};

export const pageAgentRuntime: ServerRuntimeRegistration = {
  factory: (context) => {
    if (!context.userId || !context.serverDB) {
      throw new Error('userId and serverDB are required for Page Agent execution');
    }
    return new PageAgentExecutionRuntime(
      buildService(context.serverDB, context.userId, context.workspaceId),
    );
  },
  identifier: PageAgentIdentifier,
};
