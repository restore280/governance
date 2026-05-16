// .github/enforceApproval.js
//
// restore280 Institute: Board Consent Enforcement
//
// Implements the unanimous written consent requirement of Article VII of the
// restore280 Bylaws. All active directors must consent before a PR may merge.
//
// Two consent methods are accepted:
//
//   1. GitHub review approval: open the PR, click "Review changes", select
//      "Approve", submit. Available to all voters who are not the PR author.
//
//   2. Comment command: post a comment containing "/consent" anywhere in the
//      body. Available to all voters including the PR author. Post "/dissent"
//      to withdraw or oppose. The most recent command per voter wins.
//
// Both methods produce an equivalent legal record. The PR author should use
// "/consent" since GitHub does not permit authors to approve their own PRs.
//
// Recusal: add a line "Recusal: @handle" to the PR body to remove a voter
// from the required list for that PR due to a conflict of interest.
//
// The script posts a status comment on the PR showing each voter's current
// state and instructions for approving, satisfying Section 7.6 recordkeeping.

const { Octokit } = require("@octokit/rest");
const core = require("@actions/core");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

function loadVoterConfig(cwd) {
  for (const name of ["voters.yml", "voters.yaml"]) {
    const p = path.join(cwd, name);
    if (fs.existsSync(p)) {
      try {
        return yaml.load(fs.readFileSync(p, "utf8")) || {};
      } catch (e) {
        core.warning(`Could not parse ${name}: ${e.message}`);
      }
    }
  }
  return {};
}

// Parse recusal declarations from PR body.
// Matches: "Recusal: @handle" or "Recused: handle"
function parseRecusals(body) {
  const recused = new Set();
  if (!body) return recused;
  for (const line of body.split(/\r?\n/)) {
    const match = line.match(/^recus(?:al|ed)\s*:\s*@?(\S+)/i);
    if (match) recused.add(match[1].toLowerCase());
  }
  return recused;
}

// Fetch /consent and /dissent commands from PR comments.
// Returns a Map of lowercase login -> { state, ts, method: "comment" }
// The most recent command per voter wins.
async function fetchCommentConsents(octokit, owner, repo, pull_number, effectiveVoters) {
  const consentByUser = new Map();
  let page = 1;
  while (true) {
    const { data: comments } = await octokit.issues.listComments({
      owner, repo, issue_number: pull_number, per_page: 100, page
    });
    for (const comment of comments) {
      const login = (comment.user && comment.user.login || "").toLowerCase();
      if (!effectiveVoters.has(login)) continue;
      if (comment.user.type === "Bot") continue;
      const body = comment.body || "";
      const ts = new Date(comment.created_at || 0).getTime();
      const hasConsent = /(?:^|\s)\/consent(?:\s|$)/im.test(body);
      const hasDissent = /(?:^|\s)\/dissent(?:\s|$)/im.test(body);
      if (!hasConsent && !hasDissent) continue;
      const prev = consentByUser.get(login);
      if (prev && ts < prev.ts) continue;
      let state;
      if (hasConsent && hasDissent) {
        const ci = body.toLowerCase().lastIndexOf("/consent");
        const di = body.toLowerCase().lastIndexOf("/dissent");
        state = ci > di ? "APPROVED" : "DISSENTED";
      } else {
        state = hasConsent ? "APPROVED" : "DISSENTED";
      }
      consentByUser.set(login, { state, ts, method: "comment" });
    }
    if (comments.length < 100) break;
    page++;
  }
  return consentByUser;
}

// Merge review approvals and comment consents per voter.
// The more recent signal wins when both exist for the same voter.
function mergeConsents(reviewMap, commentMap) {
  const merged = new Map();
  const allVoters = new Set([...reviewMap.keys(), ...commentMap.keys()]);
  for (const v of allVoters) {
    const review = reviewMap.get(v);
    const comment = commentMap.get(v);
    if (review && comment) {
      merged.set(v, comment.ts >= review.ts ? comment : { ...review, method: "review" });
    } else if (review) {
      merged.set(v, { ...review, method: "review" });
    } else {
      merged.set(v, comment);
    }
  }
  return merged;
}

