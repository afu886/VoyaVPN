---
name: rollout
description: >-
  Create spec-first rollout packages for large engineering initiatives with a
  selectable Claude Code or Codex runner: a human-readable spec, a
  phase-and-batch execution plan, and an optional generated `rollout.py`.
  Use for multi-phase refactors, migrations, convergence work, or cross-system
  delivery that needs hard rules, verification commands, operational
  constraints, and resumable automated batches.
---

# Rollout

Use this skill for a real delivery program rather than a single coding task:

- multi-phase refactors
- architecture convergence
- platform or infrastructure migrations
- cross-repository integrations
- work that combines code, documentation, verification, and external coordination

Produce either a planning package (spec and plan) or an execution package
(spec, plan, and generated runner). Generate a runner only when every batch is
local, deterministic, non-interactive, fully automatable, and verifiable.

## Output Directory

Keep every generated artifact under the project root's
`.agents/rollouts/<runner-name>/`, where `<runner-name>` is the lowercase,
hyphenated `rollout.name`:

- Spec: `.agents/rollouts/<runner-name>/spec.md`
- Plan: `.agents/rollouts/<runner-name>/plan.md`
- Runner: `.agents/rollouts/<runner-name>/rollout.py`

Let the runtime workdir default to `.agents/rollouts/<runner-name>/logs` so
state, prompts, and logs remain with their rollout. Override it only with a
path inside the same rollout tree.

## Workflow

1. Read the bundled references before drafting:

   - [references/spec-template.md](references/spec-template.md)
   - [references/plan-template.md](references/plan-template.md)
   - [references/orchestration-patterns.md](references/orchestration-patterns.md)

2. Draft the project-specific spec at
   `.agents/rollouts/<runner-name>/spec.md`. Capture current and target state,
   goals, non-goals, boundaries, dependencies, verification, risks, rollback,
   and definition of done. Treat it as the upstream decision source.

3. Draft the plan at `.agents/rollouts/<runner-name>/plan.md`. Keep its YAML
   block between `<!-- rollout-plan:start -->` and `<!-- rollout-plan:end -->`
   complete and valid; [scripts/generate_rollout.py](scripts/generate_rollout.py)
   parses that block. Set `rollout.spec_path` to the spec file so the runner can
   validate and inject it into every batch prompt.

4. Model each phase as a milestone and each batch as the smallest safe,
   end-to-end unit one selected-agent invocation can finish. Use
   `execution: agent` for runnable batches. Keep manual and external work in
   prose or an explicit operations checklist, never in a runner batch.

5. Choose an adapter and generate the runner. Pass `--agent` explicitly unless
   the plan sets `rollout.agent`:

   ```bash
   python3 scripts/generate_rollout.py --agent codex \
     --plan .agents/rollouts/<runner-name>/plan.md
   python3 scripts/generate_rollout.py --agent claude \
     --plan .agents/rollouts/<runner-name>/plan.md
   ```

6. Review the generated runner before execution. Confirm `repo_root`,
   `spec_path`, workdir, sources of truth, hard rules, batch scope, and
   verification commands. Prefer short, idempotent, batch-local checks.

7. Execute or resume it:

   ```bash
   python3 .agents/rollouts/<runner-name>/rollout.py --list
   python3 .agents/rollouts/<runner-name>/rollout.py
   python3 .agents/rollouts/<runner-name>/rollout.py --from-phase 02-contract
   python3 .agents/rollouts/<runner-name>/rollout.py --from-batch 02-02-handlers
   python3 .agents/rollouts/<runner-name>/rollout.py --only-batch 03-01-tests
   python3 .agents/rollouts/<runner-name>/rollout.py --dry-run
   ```

## Agent Adapters

Keep agent-specific behavior in the self-contained adapter files:

- [agents/claude.yaml](agents/claude.yaml) configures Claude Code.
- [agents/openai.yaml](agents/openai.yaml) configures Codex.

The generator embeds the selected adapter into the standalone runner. Use the
generic plan keys below for new plans:

```yaml
rollout:
  agent: "codex" # Optional when --agent is passed to the generator.
  agent_cmd: null # Optional command-template override; {repo} is supported.
  model: null

phases:
  - batches:
      - execution: "agent"
```

Keep compatibility when converting an existing plan: the selected adapter also
accepts its legacy `rollout.claude_cmd` or `rollout.codex_cmd` field, and its
matching `execution: claude` or `execution: codex` value. Normalize them to
the generic form in newly authored plans. A plan cannot select one agent while
using the other agent's legacy batch execution value.

At runner invocation time, use `--agent-cmd` for a generic command override.
The selected runner also accepts `--claude-cmd` or `--codex-cmd` as a legacy
alias. Do not pass both forms together.

The adapters preserve the CLI-specific model rules: Claude Code appends
`--model <id>`; Codex inserts it before the stdin marker (`-`) and ensures that
marker is present. Keep such differences in the adapter rather than duplicating
the runner.

## Planning Rules

- Keep phases coarse and batches fine; use stable numeric IDs such as
  `01-foundation` and `02-03-api-client`.
- Start from current-state evidence and update the spec before changing the
  plan's intended direction.
- Separate in-repository agent work, read-only external references, and manual
  or approval-driven work.
- Put global constraints in `hard_rules`, batch-specific constraints in the
  batch, and runner-enforced facts in YAML.
- Use `batch.depends_on` only when phase order alone is insufficient.
- Use `batch.kind` to label work such as `analysis`, `code`, `docs`, or
  `verification`.
- Keep verification commands non-interactive and deterministic.
- Keep `rollout.spec_path` valid; the generator rejects a missing source spec.

## No Human Intervention In Batches

Make every generated batch decide and execute. Do not pause for a human,
intentionally exit non-zero to surface a diff, request an operator decision,
or write a sentinel for follow-up. Move work that requires approval, cloud
console clicks, external review, or human judgment to prose or an operations
checklist.

When a real runtime choice remains, grant the selected agent authority and a
safe default in `prompt_context`. For example, tell it how to resolve a file
collision and where to record the result for downstream batches.

## When To Split Or Skip A Runner

Split a batch when it crosses separately verifiable subsystems, has multiple
acceptance checkpoints, would make a failed verify rerun unrelated work, or
needs its own commit boundary.

Skip runner generation while the work is exploratory, stakeholder-driven,
dependent on manual vendor actions, judged mostly by humans, or changing shape
daily.

## Runner Behavior

The generated `rollout.py` is standalone and:

- persists state and writes prompts and logs under the configured workdir
- injects the upstream spec into every prompt's sources of truth
- invokes the selected agent by piping each rendered prompt through stdin
- verifies every batch and feeds agent or verification failures into retry prompts
- rejects manual batches at generation time
- resumes unfinished work and supports phase or batch selection flags

Each runner is single-threaded and does not coordinate concurrent rollouts.
Use a wrapper that forwards stdin and preserves exit codes if shared accounts,
rate limits, or CLI state require serialization.
