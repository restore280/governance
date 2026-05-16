# restore280 Institute: Governance Repository

This repository is the official governance record of restore280 Institute, a Delaware nonprofit corporation. It contains the governing documents of the Corporation and implements the Board's written consent process through GitHub's pull request and review system.

---

## How This Repository Works

### Documents

The authoritative versions of all governing documents live here. The current document set includes:

| File | Description |
|------|-------------|
| `BYLAWS.md` | Bylaws of restore280 Institute |
| `policies/conflict-of-interest.md` | Conflict of Interest Policy |
| `policies/document-retention.md` | Document Retention and Destruction Policy |
| `policies/whistleblower.md` | Whistleblower Protection Policy |
| `records/` | Signed written consents and Board action records |

---

### Pull Requests as Written Consent

Article VII of the Bylaws establishes written consent as the default method for Board action. This repository implements that process as follows:

**Opening a PR = circulating a matter for consent.** The PR description serves as the written statement of the proposed action, including its type, deadline, and any recusal declarations. The PR author is typically the Executive Director.

**Approving a PR = consenting.** A director's GitHub review approval on a PR constitutes their written consent to the action described in that PR, for purposes of Article VII.1. Electronic signatures are explicitly accepted under Article VII.1 of the Bylaws.

**Merging a PR = the action taking effect.** A PR may only be merged after the consent requirement is met. Branch protection rules enforce this: the `consent-check` workflow must pass before merge is permitted.

**Closing a PR without merging = action failed.** If the response deadline passes without unanimous consent, the Executive Director closes the PR. The PR's comment history documents who consented and who did not, satisfying the Section 7.6 recordkeeping requirement.

---

### Consent Requirements

All Board actions require **unanimous consent**: every active director must approve the PR before it may merge. This implements the Article VII.1 requirement that written consent be unanimous.

The workflow reads the voter list from `.github/voters.yml` and posts a running status comment on each PR showing each director's current approval state.

---

### Response Deadlines

The PR description specifies the response deadline. Standard deadline is 14 calendar days from the date the PR is opened. Urgent matters may specify a shorter window of not less than 48 hours, with the reason stated in the PR description.

A director who does not respond by the deadline has not consented. The action fails and the PR is closed by the Executive Director with a comment noting the outcome. This is the manual implementation of the Section 7.2 requirement that non-response by deadline = action failed.

---

### Recusal

If a director has a conflict of interest requiring recusal under the Conflict of Interest Policy, the PR author adds a line to the PR description:

```
Recusal: @github-handle
```

The workflow removes that director from the required voter list for that PR only. The recusal declaration must appear in the PR body (not in comments) and must be present when the PR is opened or added before any approvals are counted.

---

### Requesting a Synchronous Meeting

Any director or the Executive Director may request a synchronous meeting for any agenda item under Article VII.3. To request one, leave a comment on the relevant PR stating the request. The PR is then held open while the synchronous meeting is scheduled. After the meeting, the outcome is recorded in a comment on the PR, and the PR is either merged (if approved) or closed (if not approved or withdrawn).

---

### Updating the Voter List

When a director joins or leaves the Board, `voters.yml` must be updated to reflect the current Board composition. This update is itself a Board action and must go through the PR consent process. The new director's GitHub handle must be added to `voters.yml` by a PR approved by all then-current voters (including the incoming director if their handle is being added).

---

### Workflow Note: mirror-bylaws.yml

The repository contains a legacy `mirror-bylaws.yml` workflow that was used in the prior LLC context to auto-mirror `BYLAWS.md` to `README.md`. This workflow is **disabled for restore280**. All changes to governance documents must go through the consent process above. The workflow file is retained for reference but should not be re-enabled without a Board consent action explicitly authorizing it.

---

### Records

The `records/` directory contains signed copies of:

- The initial Written Consent to Adopt Bylaws and founding resolutions
- All subsequent written consents and Board action records
- Executed counterparts of significant agreements

These records are permanent under the Document Retention Policy. They are maintained here in addition to any physical or separately stored signed originals.

---

## Contact

**Governance questions:** admin@restore280.org  
**Executive Director:** Enik Nadir Linden
