# FieldDesk PRD

## Product Definition

**FieldDesk transforms fragmented administrative work into mission-ready action by reducing administrative drag, surfacing gaps, and accelerating execution.**

**Track:** GenAI.mil
**Initial Workflow:** TDY Travel Readiness
**Primary User:** Junior NCO preparing administrative work
**Core Demo Entity:** FieldDesk Agent
**Core Value Moment:** FieldDesk catches avoidable administrative failure before review.

Built for the SCSP Hackathon 2026 GenAI.mil track, where the challenge is to help rank-and-file personnel move faster through military bureaucracy using AI. The quickstart recommends picking one persona, such as a junior NCO planning a training trip, and building an end-to-end solution using sources like JTR and GSA rates. 

---

# 1. Problem

Military execution is slowed by administrative drag.

The issue is not that personnel lack intent. The issue is that the information required to execute is fragmented across systems, and gaps are usually found too late.

A junior NCO preparing a TDY packet may need to search:

| Source         | Example                                             |
| -------------- | --------------------------------------------------- |
| Outlook        | Approval emails, funding threads, reviewer comments |
| SharePoint     | Rosters, orders, checklists, prior packets          |
| GSA            | Per diem rates                                      |
| JTR            | Travel policy references                            |
| Unit checklist | Required artifacts                                  |
| Local SOP      | Routing expectations                                |
| Uploaded docs  | Memos, rosters, orders, forms                       |

Two failures slow the workflow:

1. **Fragmented information**
   The required evidence exists, but the user has to hunt across email, folders, policy, spreadsheets, PDFs, and tribal knowledge.

2. **Gaps surface too late**
   Missing funding, mismatched traveler counts, weak justification, incomplete approvals, or policy gaps are often caught only after review.

Result:

> The packet comes back. The user fixes one issue. Another issue appears. Execution slows.

---

# 2. Product Thesis

**FieldDesk transforms fragmented administrative work into mission-ready action by reducing administrative drag, surfacing gaps, and accelerating execution.**

It does this in three steps:

## 1. Reduce Administrative Drag

FieldDesk Agent searches across fragmented sources and collects relevant evidence.

## 2. Surface Gaps

FieldDesk maps evidence against workflow requirements and identifies what is missing, weak, or conflicting.

## 3. Accelerate Execution

FieldDesk generates the next actions and review-ready work products needed to move forward.

---

# 3. MVP Goal

Demonstrate one end-to-end workflow:

## TDY Travel Readiness

A junior NCO enters mission intent. FieldDesk Agent searches mocked sources, finds relevant evidence, surfaces gaps, and generates review-ready outputs.

The MVP must prove:

1. FieldDesk finds fragmented information.
2. FieldDesk surfaces gaps before review.
3. FieldDesk helps the user move toward mission-ready action.

---

# 4. Target User

## Junior NCO / Unit Admin Preparer

This user is responsible for turning mission intent into administrative work.

They need to know:

* Where are the relevant files?
* Which documents matter?
* What is missing?
* What conflicts?
* What will get kicked back?
* What should I do next?

They do not need a chatbot.

They need the work to be ready to route.

---

# 5. Core Demo Workflow

## Scenario

A junior NCO needs to send soldiers to Demo Training Site for training.

The user enters:

> Send 10 soldiers to Demo Training Site for training from June 10–14. Lodging and rental vehicles required.

The required information is scattered across Outlook, SharePoint, GSA, JTR, unit checklists, and uploaded files.

---

## Step 1 — Capture Intent

FieldDesk extracts:

| Field           | Value       |
| --------------- | ----------- |
| Workflow        | TDY Travel  |
| Purpose         | Training    |
| Destination     | Demo Training Site  |
| Dates           | June 10–14  |
| Travelers       | 10 soldiers |
| Lodging         | Required    |
| Rental vehicles | Required    |

FieldDesk displays:

> Intent captured. FieldDesk Agent is searching for supporting information.

---

## Step 2 — FieldDesk Agent Searches Sources

FieldDesk Agent searches mocked sources.

| Source         | Result                                      |
| -------------- | ------------------------------------------- |
| Outlook        | Found approval email from Demo Approver      |
| Outlook        | Found reviewer note asking for fund cite    |
| SharePoint     | Found `training_order.pdf`                  |
| SharePoint     | Found `roster_v2.csv`                       |
| SharePoint     | Found `unit_tdy_checklist.pdf`              |
| GSA            | Found Demo Training Site per diem rates             |
| JTR            | Found lodging and rental vehicle references |
| Local SOP      | Found unit TDY routing expectations         |
| Funding folder | No funding memo found                       |

