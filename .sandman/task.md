# Task

Implement GitHub issue #133: Containerize web and worker runtimes

## Issue Context

## Parent

Top-level PRD: [SlotMerge MVP PRD](https://github.com/rafaelromao/slotmerge/issues/14). Hosting decision: [Choose MVP hosting and deployment](https://github.com/rafaelromao/slotmerge/issues/131).

## What to build

Add the Docker build and runtime command shape needed to run the same application image locally and in Cloud Run as two services: `web` for the Next.js app and `worker` for Graphile Worker jobs and scheduler/tick logic.

This ticket is a prerequisite for both local full-stack verification and GCP deployment.

## Acceptance criteria

- [ ] A production Docker image builds from the locked pnpm + Next.js + Node stack.
- [ ] The same image can run in `web` mode and `worker` mode via command or environment selection.
- [ ] The `web` runtime serves the Next.js app on the Cloud Run-provided port.
- [ ] The `worker` runtime starts Graphile Worker without exposing public product routes.
- [ ] The image can also run locally with local PostgreSQL and non-production environment variables.
- [ ] The image does not require development-only dependencies at runtime.
- [ ] The runtime expects configuration from environment variables and Secret Manager injection in GCP, while allowing local `.env`/compose-style configuration outside GCP.

## Blocked by

- [Provision app shell, auth, and Postgres bootstrap](https://github.com/rafaelromao/slotmerge/issues/20)
- [Provision GCP project and deployment foundation](https://github.com/rafaelromao/slotmerge/issues/132)


## Runtime Context

- You are running inside a Sandman-created worktree.
- Current branch: `sandman/133-containerize-web-and-worker-runtimes`
- Source branch: `sandman/133-containerize-web-and-worker-runtimes`
- Base branch: `main`
- Review command: `/sandman review`

The worktree MUST be checked out on `sandman/133-containerize-web-and-worker-runtimes` when the run finishes. Do not switch to `main` or any other branch before exiting.

## Execution Checklist

- [x] Create branch
- [x] Plan (sandman-plan)
- [ ] Implement (sandman-implement: execute TDD + commit + self-review + back-merge + create PR + delegate review)
- [ ] PR-Review (sandman-pr-review)
- [ ] PR-Merge (sandman-pr-merge)

Before moving on, check which checklist items are already complete in `.sandman/task.md`. If an item is already checked, treat it as complete and skip it instead of repeating the work.

After checking off an item, update `.sandman/task.md` in place and rewrite the registered `## Next Step` so it points at the next unchecked checklist item.

## Plan

### Behaviors to test

- Prerequisite gate: the repository contains the locked runtime scaffold needed for containerization: `package.json`, `pnpm-lock.yaml`, a Next.js production start/build path, and a real Graphile Worker entrypoint. If absent, stop as blocked by #20/#132 and do not create placeholders.
- Tracer bullet: once the scaffold exists, the repository exposes one public container runtime contract that selects `web` or `worker` mode through command/env input and fails fast for unknown modes.
- The production image builds from the locked pnpm + Next.js + Node stack using the repository lockfile.
- The production runtime image contains only production/runtime artifacts and does not require development-only dependencies to start.
- In `web` mode, the container starts the Next.js server bound to `0.0.0.0` and the Cloud Run-provided `PORT`.
- In `worker` mode, the container starts the real Graphile Worker process/scheduler boundary and does not start the public web route surface.
- Local execution accepts local PostgreSQL and non-production env vars through `.env`/compose-style environment injection.
- Production configuration is expressed as environment variables suitable for Cloud Run Secret Manager injection, without hard-coding final GCP resource names while #132 is open.

### Testable interfaces

- Prerequisite artifact seam: repository-level existence checks for the locked app scaffold and real worker entrypoint.
- Runtime command seam: a single Docker `CMD`/entrypoint or package script with `RUNTIME_MODE=web|worker` or equivalent CLI selection.
- Image/build seam: `docker build` plus image inspection/smoke checks against the built production image.
- Process boundary seam: observable start command output, bind address/port behavior, and absence of web startup in worker mode.
- Environment contract seam: checked-in env template/docs for local and production variable names, with final GCP binding deferred to #132.

### Assumptions / risks

- Full implementation is blocked until #20 provides the real locked app scaffold and Graphile Worker code.
- Final Cloud Run, Artifact Registry, Cloud SQL, and Secret Manager wiring is blocked until #132.
- Do not create a fake Next app, fake Graphile Worker, fake lockfile, or fake deployment foundation to satisfy this ticket.
- If prerequisites are absent during `sandman-tdd`, the correct automated outcome is a blocked stop/report, not speculative implementation.

## Next Step

BLOCKED: Issue #20 (app shell, auth, Postgres bootstrap) is still open with PR #140 pending merge. Issue #132 (GCP project foundation) is CLOSED. No package.json, pnpm-lock.yaml, Next.js source, or Graphile Worker entrypoint exists anywhere in the repository. Cannot proceed with implementation or PR review until #20 is resolved.

## Prerequisite Status Update

- Issue #20 (BLOCKS #133): OPEN — PR #140 "Provision app shell, auth, and Postgres bootstrap" exists and is mergeable (CLEAN) but not yet merged.
- Issue #132 (BLOCKED #133): CLOSED — GCP project and deployment foundation resolved.
- No containerization artifacts exist anywhere: no Dockerfile, no package.json, no pnpm-lock.yaml, no Next.js source, no Graphile Worker entrypoint.
- Current branch `sandman/133-containerize-web-and-worker-runtimes` is 2 commits BEHIND origin/main (which added GCP foundation docs).

## Blocked Finding (re-confirmed)

Prerequisite gate re-executed. Still blocked: `package.json`, `pnpm-lock.yaml`, Next.js source, and Graphile Worker entrypoint absent from repository. Issue #20 remains open (PR #140 pending). Issue #132 is now closed. Per plan: "do not create placeholder app, lockfile, or worker code to satisfy this ticket."

## Stop Condition Reached

Prerequisite gate failed: no `package.json`, no `pnpm-lock.yaml`, no Next.js source files, no Graphile Worker entrypoint exist in the repository. Issue #20 is still open. Implementation cannot proceed without the locked runtime scaffold from #20.

## Blocked Finding

The prerequisite gate was executed on `sandman/133-containerize-web-and-worker-runtimes`. The repository currently contains no `package.json`, no `pnpm-lock.yaml`, no Next.js source files, and no real Graphile Worker entrypoint. Per the plan, do not create placeholder app, lockfile, or worker code to satisfy this ticket. Issue #20 remains open.

## Already Resolved

If the issue is already implemented on `main`, after fetching and checking the current `origin/main` HEAD against the issue acceptance criteria, update `.sandman/task.md` so it contains the exact line `## Status: already resolved`.

Do not use issue closure, a matching local branch, or unmerged worktree changes as proof that the issue is already resolved. If any acceptance criterion is missing or you are not certain, continue with Plan.

Do not paraphrase this line. Do not use `already implemented`, `no action required`, or any other wording for this marker.

Before writing `## Status: already resolved`, the `sandman-implement` skill requires two pre-flight checks (see Step 1.5). Both must pass before the marker is written. If either fails, do NOT write the marker — fix the underlying condition first, or stop and let the existing PR drive the run.

## Success-Blocking Conditions

The run is NOT considered successful (and `## Status: already resolved` MUST NOT be written) while any of the following are true:

- **Open PR with no approval** — `gh pr list --head <branch> --state open` returns one or more PRs that have not been approved (or the approval state is unknown).
- **`mergeable: CONFLICTING`** — the branch's open PR is in a conflict state with the base branch.
- **Unpushed commits** — `git log @{u}..HEAD` (or `git log origin/main..HEAD` for a new branch) is non-empty; the local branch has commits the remote does not.
- **Unresolved AC blocker** — any acceptance criterion in the issue body is unmet, contested, or marked blocked by another open issue.

Re-check this block immediately before writing `## Status: already resolved`. If any condition is true, abort the marker and address the underlying problem (close orphan PR, back-merge, push commits, or resolve the blocker).

## Mandatory Execution Contract

This task must be executed through the Sandman skill workflow, not by ad-hoc implementation.

1. Load the `sandman` skill.
2. Use mode `sandman implement`.
3. When `sandman` routes to a subskill, load that subskill and follow its full workflow, checklist, guardrails, hard rules, preconditions, and stop conditions before moving on.
4. Treat every `Workflow`, `Checklist`, `Guardrails`, `Hard rule`, `Preconditions`, and `Stop conditions` section in each loaded Sandman subskill as mandatory.
5. Do not skip, summarize, or replace skill steps with your own shortcut.
6. If a skill says to load another skill, load it and follow it end to end.
7. If a step cannot be completed, stop only when the relevant skill says to stop, report the blocker, then still run the continuation step below.

## AFK Rule — Absolute

This is a fully automated Away From Keyboard workflow. **The user will never be available to answer questions, give approval, or make decisions during execution.**

### Hard Ban

You MUST NEVER:
- Ask the user for approval, confirmation, permission, or decisions.
- Ask the user "should I proceed?", "ready for next step?", "want me to continue?", or any variant.
- Ask the user for clarification, feedback, or review.
- Pause, prompt, or block waiting for user input — **including yes/no questions, confirmations, and rhetorical check-ins**.
- Stop mid-workflow to report status to the user unless the workflow has reached a terminal stop condition defined by a loaded skill.

### Subagent Escape Hatch

If you genuinely cannot decide what to do next (ambiguous result, conflicting skill instructions, unclear failure mode), do not ask the user. Instead:
1. **Spawn a subagent** with full context of the decision point.
2. Ask the subagent to analyze and recommend.
3. Reach consensus with the subagent.
4. Proceed automatically.

This is your only allowed second-opinion mechanism. Never fall back to asking the user.

### Satisfying "User Approval" Gates in Skills

When any loaded skill refers to user approval, user confirmation, or user satisfaction, satisfy that gate by proceeding automatically once tests, formatting, CI, and review gates pass.

The Required Skill Chain defines specific tools for each review type:

| Step | Designated Mechanism | Notes |
|------|-------------------|-------|
| Plan approval (TDD) | Subagent review + consensus | Only step that explicitly requires subagent review |
| Self-review | `sandman-self-review` skill |
| PR review | `sandman-pr-review` skill | **Must NOT use subagent**

**PR review is the only step where subagent review is banned.** Use the `sandman-pr-review` skill instead. Subagent review is recommended for plan approval.

### Examples of Banned Questions

These are all forbidden (non-exhaustive):

> "Ready for PR review step. Want me to proceed?"
> "Should I create the PR now?"
> "Does this look good to you?"
> "Can I merge?"
> "What should I do about this test failure?"
> "The review returned feedback. Should I apply it?"

All of these MUST be handled autonomously. Use the Subagent Escape Hatch for genuine decision ambiguity or as delegated in the table above.

## Search Scope Restriction

If `codeindex.json` exists in the repository root, use `codeindex` before `grep`, `rg`, or `glob` for symbol lookup, dependency lookup, or blast-radius discovery. Only fall back to `grep`/`glob` if `codeindex` cannot answer the question.

Never run grep, rg, find, or any recursive content/file search against directories outside the current working directory (e.g. /tmp, /var, /usr, /etc, /opt, /home, node_modules, .git, target, dist, build, vendor). Such searches return massive output that floods the context window. Restrict searches to the cwd or explicit sub-paths within it; use the Glob/Grep tools which already scope to the project by default.

This restriction applies to the current agent and to every subagent invoked in the current session, including subagents launched directly and subagents launched by any Sandman or other skill loaded during the run. When spawning, delegating to, or handing work off to a subagent, pass this Search Scope Restriction into the subagent's instructions verbatim, or reference this section by name, so the subagent obeys the same rule.

## Required Skill Chain

During `sandman implement`, follow all delegated subskills it calls:

- `sandman-tdd` for planning, subagent-reviewed plan consensus, vertical red-green TDD, and refactor-after-green.
- `sandman-self-review` for self-review.
- `sandman-back-merge` before PR creation, with no rebase and no force-push.
- `sandman-pr-review` for delegated PR review. Do not review the PR yourself.
- `sandman-pr-merge` only if the PR is fully approved, required checks are green, and GitHub reports it mergeable.

## Required Order

1. Complete checklist items in order: Create branch, Plan, Implement, PR-Review, PR-Merge.
2. For plan-approval, use subagent review. For self-review, use `sandman-self-review` skill. For PR-review, use `sandman-pr-review` skill — subagent review is banned there. Proceed after consensus/completion. Do not ask the user.
3. **PR creation is not PR review.** A PR existing does not mean it has been reviewed or is ready to merge. Before loading `sandman-pr-merge`, the agent MUST confirm that `sandman-pr-review` was actually executed and produced a reviewed/approved state. If the last completed step is "PR Created" and the PR is not approved or not mergeable, the agent MUST call `sandman-pr-review` before `sandman-pr-merge` — do not skip the review step. If any merge gate is false or ambiguous, call `sandman-pr-review` and continue the review loop instead of reporting blockers to the user.
4. If `PR-Review` completes with full approval and all merge gates are true, load and run `sandman-pr-merge`.
5. If a `sandman-pr-review` pass times out or returns without approval, do not mark `PR-Review` complete and do not advance to `PR-Merge` on the next retry. Re-enter `sandman-pr-review` and keep the review loop open until approval is observed or a stop condition is reached.

## Completion Requirements

Before final response, verify and report:

- Whether each required skill checklist was completed.
- Test/format commands run and outcomes.
- PR URL and review status, if a PR was created.
- Whether PR merge was performed or skipped, with reason.
