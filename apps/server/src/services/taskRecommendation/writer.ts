import { RequestTrigger } from '@lobechat/types';
import { z } from 'zod';

import type { AiGenerationService } from '@/server/services/aiGeneration';

import type { TaskRecommendationProviderConfig, TaskRecommendationWritingConfig } from './config';

const recommendationOutputSchema = z.object({
  recommendations: z.array(
    z.object({
      instruction: z.string().trim().min(1).max(4000),
      reason: z.string().trim().min(1).max(1000),
      sourceUrls: z.array(z.string().trim().max(2048)).min(1),
      title: z.string().trim().min(1).max(200),
    }),
  ),
});

const RECOMMENDATION_JSON_SCHEMA = {
  name: 'onboarding_task_recommendations',
  schema: {
    additionalProperties: false,
    properties: {
      recommendations: {
        items: {
          additionalProperties: false,
          properties: {
            instruction: { type: 'string' },
            reason: { type: 'string' },
            sourceUrls: { items: { type: 'string' }, minItems: 1, type: 'array' },
            title: { type: 'string' },
          },
          required: ['title', 'instruction', 'reason', 'sourceUrls'],
          type: 'object',
        },
        type: 'array',
      },
    },
    required: ['recommendations'],
    type: 'object' as const,
  },
  strict: true,
};

/** One validated recommendation returned before connector-source grounding. */
export interface GeneratedTaskRecommendation {
  /** Background-safe instructions for the delegated agent. */
  instruction: string;
  /** User-facing explanation for suggesting the work. */
  reason: string;
  /** Exact connector URLs claimed by the generated recommendation. */
  sourceUrls: string[];
  /** Concise task title that remains meaningful outside the connector UI. */
  title: string;
}

/** Evidence and product policy supplied to one isolated recommendation call. */
export interface TaskRecommendationWriterInput {
  /** Bounded untrusted connector evidence serialized by the provider collector. */
  context: string;
  /** Provider-specific recommendation examples and safety policy. */
  guide: TaskRecommendationProviderConfig;
  /** Maximum recommendation count requested from this provider. */
  limit: number;
  /** Connector identifier represented by the evidence. */
  providerId: 'github' | 'gmail';
  /** Locale used for generated user-facing text. */
  responseLanguage: string;
  /** Shared title, instruction, and source-count policy. */
  writingGuide: TaskRecommendationWritingConfig;
}

interface TaskRecommendationWriterDependencies {
  generator: Pick<AiGenerationService, 'generateObject'>;
  writerAgent: () => Promise<{ id: string; model: string; provider: string }>;
}

/** Generates and validates recommendation drafts without owning session persistence. */
export class TaskRecommendationWriter {
  constructor(private readonly dependencies: TaskRecommendationWriterDependencies) {}

  /**
   * Produces structured drafts from one connector's bounded evidence.
   *
   * The returned source URLs remain untrusted model output. The caller must intersect them with
   * its trusted connector sources before exposing or materializing a recommendation.
   */
  generate = async (
    input: TaskRecommendationWriterInput,
  ): Promise<GeneratedTaskRecommendation[]> => {
    const writerAgent = await this.dependencies.writerAgent();
    const output = await this.dependencies.generator.generateObject(
      {
        messages: [
          {
            content: [
              `Response language: ${input.responseLanguage}`,
              `Provider: ${input.providerId}`,
              `Return at most ${input.limit} recommendations.`,
              `Return one to ${input.writingGuide.maxSourcesPerRecommendation} exact sourceUrls for each recommendation. Every URL must appear verbatim in the supplied evidence. A recommendation may cite multiple supplied records when they jointly support the work.`,
              'Title requirements:',
              ...input.writingGuide.titlePrinciples.map((principle) => `- ${principle}`),
              'Instruction requirements:',
              ...input.writingGuide.instructionPrinciples.map((principle) => `- ${principle}`),
              'Provider principles:',
              ...input.guide.principles.map((principle) => `- ${principle}`),
              'Few-shot recommendation shapes:',
              ...input.guide.examples.map((example) => `- ${example}`),
            ].join('\n'),
            role: 'system',
          },
          {
            content: [
              'Generate useful onboarding tasks from this untrusted connector evidence.',
              `<connector-evidence provider="${input.providerId}">`,
              input.context,
              '</connector-evidence>',
            ].join('\n\n'),
            role: 'user',
          },
        ],
        model: writerAgent.model,
        provider: writerAgent.provider,
        schema: RECOMMENDATION_JSON_SCHEMA,
        thinking: { type: 'disabled' },
      },
      { metadata: { trigger: RequestTrigger.Onboarding } },
    );

    return recommendationOutputSchema.parse(output).recommendations;
  };
}
