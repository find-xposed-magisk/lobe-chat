/** Allocation settings for distributing generated tasks across connected providers. */
export interface TaskRecommendationAllocationConfig {
  /** Maximum recommendations generated for one provider. */
  maxPerProvider: number;
  /** Minimum recommendations generated for every provider with usable evidence. */
  minPerProvider: number;
  /** Approximate total recommendations across the onboarding session. */
  targetTotal: number;
}

/** Provider-specific prompt guidance and examples supplied to the recommendation agent. */
export interface TaskRecommendationProviderConfig {
  /** Few-shot examples that demonstrate supported recommendation shapes. */
  examples: string[];
  /** Maximum serialized connector context supplied to one provider agent call. */
  maxContextLength: number;
  /** Product guidance that constrains which provider signals become tasks. */
  principles: string[];
}

/** Shared writing policy applied to every connector recommendation call. */
export interface TaskRecommendationWritingConfig {
  /** Guidance that makes task instructions executable without reopening the source first. */
  instructionPrinciples: string[];
  /** Maximum evidence links retained on one recommendation. */
  maxSourcesPerRecommendation: number;
  /** Guidance that keeps titles distinguishable in large cross-project task lists. */
  titlePrinciples: string[];
}

/** GitHub collection policy for task-oriented repository and contribution signals. */
export interface GitHubTaskRecommendationProviderConfig extends TaskRecommendationProviderConfig {
  /** Maximum GitHub records serialized into one recommendation call. */
  maxSignals: number;
  /** Age after the last push at which an active repository becomes a maintenance candidate. */
  staleAfterDays: number;
}

/** One named Gmail search used to collect a distinct recommendation signal category. */
export interface GmailTaskRecommendationQuery {
  /** Stable category included in diagnostics and the serialized evidence. */
  kind: 'actionable' | 'follow_up_candidate' | 'subscription_cleanup';
  /** Gmail search query executed by the existing connector client. */
  query: string;
}

/** Gmail collection policy for task-oriented message searches. */
export interface GmailTaskRecommendationProviderConfig extends TaskRecommendationProviderConfig {
  /** Maximum deduplicated Gmail records serialized into one recommendation call. */
  maxSignals: number;
  /** Independent Gmail searches run concurrently for this recommendation pass. */
  queries: GmailTaskRecommendationQuery[];
}

/** Complete configurable policy for onboarding task generation. */
export interface TaskRecommendationConfig {
  /** Cross-provider recommendation allocation policy. */
  allocation: TaskRecommendationAllocationConfig;
  /** Provider playbooks keyed by connector identifier. */
  providers: {
    /** GitHub recommendation and collection policy. */
    github: GitHubTaskRecommendationProviderConfig;
    /** Gmail recommendation and collection policy. */
    gmail: GmailTaskRecommendationProviderConfig;
  };
  /** Cross-provider recommendation writing policy. */
  writing: TaskRecommendationWritingConfig;
}