Value moment:

> FieldDesk reduces drag by finding the evidence the user would otherwise hunt for manually.

---

## Step 3 — Build Evidence Map

FieldDesk maps evidence to workflow requirements.

| Requirement                  | Evidence                 | Source             | Status  |
| ---------------------------- | ------------------------ | ------------------ | ------- |
| Mission purpose              | Training order           | SharePoint         | Found   |
| Dates                        | Training order + intent  | SharePoint / Input | Found   |
| Destination                  | Training order + intent  | SharePoint / Input | Found   |
| Traveler roster              | `roster_v2.csv`          | SharePoint         | Found   |
| Approval                     | Demo Approver email       | Outlook            | Found   |
| Per diem                     | Demo Training Site rate data     | GSA                | Found   |
| Policy reference             | JTR excerpts             | JTR                | Found   |
| Unit checklist               | `unit_tdy_checklist.pdf` | SharePoint         | Found   |
| Rental vehicle justification | User intent only         | Input              | Weak    |
| Funding source               | None                     | Multiple sources   | Missing |

FieldDesk displays:

> Most evidence was found, but the work is not ready to route.

---

## Step 4 — Surface Gaps

FieldDesk analyzes the evidence map.

## Readiness

**Score:** 72 / 100
**Risk of Return:** High

| Area           | Status   | Finding                            |
| -------------- | -------- | ---------------------------------- |
| Mission intent | Found    | Training TDY identified            |
| Destination    | Found    | Demo Training Site                         |
| Dates          | Found    | June 10–14                         |
| Traveler count | Conflict | Intent says 10; roster shows 8     |
| Approval       | Found    | Approval email found               |
| Per diem       | Found    | GSA rate retrieved                 |
| Funding        | Missing  | No funding memo or fund cite found |
| Rental vehicle | Weak     | Justification needs support        |
| Reviewer risk  | High     | Likely return                      |

---

## Step 5 — Magical Moment

FieldDesk highlights the blockers.

### Conflict Detected

**Traveler count mismatch**

| Source         | Traveler Count |
| -------------- | -------------: |
| User intent    |             10 |
| Training order |             10 |
| Roster         |              8 |

FieldDesk explains:

> The request and training order support 10 travelers, but the roster only lists 8. A reviewer will likely return this.

Recommended actions:

* Upload corrected roster
* Update request to 8 travelers
* Add missing travelers to roster

---

### Missing Artifact

**No funding source detected**

FieldDesk searched Outlook, SharePoint, uploaded files, checklist references, and funding folder.

Result:

> No funding memo, fund cite, or funding approval artifact found.

Recommended actions:

* Upload funding memo
* Add fund cite
* Attach approval email
* Mark funding as pending with reviewer note

---

### Weak Justification

**Rental vehicle justification needs support**

FieldDesk found a rental vehicle request but no mission-specific justification.

Suggested language:

> Rental vehicles are required to move personnel between lodging, training site, and required training support locations due to schedule constraints and lack of available unit transportation.

---

## Step 6 — Predict Reviewer Objections

FieldDesk generates likely reviewer questions:

1. Why does the request list 10 travelers while the roster lists 8?
2. What funding source supports this TDY?
3. Who approved lodging?
4. Why are rental vehicles required?
5. Does the per diem estimate match the travel dates and location?

FieldDesk conclusion:

> This work is likely to be returned unless the traveler count and funding gaps are corrected.

Core demo line:

> FieldDesk catches avoidable administrative failure before review.

---

## Step 7 — User Fixes Gaps

The user uploads:

* `roster_v3_corrected.csv`
* `funding_memo.pdf`

The user also accepts the rental vehicle justification.

FieldDesk reruns analysis.

---

## Step 8 — Recompute Readiness

## Updated Readiness

**Score:** 91 / 100
**Risk of Return:** Low

| Area           | Status   | Finding                   |
| -------------- | -------- | ------------------------- |
| Mission intent | Found    | Training TDY identified   |
| Destination    | Found    | Demo Training Site                |
| Dates          | Found    | June 10–14                |
| Traveler count | Resolved | 10 travelers confirmed    |
| Approval       | Found    | Outlook approval attached |
| Per diem       | Found    | GSA rate included         |
| Funding        | Found    | Funding memo attached     |
| Rental vehicle | Improved | Justification added       |
| Reviewer risk  | Low      | Ready for human review    |

