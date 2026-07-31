import { describe, expect, it } from 'vitest';

import { TaskRecommendationConfigurator } from './config';

/** @example The default target distributes recommendations without a provider-count table. */
describe('TaskRecommendationConfigurator', () => {
  /** @example 1→6, 2→5, 3→3, and 4→2 recommendations per provider. */
  it('clamps a rounded fair share to configured bounds', () => {
    const configurator = new TaskRecommendationConfigurator();
    expect([1, 2, 3, 4, 8].map((count) => configurator.recommendationsPerProvider(count))).toEqual([
      6, 5, 3, 2, 2,
    ]);
  });

  /** @example No providers means no generation budget. */
  it('returns zero for an invalid provider count', () => {
    expect(new TaskRecommendationConfigurator().recommendationsPerProvider(0)).toBe(0);
  });

  /** @example Default guidance favors private background deliverables over external writes. */
  it('keeps generated work autonomous and behind explicit write boundaries', () => {
    const configurator = new TaskRecommendationConfigurator();
    const writingGuidance = configurator.writing.instructionPrinciples.join('\n');
    const githubGuidance = configurator.providers.github.principles.join('\n');
    const gmailGuidance = configurator.providers.gmail.principles.join('\n');

    expect(writingGuidance).toContain('finish asynchronously');
    expect(writingGuidance).toContain('require a later explicit user-approved action');
    expect(githubGuidance).toContain('authored pull requests');
    expect(githubGuidance).toContain('Never comment, submit a review, approve');
    expect(gmailGuidance).toContain('Never unsubscribe, send, archive, or delete');
  });
});
