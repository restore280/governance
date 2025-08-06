// .github/enforceApproval.js
const { Octokit } = require("@octokit/rest");
const core = require("@actions/core");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

function loadVoterConfig(cwd) {
  const candidates = ["voters.yml", "voters.yaml"];
  for (const name of candidates) {
    const p = path.join(cwd, name);
    if (fs.existsSync(p)) {
      try {
        const cfg = yaml.load(fs.readFileSync(p, "utf8")) || {};
        return cfg;
      } catch (e) {
        core.warning(`Could not parse ${name}: ${e.message}`);
      }
    }
  }
  return {};
}

(async () => {
  try {
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");

    // Load event payload for PR number and author
    const payload = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
    const pr = payload.pull_request;
    if (!pr) {
      core.setFailed("This workflow must run on a pull_request event.");
      return;
    }
    const pull_number = pr.number;
    const prAuthor = (pr.user && pr.user.login) ? pr.user.login : "";
    const prAuthorLC = prAuthor.toLowerCase();

    // Load voters.yml from current working directory (the workflow sets working-directory: .github)
    const cfg = loadVoterConfig(process.cwd());

    // Build voter list (YAML > env var > collaborators)
    let voters = Array.isArray(cfg.voters) ? cfg.voters : [];
    const votersCSV = (process.env.VOTERS_CSV || "").trim();
    if (voters.length === 0 && votersCSV) {
      voters = votersCSV.split(",").map(s => s.trim()).filter(Boolean);
    }

    if (voters.length === 0) {
      // Fallback to collaborators with push/maintain/admin
      let collaborators = [];
      let page = 1;
      const per_page = 100;
      while (true) {
        const { data } = await octokit.repos.listCollaborators({ owner, repo, per_page, page });
        collaborators = collaborators.concat(data);
        if (data.length < per_page) break;
        page++;
      }
      voters = collaborators
        .filter(c =>
          c.type !== "Bot" &&
          c.permissions &&
          (c.permissions.push === true || c.permissions.maintain === true || c.permissions.admin === true)
        )
        .map(c => c.login);
    }

    const votersLC = new Set(voters.map(v => v.toLowerCase()));

    // Behavior flags
    const allowSelf = cfg.allow_self_approve === true || /^true$/i.test(process.env.ALLOW_SELF_APPROVE || "false");
    const excludeAuthor = (typeof cfg.exclude_author === "boolean")
      ? cfg.exclude_author
      : !allowSelf; // default: if self-approve is allowed, do not exclude; else exclude

    // Effective voters
    const effectiveVoters = new Set([...votersLC].filter(v => excludeAuthor ? v !== prAuthorLC : true));

    // Required approvals
    let requiredApprovals = Number.isInteger(cfg.required_approvals) ? cfg.required_approvals : undefined;
    if (requiredApprovals == null) {
      const envReq = process.env.REQUIRED_APPROVALS;
      requiredApprovals = Number.isInteger(Number(envReq)) ? Math.max(0, parseInt(envReq, 10)) : Math.max(1, Math.ceil(effectiveVoters.size / 2));
    }

    // If there are zero effective voters and no explicit requirement, do not block
    if (effectiveVoters.size === 0 && process.env.REQUIRED_APPROVALS == null && cfg.required_approvals == null) {
      console.log("No eligible voters after filters; skipping enforcement.");
      return;
    }

    // Fetch all reviews for this PR
    let reviews = [];
    let page = 1;
    const per_page = 100;
    while (true) {
      const { data } = await octokit.pulls.listReviews({ owner, repo, pull_number, per_page, page });
      reviews = reviews.concat(data);
      if (data.length < per_page) break;
      page++;
    }

    // Latest review state per eligible voter
    const latestByUser = new Map();
    for (const r of reviews) {
      const login = r.user && r.user.login ? r.user.login.toLowerCase() : "";
      if (!effectiveVoters.has(login)) continue;
      const ts = new Date(r.submitted_at || r.submittedAt || 0).getTime();
      const prev = latestByUser.get(login);
      if (!prev || ts >= prev.ts) {
        latestByUser.set(login, { state: r.state, ts });
      }
    }

    // Count approvals
    const approvedUsers = [...latestByUser.entries()]
      .filter(([_, info]) => info.state === "APPROVED")
      .map(([loginLC]) => loginLC);

    console.log(`Eligible voters: ${[...effectiveVoters].join(", ")}`);
    console.log(`Required approvals: ${requiredApprovals}`);
    console.log(`Current approvals: ${approvedUsers.length}`);
    console.log(`Approvers: ${approvedUsers.join(", ")}`);

    if (approvedUsers.length < requiredApprovals) {
      core.setFailed(`Pull request requires at least ${requiredApprovals} approval(s) from eligible voters; found ${approvedUsers.length}.`);
    } else {
      console.log("Approval requirement met.");
    }
  } catch (error) {
    core.setFailed(`Error enforcing approval requirements: ${error.message}`);
  }
})();