/** Default recommendation policy kept in one injectable configuration object. */
export const defaultTaskRecommendationConfig: TaskRecommendationConfig = {
  allocation: {
    maxPerProvider: 6,
    minPerProvider: 2,
    targetTotal: 9,
  },
  providers: {
    github: {
      examples: [
        'Title: Analyze mobile lifecycle risk in Godot Kirie. Instruction: Work in the background from the linked pull request: inspect the diff, CI state, and review discussion; compare Android and iOS attach-detach behavior with the existing lifecycle; then return a private risk summary, missing-test list, and recommended next step. Do not comment, approve, merge, or push changes.',
        'Title: Prepare the next auv-cli architecture milestone. Instruction: Read the linked issue and related repository activity, turn the proposal into a bounded milestone plan, and return compatibility risks plus the smallest independently reviewable implementation slice. Keep the result as a private plan and do not modify repository state.',
        'Title: Assess maintenance options for the dormant example repository. Instruction: Inspect repository activity, dependency metadata, and CI configuration in the background, then return a prioritized maintenance brief with evidence and an optional patch plan. Do not open issues, create pull requests, or push changes.',
      ],
      maxContextLength: 24_000,
      principles: [
        'Prefer specific repositories, pull requests, and contributions over generic GitHub cleanup.',
        'Do not claim an issue, dependency alert, or failing check exists unless the evidence explicitly says so.',
        'A stale repository is a maintenance opportunity, not proof that work is overdue.',
        'Use the supplied relationship field: authored pull requests favor CI and review-feedback triage; reviewer activity favors independent diff analysis and draft review notes; never assume a role that the evidence does not establish.',
        'Default to read-only GitHub work that returns a private report, checklist, draft, or patch plan. Never comment, submit a review, approve, request changes, merge, close, label, or push unless a later user action explicitly authorizes it.',
      ],
      maxSignals: 24,
      staleAfterDays: 120,
    },
    gmail: {
      examples: [
        'Title: Draft a follow-up for the onboarding design review. Instruction: Work in the background from the supplied thread evidence, summarize the unresolved question and elapsed context, and return a concise follow-up draft for user approval. Do not send it, and do not claim the recipient has not replied unless thread evidence proves it.',
        'Title: Prepare an unsubscribe shortlist for recurring developer newsletters. Instruction: Compare the supplied promotional messages, group repeat senders, and return a private shortlist with evidence and expected inbox impact. Do not unsubscribe, archive, or delete anything.',
        'Title: Triage this month’s account and billing messages. Instruction: Read the supplied important threads, separate actionable items from informational notices, and return a prioritized private checklist with deadlines, uncertainty, and source subjects. Do not reply, forward, archive, or change labels.',
      ],
      maxContextLength: 24_000,
      principles: [
        'Treat sent-message results as follow-up candidates unless thread evidence proves no reply.',
        'Never unsubscribe, send, archive, or delete mail without a later explicit user-approved action.',
        'Prefer direct and important mail over promotions, except for an explicit subscription-cleanup task.',
      ],
      maxSignals: 32,
      queries: [
        { kind: 'actionable', query: 'in:inbox newer_than:30d (is:important OR is:starred)' },
        { kind: 'follow_up_candidate', query: 'in:sent older_than:7d newer_than:90d' },
        {
          kind: 'subscription_cleanup',
          query: 'newer_than:180d (category:promotions OR unsubscribe)',
        },
      ],
    },
  },
  writing: {
    instructionPrinciples: [
      'Write two to four sentences addressed directly to an autonomous agent. State the background work it can perform, the concrete private deliverable it must return, and the completion criteria.',
      'Include enough project, person, or subject context for the Inbox agent to execute the task without guessing which similarly named work item is intended.',
      'Preserve uncertainty from the evidence and state any user approval boundary explicitly.',
      'Prefer tasks that can finish asynchronously without interrupting the user: gather evidence, analyze activity, summarize, compare, prioritize, or prepare a draft, checklist, report, or patch plan.',
      'Minimize clarification requests by making conservative assumptions and recording them in the result. Ask the user only when a consequential choice or new authorization is required.',
      'Do not perform external side effects by default. Email sends, deletion, unsubscribe, archive, label changes, GitHub comments, review submission, approval, merge, close, label, and push operations require a later explicit user-approved action.',
    ],
    maxSourcesPerRecommendation: 4,
    titlePrinciples: [
      'Start with a clear action such as Review, Follow up on, Plan, Prepare, Triage, or Refresh.',
      'Name the concrete project, person, account, or business topic that distinguishes the task in a large team task list.',
      'Avoid source-local shorthand such as a bare feature name; the title must remain understandable before the source badge is read.',
      'Keep pull request numbers and connector mechanics in sources unless the number itself is essential to distinguish the task.',
    ],
  },
};

/** Computes provider budgets from an injectable recommendation policy. */
export class TaskRecommendationConfigurator {
  private readonly allocation: TaskRecommendationAllocationConfig;
  /** Provider-specific collection and prompt policy keyed by connector. */
  readonly providers: TaskRecommendationConfig['providers'];
  /** Shared title, instruction, and source policy for every provider writer. */
  readonly writing: TaskRecommendationWritingConfig;

  constructor(config: TaskRecommendationConfig = defaultTaskRecommendationConfig) {
    this.allocation = config.allocation;
    this.providers = config.providers;
    this.writing = config.writing;
  }

  /**
   * Computes the number of recommendations requested from each connected provider.
   *
   * Use when:
   * - A recommendation workflow has resolved its usable provider count
   * - Product tuning must change totals without a provider-count lookup table
   *
   * Expects:
   * - A positive count of providers participating in this generation
   *
   * Returns:
   * - A rounded fair-share budget clamped to the configured per-provider bounds
   */
  recommendationsPerProvider(providerCount: number): number {
    if (!Number.isInteger(providerCount) || providerCount < 1) return 0;
    const { maxPerProvider, minPerProvider, targetTotal } = this.allocation;
    return Math.min(
      maxPerProvider,
      Math.max(minPerProvider, Math.round(targetTotal / providerCount)),
    );
  }
}