FieldDesk displays:

> Administrative work is ready to route for human review.

---

## Step 9 — Generate Work Product

FieldDesk generates:

* Evidence map
* Readiness report
* Gap summary
* Conflict summary
* Reviewer questions
* Human action list
* Packet summary
* Rental vehicle justification
* Per diem estimate
* Source list
* Final routing checklist

Example summary:

> This TDY request supports travel for 10 soldiers to Demo Training Site from June 10–14 for training. FieldDesk found the training order, corrected roster, approval email, unit checklist, GSA per diem estimate, JTR references, and funding memo. The original work had a traveler count mismatch and missing funding evidence. Both issues have been corrected. Readiness is 91/100 and risk of return is low.

---

# 6. Functional Requirements

## Intent Capture

FieldDesk accepts natural language mission intent and extracts structured facts.

## Source Search

FieldDesk Agent searches mocked sources:

* Outlook
* SharePoint
* Uploaded files
* GSA
* JTR
* Unit checklist
* Local SOP
* Prior packets

## Evidence Mapping

FieldDesk maps found evidence to required workflow artifacts.

## Gap Detection

FieldDesk identifies missing, weak, or incomplete evidence.

## Conflict Detection

FieldDesk compares facts across sources and flags inconsistencies.

## Reviewer Objection Prediction

FieldDesk predicts likely reviewer questions before routing.

## Readiness Scoring

FieldDesk produces an explainable score and risk level.

## Work Product Generation

FieldDesk generates summaries, action lists, justifications, and final review-ready outputs.

---

# 7. Model Strategy

FieldDesk should be agent-led.

The MVP should not hard-code workflow intelligence. It should hard-code the mock data and let the FieldDesk Agent reason over that data.

## Core Principle

**Hard-code the world. Prompt the reasoning.**

The demo data is fixed:

* Mock Outlook messages
* Mock SharePoint files
* Mock GSA rates
* Mock JTR excerpts
* Mock unit checklist
* Mock local SOP
* Mock prior packets
* Mock uploaded documents

The reasoning is flexible.

FieldDesk Agent determines:

* Which files are relevant
* Which evidence satisfies requirements
* What is missing
* What conflicts
* What is weak
* What reviewers may object to
* What the user should do next
* How ready the work is for review

## Agent Tasks

The FieldDesk Agent performs seven tasks:

1. Understand intent
2. Search sources
3. Build evidence map
4. Surface gaps
5. Detect conflicts
6. Predict reviewer objections
7. Generate work product

## Application Responsibilities

The app should stay simple:

* Load mock data
* Pass context to the agent
* Call the model
* Validate structured outputs
* Render the UI
* Let users add corrected evidence
* Rerun the agent

Use schemas for reliability:

* `EvidenceMap`
* `GapFinding`
* `ConflictFinding`
* `ReviewerObjection`
* `ReadinessAssessment`
* `GeneratedWorkProduct`

Do not build FieldDesk as deterministic rules with AI sprinkled on top.

Build FieldDesk as an agent reasoning over controlled administrative context.

# 8. Data Sources

## Demo Sources

| Source         | Demo Implementation   |
| -------------- | --------------------- |
| Outlook        | Mock email JSON       |
| SharePoint     | Local mock folder     |
| GSA            | Static fixture or API |
| JTR            | Curated excerpts      |
| Unit checklist | Markdown or PDF       |
| Local SOP      | Static markdown       |
| Prior packets  | Static examples       |
| Uploaded files | File upload UI        |

## Example Files

* `training_order.pdf`
* `roster_v2.csv`
* `roster_v3_corrected.csv`
* `unit_tdy_checklist.pdf`
* `approval_email.json`
* `funding_memo.pdf`
* `jtr_excerpt.md`
* `gsa_per_diem_fixture.json`
* `prior_successful_packet.md`

---

# 9. Trust Boundary

FieldDesk does not:

* Approve travel
* Certify compliance
* Replace reviewers
* Replace commanders
* Submit into DTS
* Book travel
* Process reimbursement
* Make final funding decisions
* Handle classified data

FieldDesk does:

* Search sources
* Find evidence
* Surface gaps
* Detect conflicts
* Predict reviewer objections
* Recommend corrections
* Prepare work for human review

