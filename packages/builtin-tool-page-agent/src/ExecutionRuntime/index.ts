import type { InitDocumentArgs } from '@lobechat/editor-runtime';
import type { BuiltinServerRuntimeOutput } from '@lobechat/types';

import type { BashArgs, PageAgentToolState } from '../types';

export interface PageAgentInvocationContext {
  documentId?: string | null;
  operationId?: string;
  stepIndex?: number;
  toolCallId?: string;
  userId?: string;
}

export interface PageAgentApiOutput {
  content: string;
  state: PageAgentToolState;
}

export interface PageAgentRuntimeService {
  bash: (args: BashArgs, ctx: PageAgentInvocationContext) => Promise<PageAgentApiOutput>;
  initPage: (
    args: InitDocumentArgs,
    ctx: PageAgentInvocationContext,
  ) => Promise<PageAgentApiOutput>;
}

const MISSING_DOCUMENT_ID =
  'PageAgent server runtime received a tool call without documentId in context. ' +
  'The conversation must be scoped to an open page editor.';

const DOCUMENT_LOCKED =
  'The page is being edited by another member right now, so nothing was written. ' +
  'Tell the user, or retry the same command later.';

const failure = (message: string, type: string, body?: unknown): BuiltinServerRuntimeOutput => ({
  content: message,
  error: { body, message, type } as unknown,
  success: false,
});

export class PageAgentExecutionRuntime {
  private service: PageAgentRuntimeService;

  constructor(service: PageAgentRuntimeService) {
    this.service = service;
  }

  bash = (args: BashArgs, ctx: PageAgentInvocationContext) =>
    this.dispatch('bash', ctx, () => this.service.bash(args, ctx));

  initPage = (args: InitDocumentArgs, ctx: PageAgentInvocationContext) =>
    this.dispatch('initPage', ctx, () => this.service.initPage(args, ctx));

  private async dispatch(
    apiName: string,
    ctx: PageAgentInvocationContext,
    invoke: () => Promise<PageAgentApiOutput>,
  ): Promise<BuiltinServerRuntimeOutput> {
    if (!ctx.documentId) {
      return failure(MISSING_DOCUMENT_ID, 'PageAgentMissingDocumentId');
    }

    try {
      const output = await invoke();
      return {
        content: output.content,
        state: { documentId: ctx.documentId, ...output.state },
        success: true,
      };
    } catch (error) {
      const err = error as Error & { code?: string };
      if (err.code === 'CONFLICT') {
        return failure(DOCUMENT_LOCKED, 'PageAgentDocumentLocked', err);
      }
      console.error(`[PageAgentExecutionRuntime] ${apiName} error`, err);
      return failure(err.message, 'PageAgentRuntimeError', err);
    }
  }
}
