import {
  type AgentState,
  type ContextBuildOutput,
  type GeneralAgentCallLLMResultPayload,
  type InstructionExecutionResult,
  type LLMTransport,
  type LLMTurnAttemptInput,
  type LLMTurnErrorInput,
  type LLMTurnFinalizeInput,
  type LLMTurnRetryInput,
  type LLMTurnSession,
  resolveLLMMaxAttempts,
  resolveLLMRetryBudget,
} from '@lobechat/agent-runtime';
import { BRANDING_PROVIDER } from '@lobechat/business-const';
import { ModelEmptyError } from '@lobechat/model-runtime';
import {
  context as otelContext,
  SpanKind,
  SpanStatusCode,
  trace as otelTrace,
} from '@lobechat/observability-otel/api';
import {
  buildChatRequestAttributes,
  buildChatResponseAttributes,
  chatSpanName,
  tracer as agentRuntimeTracer,
} from '@lobechat/observability-otel/modules/agent-runtime';

import { type RuntimeExecutorContext } from '../context';
import { log, sleep } from '../executorHelpers';
import { classifyLLMError } from '../llmErrorClassification';
import {
  finalizeServerCallLlmResult,
  persistInterruptedServerCallLlmResult,
} from './serverCallLlmFinalizer';

interface ServerCallLlmExecutionContext {
  assistantMessage: { id: string };
  context: ContextBuildOutput;
  model: string;
  provider: string;
  runAttempt: NonNullable<LLMTransport['runAttempt']>;
  state: AgentState;
  stepLabel?: string;
}

const SERVER_LLM_RETRY_POLICY = {
  isEmptyCompletionError: (error: unknown) => error instanceof ModelEmptyError,
  noRetryProviders: [BRANDING_PROVIDER],
};

class ServerCallLlmTurnSession implements LLMTurnSession {
  readonly maxAttempts: number;

  private readonly chatContext: ReturnType<typeof otelTrace.setSpan>;
  private readonly chatSpan: ReturnType<typeof agentRuntimeTracer.startSpan>;
  private firstChunkAt?: number;
  private readonly llmStartTime = Date.now();
  private readonly operationLogId: string;

  constructor(
    private readonly ctx: RuntimeExecutorContext,
    private readonly prepared: ServerCallLlmExecutionContext,
  ) {
    const { context, model, provider, state } = prepared;
    const processedMessages = context.messages as Array<{ role?: string }>;

    if (!context.resolvedTools) {
      throw new Error('Resolved tools are required for a server LLM turn');
    }
    if (!processedMessages.some((message) => message.role !== 'system')) {
      throw new Error(
        `call_llm produced no non-system messages for ${provider}/${model} ` +
          `(topic=${state.metadata?.topicId ?? 'n/a'}, step=${ctx.stepIndex}); refusing to dispatch`,
      );
    }

    this.operationLogId = `${ctx.operationId}:${ctx.stepIndex}`;
    this.maxAttempts = resolveLLMMaxAttempts(provider, SERVER_LLM_RETRY_POLICY);
    log(
      '[%s][call_llm] Starting operation with prepared assistant message: %s',
      this.operationLogId,
      prepared.assistantMessage.id,
    );

    this.chatSpan = agentRuntimeTracer.startSpan(chatSpanName(model), {
      attributes: buildChatRequestAttributes({
        conversationId: state.metadata?.topicId,
        operationId: ctx.operationId,
        provider,
        requestModel: model,
        stepIndex: ctx.stepIndex,
        stream: ctx.stream ?? true,
      }),
      kind: SpanKind.CLIENT,
    });
    this.chatContext = otelTrace.setSpan(otelContext.active(), this.chatSpan);
  }

  classifyError(error: unknown) {
    return classifyLLMError(error);
  }

