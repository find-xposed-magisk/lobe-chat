// @ts-check
/**
 * Lock closed issues after 7 days of inactivity
 * @param {object} github - GitHub API client
 * @param {object} context - GitHub Actions context
 */
module.exports = async ({ github, context }) => {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const lockComment = `This issue has been automatically locked since it was closed and has not had any activity for 7 days. If you're experiencing a similar issue, please file a new issue and reference this one if it's relevant.`;

  let page = 1;
  let hasMore = true;
  let totalLocked = 0;

  while (hasMore) {
    // Get closed issues (pagination)
    const { data: issues } = await github.rest.issues.listForRepo({
      owner: context.repo.owner,
      repo: context.repo.repo,
      state: 'closed',
      sort: 'updated',
      direction: 'asc',
      per_page: 100,
      page: page,
    });

    if (issues.length === 0) {
      hasMore = false;
      break;
    }

    for (const issue of issues) {
      // Skip if already locked
      if (issue.locked) continue;

      // Skip pull requests
      if (issue.pull_request) continue;

      // Check if updated more than 7 days ago
      const updatedAt = new Date(issue.updated_at);
      if (updatedAt > sevenDaysAgo) {
        // Since issues are sorted by updated_at ascending,
        // once we hit a recent issue, all remaining will be recent too
        hasMore = false;
        break;
      }

      try {
        // Add comment before locking
        await github.rest.issues.createComment({
          owner: context.repo.owner,
          repo: context.repo.repo,
          issue_number: issue.number,
          body: lockComment,
        });

        // Lock the issue
        await github.rest.issues.lock({
          owner: context.repo.owner,
          repo: context.repo.repo,
          issue_number: issue.number,
          lock_reason: 'resolved',
        });

        totalLocked++;
        console.log(`Locked issue #${issue.number}: ${issue.title}`);
      } catch (error) {
        console.error(`Failed to lock issue #${issue.number}: ${error.message}`);
      }
    }

    page++;
  }

  console.log(`Total issues locked: ${totalLocked}`);
};