The hackathon quickstart requires public, public-demo safe and shareable materials and warns against using classified, restricted, export-controlled, or sensitive data. 

---

# 10. Out of Scope

For MVP, do not build:

* Real Outlook OAuth
* Real SharePoint integration
* DTS integration
* Travel booking
* Voucher reimbursement
* Approval routing
* Role-based access control
* Classified data handling
* Multi-workflow production system

Mock the connectors.

Prove the workflow.

---

# 11. Rubric Alignment

## Novelty — 25%

FieldDesk is not a chatbot, form filler, or regulation navigator.

It transforms fragmented administrative work into mission-ready action by searching sources, surfacing gaps, and generating review-ready outputs.

## Technical Difficulty — 25%

The demo shows:

* Agentic source search
* Mock enterprise connectors
* Document and email understanding
* Evidence mapping
* Policy/reference use
* GSA data use
* Conflict detection
* Gap detection
* Readiness scoring
* Reviewer objection prediction
* Correct-and-recompute workflow

## National Impact — 25%

Administrative drag exists across the force.

TDY is the wedge, but the same pattern applies to:

* Leave
* Supply
* Maintenance
* Range requests
* Training approvals
* Personnel actions
* Deployment paperwork
* Housing requests
* Awards
* Evaluations

Impact:

> Less time buried in bureaucracy. More time executing the mission.

## Problem-Solution Fit — 25%

User:

> Junior NCO preparing administrative work under time pressure.

Problem:

> Required information is fragmented, and gaps surface too late.

Solution:

> FieldDesk searches sources, surfaces gaps, and prepares the work for review.

---

# 12. Success Criteria

The demo succeeds if judges see:

1. User starts with intent.
2. FieldDesk Agent searches fragmented sources.
3. FieldDesk finds relevant files and references.
4. FieldDesk builds an evidence map.
5. FieldDesk detects missing funding.
6. FieldDesk detects traveler count mismatch.
7. FieldDesk predicts reviewer objections.
8. User fixes the issues.
9. Readiness improves.
10. FieldDesk generates review-ready work.
11. Judges understand the pattern extends beyond TDY.

---

# 13. Build Priority

Build in this order:

1. Static mock data
2. Strong UI shell
3. Agent activity feed
4. Evidence map
5. Gap detection
6. Conflict detection
7. Readiness score
8. Reviewer objections
9. Correct-and-recompute flow
10. Final work product
11. Demo polish

---

# 14. Demo Script

## Opening

The military does not just run on orders.

It runs on the administrative work that makes orders executable.

That work is fragmented across Outlook, SharePoint, checklists, PDFs, regulations, public data, and local processes.

And the gaps are usually found too late.

**FieldDesk transforms fragmented administrative work into mission-ready action by reducing administrative drag, surfacing gaps, and accelerating execution.**

## Walkthrough

A junior NCO needs to send 10 soldiers to Demo Training Site for training.

They enter the mission intent.

FieldDesk Agent searches Outlook, SharePoint, GSA, JTR, the unit checklist, local SOP, and uploaded files.

It finds the training order, roster, approval email, per diem rates, checklist, and relevant policy references.

But it also finds two problems.

The request says 10 travelers.

The roster only shows 8.

And there is no funding memo.

FieldDesk marks the work as high risk and predicts reviewer objections before routing.

The user uploads the corrected roster and funding memo.

FieldDesk recomputes readiness.

The score improves from 72 to 91.

FieldDesk generates the evidence map, packet summary, reviewer questions, and action list.

The work is now ready for human review.

## Close

FieldDesk did three things:

1. Reduced administrative drag by finding scattered information.
2. Surfaced gaps before review.
3. Accelerated execution by generating review-ready work.

TDY is the first workflow.

The same pattern applies anywhere fragmented administrative work slows the mission.

---

# 1t. Final Pitch

## One-Line Pitch

**FieldDesk catches avoidable administrative failure before it slows the mission.**

## Ten-Second Pitch

FieldDesk transforms fragmented administrative work into mission-ready action by finding scattered information, surfacing gaps, and helping users correct issues before review.

## Two-Sentence Pitch

FieldDesk transforms fragmented administrative work into mission-ready action by reducing administrative drag, surfacing gaps, and accelerating execution.

We demonstrate this through TDY travel, where FieldDesk Agent searches Outlook, SharePoint, GSA, JTR, and unit checklists to find evidence, flag missing funding and traveler-count conflicts, and generate review-ready work.