function buildStatusComment(effectiveVoters, mergedConsents, recusedLC, requiredCount, unanimousMode, prAuthorLC) {
  const rows = [...effectiveVoters].map(v => {
    const entry = mergedConsents.get(v);
    const isAuthor = v === prAuthorLC;
    const howTo = isAuthor
      ? "Comment `/consent` (GitHub blocks PR author self-review)"
      : "Approve via GitHub review, or comment `/consent`";
    if (!entry) return `| @${v} | ⏳ Pending | ${howTo} |`;
    if (entry.state === "APPROVED") {
      const via = entry.method === "comment" ? "/consent comment" : "GitHub review";
      return `| @${v} | ✅ Approved via ${via} | |`;
    }
    return `| @${v} | ❌ Dissented | Comment \`/consent\` to change |`;
  });

  const approvedCount = [...effectiveVoters].filter(v => {
    const e = mergedConsents.get(v);
    return e && e.state === "APPROVED";
  }).length;

  const lines = [
    "## Board Consent Status",
    "",
    `**Consent model:** ${unanimousMode
      ? "Unanimous: all directors must consent (Article VII.1)"
      : `${requiredCount} consent(s) required`}`,
    "",
    "| Director | Status | Action |",
    "|----------|--------|--------|",
    ...rows,
  ];

  if (recusedLC.size > 0) {
    lines.push("", `**Recused (conflict of interest):** ${[...recusedLC].map(h => `@${h}`).join(", ")}`);
  }

  lines.push(
    "",
    `**Progress:** ${approvedCount} of ${requiredCount} required consent(s) received.`,
    "",
    unanimousMode && approvedCount < requiredCount
      ? "⛔ Consent not yet complete. All directors must consent before this action may take effect."
      : approvedCount >= requiredCount
      ? "✅ Consent requirement met. This action may proceed."
      : "⛔ Consent not yet complete.",
    "",
    "**To consent:** Approve via GitHub review, or post a comment containing `/consent`.",
    "**To dissent:** Post a comment containing `/dissent`.",
    "**To recuse:** Add `Recusal: @yourhandle` to the PR description.",
    "",
    "*Updated automatically by the restore280 governance workflow.*"
  );

  return lines.join("\n");
}

