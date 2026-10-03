import type { EditorRuntime, InitDocumentArgs } from '@lobechat/editor-runtime';
import type { BuiltinToolResult, ToolAfterCallContext } from '@lobechat/types';
import { BaseExecutor } from '@lobechat/types';
import debug from 'debug';

import { PageChangedDuringCommandError, runPageBash } from '../../bash';
import type { BashArgs } from '../../types';
import { PageAgentIdentifier } from '../../types';

const log = debug('lobe-page-agent:executor');

const PageAgentApiName = {
  bash: 'bash',
  initPage: 'initPage',
} as const;

const getRuntimeDebugSnapshot = (runtime: EditorRuntime) => {
  const candidate = runtime as EditorRuntime & {
    getDebugSnapshot?: () => unknown;
  };

  return candidate.getDebugSnapshot?.();
};

const PAGE_EDITOR_NOT_MOUNTED_MESSAGE =
  'Page editor is not currently mounted. This topic was started in the page editor, but the editor is not active in the current view. ' +
  'Do not retry bash or initPage here — they require a mounted editor. ' +
  'To read or modify the topic document, use lobe-agent-documents (readDocument / replaceDocumentContent / modifyNodes).';

class PageAgentExecutor extends BaseExecutor<typeof PageAgentApiName> {
  readonly identifier = PageAgentIdentifier;
  protected readonly apiEnum = PageAgentApiName;

  private runtime: EditorRuntime;

  constructor(runtime: EditorRuntime) {
    super();
    this.runtime = runtime;
  }

  // scope is topic-bound, not route-bound: navigating away from the page editor
  // keeps scope==='page' on the same topic, so without this guard the LLM could
  // still edit a stale editor ref.
  private notMounted = (apiName: string): BuiltinToolResult | undefined => {
    if (this.runtime.isReady()) return;
    console.warn('[PageAgentToolCall] blocked: editor not mounted', {
      apiName,
      runtime: getRuntimeDebugSnapshot(this.runtime),
    });
    return {
      content: PAGE_EDITOR_NOT_MOUNTED_MESSAGE,
      error: {
        body: {
          apiName,
          code: 'PAGE_EDITOR_NOT_MOUNTED',
          kind: 'replan',
          runtime: getRuntimeDebugSnapshot(this.runtime),
        },
        message: PAGE_EDITOR_NOT_MOUNTED_MESSAGE,
        type: 'PageEditorNotMounted',
      },
      success: false,
    };
  };

  private fail = (apiName: string, error: unknown): BuiltinToolResult => {
    const err = error as Error;
    if (error instanceof PageChangedDuringCommandError) {
      return {
        content: err.message,
        error: { message: err.message, type: 'PageChangedDuringCommand' },
        success: false,
      };
    }
    console.error(`[PageAgentToolCall] ${apiName}:error`, err);
    return {
      error: { body: error, message: err.message, type: 'PluginServerError' },
      success: false,
    };
  };

  // Runs in the renderer when the client runtime executes tools locally;
  // gateway runs go through the server runtime instead. No documentId in state:
  // the mounted editor already holds these edits and saves them itself, and
  // revalidating would let a stale server row win.
  bash = async ({ command }: BashArgs): Promise<BuiltinToolResult> => {
    const blocked = this.notMounted(PageAgentApiName.bash);
    if (blocked) return blocked;

    try {
      const { content, state } = await runPageBash(this.runtime, command);
      return { content, state, success: true };
    } catch (error) {
      return this.fail(PageAgentApiName.bash, error);
    }
  };

  initPage = async (params: InitDocumentArgs): Promise<BuiltinToolResult> => {
    const blocked = this.notMounted(PageAgentApiName.initPage);
    if (blocked) return blocked;

    try {
      const { extractedTitle, nodeCount } = await this.runtime.initPage(params);
      return {
        content: extractedTitle
          ? `Page replaced with ${nodeCount} blocks; title set to "${extractedTitle}".`
          : `Page replaced with ${nodeCount} blocks.`,
        state: { changed: true, nodeCount, rootId: 'root' },
        success: true,
      };
    } catch (error) {
      return this.fail(PageAgentApiName.initPage, error);
    }
  };

  // Revalidating the editor SWR key routes the saved row through
  // DocumentStore.reconcileRemote, the single place that decides whether the
  // mounted editor adopts it; pushing a snapshot into the editor here would
  // hydrate twice and mark the store dirty in between.
  onAfterCall = async ({ apiName, result }: ToolAfterCallContext): Promise<void> => {
    if (!result.success || !this.hasApi(apiName)) return;

    const state = result.state as { changed?: unknown; documentId?: unknown } | undefined | null;
    if (state?.changed !== true) return;
    const documentId = typeof state.documentId === 'string' ? state.documentId : undefined;
    if (!documentId) return;

    try {
      const { invalidateDocumentMutation } = await import('@/services/document/invalidation');
      await invalidateDocumentMutation({ documentId });
    } catch (error) {
      log('[PageAgentExecutor] document revalidation failed', error);
    }
  };
}

export { PageAgentExecutor };
