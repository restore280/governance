// .github/enforceApproval.js
//
// restore280 Institute — Board Consent Enforcement
//
// Implements the unanimous written consent requirement of Article VII of the
// restore280 Bylaws. All active directors must approve a PR before it may
// merge. Non-approval by the deadline is handled manually by the ED per
// Section 7.2: close the PR and record the failed action under Section 7.6.
//
// Recusal: if a director declares a conflict of interest, add a line to the
// PR body in the format "Recusal: @handle". That director is removed from
// the effective voter list for that PR only.
//
// Status: after each review event, this script posts or updates a comment
// on the PR showing the current consent state, satisfying the Section 7.6
// recordkeeping requirement.

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

// Parse recusal declarations from PR body.
// Matches lines of the form: "Recusal: @handle" or "Recusal: handle"
function parseRecusals(body) {
  if (!body) return new Set();
  const recused = new Set();
  for (const line of body.split(/\r?\n/)) {
    const match = line.match(/^recus(?:al|ed)\s*:\s*@?(\S+)/i);
    if (match) recused.add(match[1].toLowerCase());
  }
  return recused;
}

// Build the status comment body showing each director's current consent state.
function buildStatusComment(effectiveVoters, latestByUser, recusedLC, requiredCount, unanimousMode) {
  const rows = [...effectiveVoters].map(v => {
    const entry = latestByUser.get(v);
    if (!entry) return `| @${v} | ⏳ Pending |`;
    if (entry.state === "APPROVED") return `| @${v} | ✅ Approved |`;
    return `| @${v} | ❌ Changes requested / Dismissed |`;
  });

  const approvedCount = [...effectiveVoters].filter(v => {
    const e = latestByUser.get(v);
    return e && e.state === "APPROVED";
  }).length;

  const lines = [
    "## Board Consent Status",
    "",
    `**Consent model:** ${unanimousMode ? "Unanimous — all directors must approve (Article VII.1)" : `${requiredCount} approval(s) required`}`,
    "",
    "| Director | Status |",
    "|----------|--------|",
    ...rows,
  ];

  if (recusedLC.size > 0) {
    lines.push("", `**Recused (conflict of interest):** ${[...recusedLC].map(h => `@${h}`).join(", ")}`);
  }

  lines.push(
    "",
    `**Progress:** ${approvedCount} of ${requiredCount} required approval(s) received.`,
    "",
    unanimousMode && approvedCount < requiredCount
      ? `⛔ Consent not yet complete. All directors must approve before this action may take effect.`
      : approvedCount >= requiredCount
      ? `✅ Consent requirement met. This action may proceed.`
      : `⛔ Consent not yet complete.`,
    "",
    "*Updated automatically by the restore280 governance workflow.*"
  );

  return lines.join("\n");
}