(async () => {
  try {
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");
    const eventName = process.env.GITHUB_EVENT_NAME;
    const payload = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));

    // Handle pull_request, pull_request_review, and issue_comment events
    let pull_number, prAuthorLC, prBody;

    if (eventName === "issue_comment") {
      const issue = payload.issue;
      if (!issue || !issue.pull_request) {
        console.log("Comment is not on a pull request; skipping.");
        return;
      }
      pull_number = issue.number;
      prAuthorLC = (issue.user && issue.user.login || "").toLowerCase();
      const { data: prData } = await octokit.pulls.get({ owner, repo, pull_number });
      prBody = prData.body || "";
    } else {
      const pr = payload.pull_request;
      if (!pr) {
        core.setFailed("This workflow must run on a pull_request or issue_comment event.");
        return;
      }
      pull_number = pr.number;
      prAuthorLC = (pr.user && pr.user.login || "").toLowerCase();
      prBody = pr.body || "";
    }

    // Load voter config from PR branch
    const cfg = loadVoterConfig(process.cwd());

    // Build voter list
    let voters = Array.isArray(cfg.voters) ? cfg.voters : [];
    const votersCSV = (process.env.VOTERS_CSV || "").trim();
    if (voters.length === 0 && votersCSV) {
      voters = votersCSV.split(",").map(s => s.trim()).filter(Boolean);
    }
    if (voters.length === 0) {
      let collaborators = [], page = 1;
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
    const recusedLC = parseRecusals(prBody);

    const allowSelf = cfg.allow_self_approve === true ||
      /^true$/i.test(process.env.ALLOW_SELF_APPROVE || "false");
    const excludeAuthor = typeof cfg.exclude_author === "boolean" ? cfg.exclude_author : !allowSelf;

    const effectiveVoters = new Set(
      [...votersLC].filter(v => {
        if (excludeAuthor && v === prAuthorLC) return false;
        if (recusedLC.has(v)) return false;
        return true;
      })
    );

    const unanimousMode = cfg.unanimous === true ||
      /^true$/i.test(process.env.UNANIMOUS || "false");

    let requiredCount;
    if (unanimousMode) {
      requiredCount = effectiveVoters.size;
    } else if (Number.isInteger(cfg.required_approvals)) {
      requiredCount = cfg.required_approvals;
    } else {
      requiredCount = Math.max(1, Math.ceil(effectiveVoters.size / 2));
    }

    if (effectiveVoters.size === 0 && !unanimousMode &&
        process.env.REQUIRED_APPROVALS == null && cfg.required_approvals == null) {
      console.log("No eligible voters after filters; skipping enforcement.");
      return;
    }

    // Fetch review approvals
    let reviews = [], page = 1;
    while (true) {
      const { data } = await octokit.pulls.listReviews({ owner, repo, pull_number, per_page: 100, page });
      reviews = reviews.concat(data);
      if (data.length < 100) break;
      page++;
    }

    const reviewMap = new Map();
    for (const r of reviews) {
      const login = (r.user && r.user.login || "").toLowerCase();
      if (!effectiveVoters.has(login)) continue;
      const ts = new Date(r.submitted_at || r.submittedAt || 0).getTime();
      const prev = reviewMap.get(login);
      if (!prev || ts >= prev.ts) {
        reviewMap.set(login, { state: r.state, ts });
      }
    }

    // Fetch comment consents
    const commentMap = await fetchCommentConsents(octokit, owner, repo, pull_number, effectiveVoters);

    // Merge both sources
    const mergedConsents = mergeConsents(reviewMap, commentMap);

    const approvedUsers = [...effectiveVoters].filter(v => {
      const e = mergedConsents.get(v);
      return e && e.state === "APPROVED";
    });
    const pendingUsers = [...effectiveVoters].filter(v => !mergedConsents.has(v));
    const rejectedUsers = [...effectiveVoters].filter(v => {
      const e = mergedConsents.get(v);
      return e && e.state !== "APPROVED";
    });

    console.log(`Effective voters: ${[...effectiveVoters].join(", ")}`);
    console.log(`Unanimous mode: ${unanimousMode}`);
    console.log(`Required: ${requiredCount}`);
    console.log(`Approved: ${approvedUsers.join(", ") || "none"}`);
    console.log(`Pending: ${pendingUsers.join(", ") || "none"}`);
    console.log(`Dissented/dismissed: ${rejectedUsers.join(", ") || "none"}`);
    if (recusedLC.size > 0) console.log(`Recused: ${[...recusedLC].join(", ")}`);

    // Post or update status comment
    try {
      const { data: allComments } = await octokit.issues.listComments({
        owner, repo, issue_number: pull_number
      });
      const botComment = allComments.find(c =>
        c.user && c.user.type === "Bot" &&
        c.body && c.body.includes("## Board Consent Status")
      );
      const commentBody = buildStatusComment(
        effectiveVoters, mergedConsents, recusedLC, requiredCount, unanimousMode, prAuthorLC
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
          ? `Unanimous consent required. ${approved}/${effectiveVoters.size} have consented. Waiting on: ${waiting.join(", ")}.`
          : `${requiredCount} consent(s) required; ${approved} received.`
      );
    } else {
      console.log("Consent requirement met. Action may proceed.");
    }

  } catch (error) {
    core.setFailed(`Error enforcing consent requirements: ${error.message}`);
  }
})();
