# restore280 Institute: GitHub Governance PR Sequence

This document describes the complete pull request sequence for constituting
restore280 Institute's governance repository, in order of execution. Each
section lists the files involved, their destination path in the repo, their
source filename from the document set, and any outstanding placeholders.

---

## Before Any PR: GitHub Infrastructure

Complete these steps before opening PR 1:

1. Invite Emalyn Marian Linden (@EMLinden) to the `by-The-Lindemans` org with
   at least read access to the governance repo so she can submit a PR review.

2. Configure branch protection on `main` in the governance repo:
   - Require status checks to pass before merging
   - Add `consent-check` as a required status check
   - Require branches to be up to date before merging
   - Disable force pushes

3. Disable the `mirror-bylaws.yml` workflow before any PRs are opened.
   Go to Actions > mirror-bylaws.yml > disable workflow. This prevents
   auto-merges that bypass the consent requirement.

---

## PR 1: IP Transfer

**Purpose:** Transfers the `by-The-Lindemans` GitHub organization, all its
repositories, and all other BTL software to restore280 Institute. Executed
by Enik and Emalyn as LLC members. No board consent workflow applies; restore280
does not yet own the repo.

**Approvers required:** @ENLinden and @EMLinden (as LLC members; not a board
consent action).

**After merge:** rename the org, update the org email to admin@restore280.org,
update the org website to restore280.org.

**Outstanding placeholders to fill before opening:**
- `[LLC Name]`: the actual name of the Arizona LLC (appears twice)
- `[bridger-github-handle]`: not in this PR; skip

| Repo path | Source file |
|-----------|-------------|
| `IP_TRANSFER.md` | `restore280_IP_Transfer.md` |

---

## PR 2a: Code Alignment (Interim; Sole Approver)

**Purpose:** Replaces the BTL governance workflow with the restore280 governance
workflow. Installs the interim voters.yml listing only @ENLinden, establishing
Enik as the sole authorized approver during the formation period. Also installs
the updated enforcement script, workflow YAML, PR template, and GOVERNANCE.md.

**Approvers required:** @ENLinden only.

**Outstanding placeholders:** none; all placeholders in these files are comments
or will be filled in PR 3.

| Repo path | Source file |
|-----------|-------------|
| `.github/enforceApproval.js` | `.github/enforceApproval.js` |
| `.github/voters.yml` | `PR2a_voters_interim.yml` |
| `.github/workflows/enforce-approval-voting.yml` | `.github/workflows/enforce-approval-voting.yml` |
| `.github/PULL_REQUEST_TEMPLATE.md` | `.github/PULL_REQUEST_TEMPLATE.md` |
| `GOVERNANCE.md` | `GOVERNANCE.md` |

Note: delete or archive `.github/workflows/mirror-bylaws.yml` in this PR if
not already disabled. It should not be present in the restore280 repo.

---

## PR 2b: Full Board Voter List

**Purpose:** Expands voters.yml to include all three directors. This PR is
self-enforcing: because it adds Bridger and the TBD director to the voter list,
those directors must approve this PR before it can merge. This is the handoff
from sole-incorporator authority to full board governance. It is the last thing
Enik can do unilaterally, and the first thing the full board must do together.

**Timing:** Open only once Bridger and the TBD director have GitHub accounts
and have been added to the org with write access to the governance repo.

**Approvers required:** @ENLinden, @[bridger-github-handle], @[tbd-github-handle].

**Outstanding placeholders to fill before opening:**
- `[bridger-github-handle]`: Bridger Ryan Farnsworth's GitHub handle
- `[tbd-github-handle]`: TBD director's GitHub handle

| Repo path | Source file |
|-----------|-------------|
| `.github/voters.yml` | `.github/voters.yml` |

---

## PR 3: Founding Governance Documents

**Purpose:** Adopts the bylaws and all required companion policies, and files
the written consent and COI disclosures as corporate records. Each director's
PR approval constitutes their written consent to all resolutions in the Written
Consent to Adopt and their attestation to their COI disclosure, per the
Electronic Signature Resolution in Section X of the Written Consent.

**Timing:** Open after PR 2b is merged. By this point all three directors are
in voters.yml and unanimous consent is fully operational.

**Approvers required:** @ENLinden, @[bridger-github-handle], @[tbd-github-handle].

**Outstanding placeholders to fill before opening:**
- `[bridger-github-handle]` in Written Consent parties block
- `[tbd-github-handle]` in Written Consent parties block and COI disclosures
- `[Director Name TBD]` in Written Consent and COI disclosures: TBD director's full name
- `$[     ]` in Written Consent Section VII: dual-authorization withdrawal threshold
- `$[     ]` in Written Consent Section VIII: unbudgeted ED expenditure limit

| Repo path | Source file |
|-----------|-------------|
| `BYLAWS.md` | `restore280_BYLAWS.md` |
| `policies/conflict-of-interest.md` | `restore280_Conflict_of_Interest_Policy.md` |
| `policies/document-retention.md` | `restore280_Document_Retention_Policy.md` |
| `policies/whistleblower.md` | `restore280_Whistleblower_Policy.md` |
| `records/written-consent-adoption.md` | `restore280_Written_Consent_Adoption.md` |
| `records/coi-disclosures-initial.md` | `restore280_COI_Disclosures_Initial.md` |
| `records/.gitkeep` | (empty file; creates the records/ directory) |

---

## After PR 3: Remaining Items

The following are not PRs but actions that follow once the organization is
formally constituted:

**Legal filings (sequential; each gates the next):**
1. Apply for EIN from the IRS (after June 23, 2026)
2. File Form 5768 (501(h) election) for fiscal year 2026
3. File Form 1023-EZ (or Form 1023 if asset threshold exceeded)
4. Obtain NY Commissioner of Education consent for use of "Institute" in name
5. File Application for Authority with NY Department of State ($135)
6. Register with NY Attorney General Charities Bureau (once soliciting donations
   from NY sources; exempt below $25,000/year from NY sources)

**Companion policies (before each activity begins):**
- Editorial and Compliance Policy: before first video publishes (August 6, 2026)
- Capital Deployment and Partnership Policy: before any capital facilitation activity
- External Funding Acceptance Policy: before donations are actively solicited

**Annual obligations (ongoing):**
- Annual governance review within 90 days of fiscal year end (by March 31)
- COI disclosures renewed annually before each governance review
- Form 990-N (or 990-EZ/990) filed by May 15 each year
- Delaware Annual Franchise Tax Report filed by March 1 each year ($25)
- voters.yml updated by Board PR consent whenever directors join or leave

---

## Outstanding Placeholders: Complete List

| Placeholder | Location | Status |
|-------------|----------|--------|
| `[LLC Name]` | IP Transfer (x2) | Needs LLC name |
| `[bridger-github-handle]` | voters.yml, Written Consent | Needs Bridger's handle |
| `[tbd-github-handle]` | voters.yml, Written Consent, COI disclosures | TBD director |
| `[Director Name TBD]` | Written Consent, COI disclosures | TBD director |
| `$[     ]` dual-auth threshold | Written Consent Section VII | Board to decide |
| `$[     ]` unbudgeted ED limit | Written Consent Section VIII | Board to decide |
