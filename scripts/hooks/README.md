# Git hooks

Tracked hooks live here so they ship with the repo. They do not run automatically
for clones — install them once per machine with `make install-hooks` (TODO) or:

    git config core.hooksPath scripts/hooks

or copy a single hook:

    cp scripts/hooks/pre-commit .git/hooks/pre-commit

## pre-commit

Blocks any commit that adds or modifies paths under `.sandman/`. Sandman writes
runtime state (`task.md`, `config.yaml`, `events.jsonl`, `batches/`, `reviews/`,
worktrees) into `.sandman/` inside every Sandman-created worktree. None of it
should ever enter git.

`.gitignore` lists `.sandman/`, but that only stops **untracked** paths.
`.sandman/task.md` was committed historically (PR #147) and was re-added to
later branches by `git add -f .sandman/task.md`, polluting every Sandman PR
with a `#N → #current` task file diff. This hook closes that bypass.