(async () => {
  try {
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");

    const payload = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
    const pr = payload.pull_request;
    if (!pr) {
      core.setFailed("This workflow must run on a pull_request event.");
      return;
    }

    const pull_number = pr.number;
    const prAuthor = (pr.user && pr.user.login) ? pr.user.login.toLowerCase() : "";
    const prBody = pr.body || "";

    // Load config
    const cfg = loadVoterConfig(process.cwd());

    // Build base voter list
    let voters = Array.isArray(cfg.voters) ? cfg.voters : [];
    const votersCSV = (process.env.VOTERS_CSV || "").trim();
    if (voters.length === 0 && votersCSV) {
      voters = votersCSV.split(",").map(s => s.trim()).filter(Boolean);
    }
    if (voters.length === 0) {
      let collaborators = [];
      let page = 1;
      while (true) {
        const { data } = await octokit.repos.listCollaborators({ owner, repo, per_page: 100, page });
        collaborators = collaborators.concat(data);
        if (data.length < 100) break;
        page++;
      }
      voters = collaborators
        .filter(c => c.type !== "Bot" && c.permissions &&
          (c.permissions.push || c.permissions.maintain || c.permissions.admin))
        .map(c => c.login);
    }

    const votersLC = new Set(voters.map(v => v.toLowerCase()));

    // Parse recusals from PR body
    const recusedLC = parseRecusals(prBody);

    // Behavior flags
    const allowSelf = cfg.allow_self_approve === true ||
      /^true$/i.test(process.env.ALLOW_SELF_APPROVE || "false");
    const excludeAuthor = (typeof cfg.exclude_author === "boolean") ? cfg.exclude_author : !allowSelf;

    // Effective voters: apply author exclusion and recusals
    const effectiveVoters = new Set(
      [...votersLC].filter(v => {
        if (excludeAuthor && v === prAuthor) return false;
        if (recusedLC.has(v)) return false;
        return true;
      })
    );

    // Determine consent mode
    const unanimousMode = cfg.unanimous === true ||
      /^true$/i.test(process.env.UNANIMOUS || "false");

    // Required count
    let requiredCount;
    if (unanimousMode) {
      requiredCount = effectiveVoters.size;
    } else if (Number.isInteger(cfg.required_approvals)) {
      requiredCount = cfg.required_approvals;
    } else {
      requiredCount = Math.max(1, Math.ceil(effectiveVoters.size / 2));
    }

    // Skip enforcement if no effective voters and no explicit requirement
    if (effectiveVoters.size === 0 && !unanimousMode &&
        process.env.REQUIRED_APPROVALS == null && cfg.required_approvals == null) {
      console.log("No eligible voters after filters; skipping enforcement.");
      return;
    }

    // Fetch all reviews
    let reviews = [];
    let page = 1;
    while (true) {
      const { data } = await octokit.pulls.listReviews({ owner, repo, pull_number, per_page: 100, page });
      reviews = reviews.concat(data);
      if (data.length < 100) break;
      page++;
    }

    // Latest review state per effective voter
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

    // Tally
    const approvedUsers = [...effectiveVoters].filter(v => {
      const e = latestByUser.get(v);
      return e && e.state === "APPROVED";
    });
    const pendingUsers = [...effectiveVoters].filter(v => !latestByUser.has(v));
    const rejectedUsers = [...effectiveVoters].filter(v => {
      const e = latestByUser.get(v);
      return e && e.state !== "APPROVED";
    });

    console.log(`Effective voters: ${[...effectiveVoters].join(", ")}`);
    console.log(`Unanimous mode: ${unanimousMode}`);
    console.log(`Required: ${requiredCount}`);
    console.log(`Approved: ${approvedUsers.join(", ") || "none"}`);
    console.log(`Pending: ${pendingUsers.join(", ") || "none"}`);
    console.log(`Rejected/dismissed: ${rejectedUsers.join(", ") || "none"}`);
    if (recusedLC.size > 0) console.log(`Recused: ${[...recusedLC].join(", ")}`);

    // Post or update status comment
    try {
      const { data: comments } = await octokit.issues.listComments({
        owner, repo, issue_number: pull_number
      });
      const botComment = comments.find(c =>
        c.user && c.user.type === "Bot" && c.body && c.body.includes("## Board Consent Status")
      );
      const commentBody = buildStatusComment(
        effectiveVoters, latestByUser, recusedLC, requiredCount, unanimousMode
      );
      if (botComment) {
        await octokit.issues.updateComment({
          owner, repo, comment_id: botComment.id, body: commentBody
        });
      } else {
        await octokit.issues.createComment({
          owner, repo, issue_number: pull_number, body: commentBody
        });
      }
    } catch (commentErr) {
      core.warning(`Could not post status comment: ${commentErr.message}`);
    }

    // Final enforcement
    const approved = approvedUsers.length;
    if (approved < requiredCount) {
      const waiting = [...pendingUsers, ...rejectedUsers];
      core.setFailed(
        unanimousMode
          ? `Unanimous consent required. ${approved}/${effectiveVoters.size} directors have approved. Waiting on: ${waiting.join(", ")}.`
          : `${requiredCount} approval(s) required; ${approved} received.`
      );
    } else {
      console.log("Consent requirement met. Action may proceed.");
    }

  } catch (error) {
    core.setFailed(`Error enforcing consent requirements: ${error.message}`);
  }
})();