  close(error?: unknown) {
    if (error) {
      this.chatSpan.recordException(error as Error);
      this.chatSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    this.chatSpan.end();
  }

  async finalize({ events, output }: LLMTurnFinalizeInput): Promise<InstructionExecutionResult> {
    return otelContext.with(this.chatContext, async () => {
      const { ctx, prepared } = this;
      const { operationId, stepIndex, streamManager } = ctx;
      const { assistantMessage, model, provider, state, stepLabel } = prepared;
      const {
        answerSalvagedFromReasoning,
        finishReason,
        grounding,
        imageList,
        speed,
        thinkingContent,
        toolCalls,
        toolsCalling,
        usage,
      } = output;

      events.push({
        result: {
          content: output.content,
          finishReason,
          reasoning: thinkingContent,
          tool_calls: toolCalls,
          usage,
        },
        type: 'llm_result',
      });

      await streamManager.publishStreamEvent(operationId, {
        data: {
          finalContent: output.content,
          grounding,
          ...(stepLabel && { stepLabel }),
          imageList: imageList.length > 0 ? imageList : undefined,
          reasoning: thinkingContent || undefined,
          toolsCalling,
          usage,
        },
        stepIndex,
        type: 'stream_end',
      });

      let visibleOutputEndPublishedStepIndex: number | undefined;
      const canPublishEarlyFinalAnswerVisibleEnd =
        ctx.allowEarlyFinalAnswerVisibleOutputEnd ?? true;
      if (
        canPublishEarlyFinalAnswerVisibleEnd &&
        toolsCalling.length === 0 &&
        toolCalls.length === 0
      ) {
        try {
          await streamManager.publishStreamEvent(operationId, {
            data: { reason: 'final_answer' },
            stepIndex,
            type: 'visible_output_end',
          });
          visibleOutputEndPublishedStepIndex = stepIndex;
        } catch (error) {
          console.error('Failed to publish visible_output_end:', error);
        }
      }

      log('[%s:%d] call_llm completed', operationId, stepIndex);
      const newState = await finalizeServerCallLlmResult({
        answerSalvagedFromReasoning,
        assistantMessageId: assistantMessage.id,
        currentStepSpeed: speed,
        currentStepUsage: usage,
        grounding,
        imageList,
        messageModel: ctx.messageModel,
        model,
        provider,
        shouldReplayAssistantReasoning: prepared.context.replayAssistantReasoning,
        state,
        stepLabel,
        streamOutput: output,
        toolCalls,
        toolsCalling,
        visibleOutputEndPublishedStepIndex,
      });

      this.chatSpan.setAttributes(
        buildChatResponseAttributes({
          cacheReadInputTokens: usage?.inputCachedTokens,
          finishReasons: finishReason ? [finishReason] : undefined,
          inputTokens: usage?.totalInputTokens,
          outputTokens: usage?.totalOutputTokens,
          reasoningOutputTokens: usage?.outputReasoningTokens,
          timeToFirstChunkMs: this.firstChunkAt,
        }),
      );

      return {
        events,
        newState,
        nextContext: {
          payload: {
            hasToolsCalling: toolsCalling.length > 0,
            parentMessageId: assistantMessage.id,
            result: { content: output.content, tool_calls: toolCalls },
            toolsCalling,
          } as GeneralAgentCallLLMResultPayload,
          phase: 'llm_result' as const,
          session: {
            eventCount: events.length,
            messageCount: newState.messages.length,
            sessionId: operationId,
            status: 'running' as const,
            stepCount: state.stepCount + 1,
          },
          stepUsage: usage,
        },
      };
    });
  }

  async handleError({ error, events, interrupted, output, retryBudget }: LLMTurnErrorInput) {
    await otelContext.with(this.chatContext, async () => {
      if (error instanceof ModelEmptyError && error.diagnostics) {
        error.diagnostics.retryBudget = retryBudget;
        error.diagnostics.retryEvents = events
          .filter((event) => event.type === 'stream_retry')
          .map((event) => event.data);
      }

      if (interrupted && output) {
        await persistInterruptedServerCallLlmResult({
          assistantMessageId: this.prepared.assistantMessage.id,
          currentStepSpeed: output.speed,
          currentStepUsage: output.usage,
          messageModel: this.ctx.messageModel,
          operationLogId: this.operationLogId,
          streamOutput: output,
          toolsCalling: output.toolsCalling,
        });
      }

      console.error(
        `[StreamingLLMExecutor][${this.ctx.operationId}:${this.ctx.stepIndex}] LLM execution failed:`,
        error,
      );
    });
  }

  resolveRetryBudget(error: unknown) {
    return resolveLLMRetryBudget(this.prepared.provider, error, SERVER_LLM_RETRY_POLICY);
  }

  onRetry({ attempt, delayMs, error, maxAttempts }: LLMTurnRetryInput) {
    log(
      '[%s] LLM call failed with kind=%s (attempt %d/%d), retrying in %dms ...',
      this.operationLogId,
      error.kind,
      attempt,
      maxAttempts,
      delayMs,
    );
  }

  runAttempt({ attempt, events }: LLMTurnAttemptInput) {
    return otelContext.with(this.chatContext, () =>
      this.prepared.runAttempt({
        attempt,
        context: this.prepared.context,
        events,
        maxAttempts: this.maxAttempts,
        model: this.prepared.model,
        onFirstChunk: () => {
          if (this.firstChunkAt === undefined) {
            this.firstChunkAt = Date.now() - this.llmStartTime;
          }
        },
        provider: this.prepared.provider,
        state: this.prepared.state,
      }),
    );
  }

  async waitForRetry(delayMs: number): Promise<void> {
    await sleep(delayMs);
  }
}

export const openServerCallLlmTurn = (
  ctx: RuntimeExecutorContext,
  prepared: ServerCallLlmExecutionContext,
): LLMTurnSession => new ServerCallLlmTurnSession(ctx, prepared);
