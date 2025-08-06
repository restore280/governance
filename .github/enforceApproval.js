// .github/enforceApproval.js
const { Octokit } = require("@octokit/rest");
const core = require("@actions/core");
const fs = require("fs");

(async () => {
  try {
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

    const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");

    // Pull number from the event payload (reliable for pull_request and pull_request_target)
    const payload = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
    const pull_number = payload.pull_request && payload.pull_request.number;
    if (!pull_number) {
      core.setFailed("Could not determine pull request number from event payload.");
      return;
    }

    // Eligible voters: repo collaborators with push permission
    let collaborators = [];
    let page = 1;
    const per_page = 100;
    while (true) {
      const { data } = await octokit.repos.listCollaborators({
        owner,
        repo,
        per_page,
        page,
      });
      collaborators = collaborators.concat(data);
      if (data.length < per_page) break;
      page++;
    }

    const voters = collaborators.filter(c =>
      c.type !== "Bot" &&
      c.permissions &&
      (c.permissions.push === true || c.permissions.maintain === true || c.permissions.admin === true)
    ).map(c => c.login);

    const totalVoters = voters.length;
    const requiredApprovals = Math.ceil(totalVoters / 2);

    // Fetch all reviews for this PR
    let reviews = [];
    page = 1;
    while (true) {
      const { data } = await octokit.pulls.listReviews({
        owner,
        repo,
        pull_number,
        per_page,
        page,
      });
      reviews = reviews.concat(data);
      if (data.length < per_page) break;
      page++;
    }

    // Keep the latest review state per user
    const latestByUser = new Map();
    for (const r of reviews) {
      latestByUser.set(r.user.login, { state: r.state, submitted_at: new Date(r.submitted_at || r.submittedAt || 0) });
    }

    // Count approvals by eligible voters whose latest state is APPROVED
    const approvedUsers = new Set();
    for (const [login, info] of latestByUser.entries()) {
      if (voters.includes(login) && info.state === "APPROVED") {
        approvedUsers.add(login);
      }
    }

    const approvalCount = approvedUsers.size;

    console.log(`Total eligible voters: ${totalVoters}`);
    console.log(`Required approvals: ${requiredApprovals}`);
    console.log(`Current approvals: ${approvalCount}`);
    console.log(`Approvers: ${[...approvedUsers].join(", ")}`);

    if (approvalCount < requiredApprovals) {
      core.setFailed(`Pull request requires at least ${requiredApprovals} approvals from eligible voters; found ${approvalCount}.`);
    } else {
      console.log("Approval requirement met.");
    }
  } catch (error) {
    core.setFailed(`Error enforcing approval requirements: ${error.message}`);
  }
})();
