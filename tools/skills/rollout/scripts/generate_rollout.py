#!/usr/bin/env python3
"""Generate a standalone rollout.py from a Markdown implementation plan."""

from __future__ import annotations

import argparse
import json
import re
import stat
import sys
from pathlib import Path

import yaml


PLAN_BLOCK_RE = re.compile(
    r"<!--\s*rollout-plan:start\s*-->\s*```yaml\s*(.*?)\s*```\s*<!--\s*rollout-plan:end\s*-->",
    re.DOTALL,
)
ID_RE = re.compile(r"^[a-z0-9-]+$")

SKILL_ROOT = Path(__file__).resolve().parents[1]
AGENT_CONFIG_PATHS = {
    "claude": SKILL_ROOT / "agents" / "claude.yaml",
    "codex": SKILL_ROOT / "agents" / "openai.yaml",
}
MODEL_PLACEMENTS = {"append", "before_stdin_marker"}


RUNNER_TEMPLATE = r'''#!/usr/bin/env python3
# 用法:
#   python3 rollout.py --list
#   python3 rollout.py [--from-phase PHASE_ID | --from-batch BATCH_ID | --only-phase PHASE_ID [PHASE_ID ...] | --only-batch BATCH_ID [BATCH_ID ...]]
#                      [--force] [--dry-run] [--commit-per-batch | --no-commit-per-batch] [--agent-cmd CMD] [--model MODEL]
#                      [--reset-batch BATCH_ID] [--max-fix-attempts N] [--allow-dirty]
# 参数说明:
#   --list                  列出所有 phase 和 batch 的当前状态，不执行 rollout。
#   --from-phase PHASE_ID   从指定 phase 开始执行，并包含其后的所有 phase。
#   --from-batch BATCH_ID   从指定 batch 开始执行，并包含其后的所有 batch。
#   --only-phase ...        只执行这些 phase，并自动补齐它们依赖的 phase。
#   --only-batch ...        只执行这些 batch。
#   --force                 即使 batch 已经完成，也强制重新执行。
#   --dry-run               只生成 prompt 和日志路径，不调用所选 agent CLI。
#   --commit-per-batch      每个 batch 成功后自动提交一次 git commit（默认）。
#   --no-commit-per-batch   禁用每个 batch 成功后的自动 git commit。
#   --agent-cmd CMD         覆盖默认的 agent CLI 命令模板。
#   --model MODEL           覆盖 rollout 计划里的模型配置。
#   --reset-batch BATCH_ID  将指定 batch 的状态重置为 pending。
#   --max-fix-attempts N    覆盖计划里的最大自动修复重试次数。
#   --allow-dirty           允许在 git 脏工作区里执行。
from __future__ import annotations

import argparse
import dataclasses
import json
import os
import shlex
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path


PLAN_JSON = __PLAN_JSON_STRING__
PLAN = json.loads(PLAN_JSON)
MAX_VERIFY_OUTPUT_CHARS = 12000
AGENT = PLAN["agent"]


@dataclasses.dataclass
class Batch:
    id: str
    title: str
    kind: str
    execution: str
    goal: str
    depends_on: list[str]
    deliverables: list[str]
    acceptance: list[str]
    evidence_to_capture: list[str]
    verify_commands: list[str]
    files_to_touch: list[str]
    prompt_context: list[str]


@dataclasses.dataclass
class Phase:
    id: str
    title: str
    goal: str
    summary: str
    depends_on: list[str]
    entry_criteria: list[str]
    exit_criteria: list[str]
    risks: list[str]
    batches: list[Batch]


@dataclasses.dataclass
class VerifyFailure:
    cmd: str
    exit_code: int
    output: str


@dataclasses.dataclass
class AgentFailure:
    exit_code: int
    output: str


@dataclasses.dataclass
class VerifyResult:
    ok: bool
    failures: list[VerifyFailure] = dataclasses.field(default_factory=list)


class Colors:
    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    RED = "\033[31m"
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    BLUE = "\033[34m"
    CYAN = "\033[36m"


def c(text: str, *styles: str) -> str:
    if not sys.stdout.isatty():
        return text
    return "".join(styles) + text + Colors.RESET


def require(condition: bool, message: str) -> None:
    if condition:
        return
    print(c(f"! {message}", Colors.RED))
    sys.exit(2)


def build_phase_graph() -> list[Phase]:
    raw_phases = PLAN["phases"]
    phases: list[Phase] = []
    seen_phase_ids: set[str] = set()
    seen_batch_ids: set[str] = set()

    for index, raw_phase in enumerate(raw_phases):
        phase_id = raw_phase["id"]
        require(phase_id not in seen_phase_ids, f"Duplicate phase id: {phase_id}")
        seen_phase_ids.add(phase_id)

        depends_on = list(raw_phase.get("depends_on") or ([] if index == 0 else [raw_phases[index - 1]["id"]]))
        batches: list[Batch] = []
        for raw_batch in raw_phase["batches"]:
            batch_id = raw_batch["id"]
            require(batch_id not in seen_batch_ids, f"Duplicate batch id: {batch_id}")
            seen_batch_ids.add(batch_id)
            batches.append(
                Batch(
                    id=batch_id,
                    title=raw_batch["title"],
                    kind=raw_batch.get("kind") or "code",
                    execution=raw_batch.get("execution") or "agent",
                    goal=raw_batch["goal"],
                    depends_on=list(raw_batch.get("depends_on") or []),
                    deliverables=list(raw_batch.get("deliverables") or []),
                    acceptance=list(raw_batch.get("acceptance") or []),
                    evidence_to_capture=list(raw_batch.get("evidence_to_capture") or []),
                    verify_commands=list(raw_batch.get("verify_commands") or []),
                    files_to_touch=list(raw_batch.get("files_to_touch") or []),
                    prompt_context=list(raw_batch.get("prompt_context") or []),
                )
            )

        phases.append(
            Phase(
                id=phase_id,
                title=raw_phase["title"],
                goal=raw_phase["goal"],
                summary=raw_phase.get("summary") or "",
                depends_on=depends_on,
                entry_criteria=list(raw_phase.get("entry_criteria") or []),
                exit_criteria=list(raw_phase.get("exit_criteria") or []),
                risks=list(raw_phase.get("risks") or []),
                batches=batches,
            )
        )

    phase_ids = {phase.id for phase in phases}
    missing = sorted(
        dependency
        for phase in phases
        for dependency in phase.depends_on
        if dependency not in phase_ids
    )
    require(not missing, f"Unknown phase dependencies: {', '.join(missing)}")
    return phases


ROLLOUT = PLAN["rollout"]
REPO = Path(ROLLOUT["repo_root"]).resolve()
RAW_WORKDIR = Path(ROLLOUT.get("workdir") or f".agents/rollouts/{ROLLOUT['name']}/logs")
WORKDIR = RAW_WORKDIR if RAW_WORKDIR.is_absolute() else REPO / RAW_WORKDIR
STATE = WORKDIR / "state.json"
PROMPTS_DIR = WORKDIR / "prompts"
LOGS_DIR = WORKDIR / "logs"

PHASES = build_phase_graph()
PHASE_BY_ID = {phase.id: phase for phase in PHASES}
BATCH_BY_ID = {batch.id: batch for phase in PHASES for batch in phase.batches}
PHASE_BY_BATCH_ID = {batch.id: phase for phase in PHASES for batch in phase.batches}
ALL_BATCH_IDS = [batch.id for phase in PHASES for batch in phase.batches]


def validate_batch_dependencies() -> None:
    missing = sorted(
        dependency
        for batch in BATCH_BY_ID.values()
        for dependency in batch.depends_on
        if dependency not in BATCH_BY_ID
    )
    require(not missing, f"Unknown batch dependencies: {', '.join(missing)}")

    self_refs = sorted(batch.id for batch in BATCH_BY_ID.values() if batch.id in batch.depends_on)
    require(not self_refs, f"Batch cannot depend on itself: {', '.join(self_refs)}")


validate_batch_dependencies()


def display_path(path: Path) -> str:
    try:
        return str(path.relative_to(REPO))
    except ValueError:
        return str(path)


def truncate_output(text: str, limit: int = MAX_VERIFY_OUTPUT_CHARS) -> str:
    text = text.strip()
    if len(text) <= limit:
        return text
    return text[: limit - 16].rstrip() + "\n...[truncated]"


def load_state() -> dict:
    if not STATE.exists():
        return {"batches": {}}
    return json.loads(STATE.read_text())


def save_state(state: dict) -> None:
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(state, indent=2, ensure_ascii=False))


def mark_batch(state: dict, batch_id: str, status: str, **extra) -> None:
    state["batches"][batch_id] = {
        "status": status,
        "ts": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        **extra,
    }
    save_state(state)


def ensure_dirs() -> None:
    for directory in (WORKDIR, PROMPTS_DIR, LOGS_DIR):
        directory.mkdir(parents=True, exist_ok=True)


def append_log(log_path: Path, text: str) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("ab") as handle:
        handle.write(text.encode())


def render_bullets(values: list[str], formatter) -> list[str]:
    if not values:
        return ["- None"]
    return [formatter(value) for value in values]


def render_prompt(phase: Phase, batch: Batch, extra_notes: str | None = None) -> str:
    sources = list(ROLLOUT.get("sources_of_truth") or [])
    planning_notes = list(ROLLOUT.get("planning_notes") or [])
    success_metrics = list(ROLLOUT.get("success_metrics") or [])
    global_context = list(ROLLOUT.get("global_context") or [])
    hard_rules = list(ROLLOUT.get("hard_rules") or [])
    suffix = list(ROLLOUT.get("batch_prompt_suffix") or [])

    parts = [
        f"# Batch {batch.id}: {batch.title}",
        "",
        f"You are implementing the rollout `{ROLLOUT['name']}` in the repository rooted at `{REPO}`.",
        "",
        "## Phase",
        f"- `{phase.id}` — {phase.title}",
        f"- Goal: {phase.goal}",
    ]
    if phase.summary:
        parts.append(f"- Context: {phase.summary}")
    if phase.entry_criteria:
        parts.extend(
            [
                "",
                "## Phase Entry Criteria",
                *render_bullets(phase.entry_criteria, lambda value: f"- {value}"),
            ]
        )
    if phase.exit_criteria:
        parts.extend(
            [
                "",
                "## Phase Exit Criteria",
                *render_bullets(phase.exit_criteria, lambda value: f"- {value}"),
            ]
        )
    if phase.risks:
        parts.extend(
            [
                "",
                "## Phase Risks",
                *render_bullets(phase.risks, lambda value: f"- {value}"),
            ]
        )

    parts.extend(
        [
            "",
            "## Batch Shape",
            f"- Kind: `{batch.kind}`",
            f"- Execution: `{batch.execution}`",
            "",
            "## Batch Goal",
            batch.goal,
            "",
            "## Depends On",
            *render_bullets(batch.depends_on, lambda value: f"- `{value}`"),
            "",
            "## Deliverables",
            *render_bullets(batch.deliverables, lambda value: f"- {value}"),
            "",
            "## Acceptance",
            *render_bullets(batch.acceptance, lambda value: f"- {value}"),
            "",
            "## Evidence To Capture",
            *render_bullets(batch.evidence_to_capture, lambda value: f"- {value}"),
            "",
            "## Verification Commands (must pass before declaring success)",
            *render_bullets(batch.verify_commands, lambda value: f"- `{value}`"),
        ]
    )

    if batch.files_to_touch:
        parts.extend(
            [
                "",
                "## Likely Files",
                *[f"- `{value}`" for value in batch.files_to_touch],
            ]
        )

    parts.extend(
        [
            "",
            "## Sources Of Truth",
            *render_bullets(sources, lambda value: f"- `{value}`"),
            "",
            "## Planning Notes",
            *render_bullets(planning_notes, lambda value: f"- {value}"),
            "",
            "## Success Metrics",
            *render_bullets(success_metrics, lambda value: f"- {value}"),
            "",
            "## Global Context",
            *render_bullets(global_context, lambda value: f"- {value}"),
            "",
            "## Hard Rules",
            *render_bullets(hard_rules, lambda value: f"- {value}"),
        ]
    )

    if batch.prompt_context:
        parts.extend(
            [
                "",
                "## Batch Context",
                *[f"- {value}" for value in batch.prompt_context],
            ]
        )

    if suffix:
        parts.extend(
            [
                "",
                "## Working Agreement",
                *[f"- {value}" for value in suffix],
            ]
        )

    if extra_notes:
        parts.extend(
            [
                "",
                "## Retry Context",
                extra_notes.rstrip(),
            ]
        )

    parts.append("")
    return "\n".join(parts)


def write_prompt(phase: Phase, batch: Batch, attempt: int, extra_notes: str | None) -> Path:
    suffix = "" if attempt == 0 else f".retry{attempt}"
    path = PROMPTS_DIR / f"{batch.id}{suffix}.md"
    path.write_text(render_prompt(phase, batch, extra_notes=extra_notes))
    return path


def run_shell(cmd: str, cwd: Path = REPO, check: bool = True, *, capture_output: bool = False) -> subprocess.CompletedProcess:
    print(c(f"$ {cmd}", Colors.DIM))
    return subprocess.run(
        cmd,
        shell=True,
        cwd=cwd,
        check=check,
        capture_output=capture_output,
        text=capture_output,
    )


def invoke_agent(
    phase: Phase,
    batch: Batch,
    agent_cmd: list[str],
    log_path: Path,
    dry_run: bool,
    *,
    attempt: int = 0,
    extra_notes: str | None = None,
) -> tuple[int, Path, str]:
    prompt_path = write_prompt(phase, batch, attempt=attempt, extra_notes=extra_notes)
    print(c(f"→ prompt: {display_path(prompt_path)}", Colors.DIM))
    print(c(f"→ log:    {display_path(log_path)}", Colors.DIM))

    if dry_run:
        print(c(f"  (dry-run, skipping {AGENT['name']} invocation)", Colors.YELLOW))
        return 0, prompt_path, ""

    mode = "wb" if attempt == 0 else "ab"
    with prompt_path.open("rb") as stdin, log_path.open(mode) as log:
        if attempt > 0:
            log.write(b"\n")
        log.write(f"# {AGENT['name']} invocation {attempt + 1} for {batch.id}\n".encode())
        log.write(f"# cmd: {shlex.join(agent_cmd)}\n".encode())
        log.write(f"# ts:  {datetime.now(timezone.utc).isoformat()}\n\n".encode())
        log.flush()
        proc = subprocess.Popen(
            agent_cmd,
            cwd=REPO,
            stdin=stdin,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )
        assert proc.stdout is not None
        output = bytearray()
        for line in proc.stdout:
            sys.stdout.buffer.write(line)
            sys.stdout.buffer.flush()
            log.write(line)
            output.extend(line)
        return proc.wait(), prompt_path, output.decode("utf-8", errors="replace").rstrip()


def verify_batch(batch: Batch, log_path: Path) -> VerifyResult:
    if not batch.verify_commands:
        return VerifyResult(ok=True)

    print(c(f"▶ verifying {batch.id}", Colors.CYAN))
    append_log(log_path, f"\n# verification for {batch.id}\n")

    for cmd in batch.verify_commands:
        append_log(log_path, f"\n$ {cmd}\n")
        proc = run_shell(cmd, check=False, capture_output=True)
        output = ((proc.stdout or "") + (proc.stderr or "")).rstrip()
        if output:
            print(output)
            append_log(log_path, output + "\n")
        append_log(log_path, f"[exit {proc.returncode}]\n")
        if proc.returncode != 0:
            print(c(f"✗ verify failed: {cmd} (exit {proc.returncode})", Colors.RED))
            return VerifyResult(
                ok=False,
                failures=[
                    VerifyFailure(
                        cmd=cmd,
                        exit_code=proc.returncode,
                        output=truncate_output(output or "(no output)"),
                    )
                ],
            )
    return VerifyResult(ok=True)


def git_is_clean() -> bool:
    result = subprocess.run(
        "git status --porcelain",
        shell=True,
        cwd=REPO,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip() == ""


def build_agent_retry_notes(batch: Batch, agent_failure: AgentFailure, retry_number: int) -> str:
    return "\n".join(
        [
            f"The previous {AGENT['display_name']} CLI attempt for batch `{batch.id}` exited with a non-zero status.",
            f"Retry number: {retry_number}",
            "",
            "Inspect the error output below, keep any useful in-progress changes, and continue fixing the batch.",
            "Before you finish, rerun the verification commands yourself and confirm they are green.",
            "",
            f"### {AGENT['display_name']} CLI Failure",
            f"Exit code: `{agent_failure.exit_code}`",
            "Output:",
            "```text",
            agent_failure.output,
            "```",
            "",
        ]
    )


def build_verify_retry_notes(batch: Batch, verify_result: VerifyResult, retry_number: int) -> str:
    parts = [
        f"The previous attempt for batch `{batch.id}` failed verification.",
        f"Retry number: {retry_number}",
        "",
        "Fix the implementation so that every verification command passes.",
        "Before you finish, rerun the verification commands yourself and confirm they are green.",
        "",
    ]
    for index, failure in enumerate(verify_result.failures, start=1):
        parts.extend(
            [
                f"### Failed Check {index}",
                f"Command: `{failure.cmd}`",
                f"Exit code: `{failure.exit_code}`",
                "Output:",
                "```text",
                failure.output,
                "```",
                "",
            ]
        )
    return "\n".join(parts)


def git_commit_batch(batch: Batch) -> None:
    print(c("$ git add -A", Colors.DIM))
    subprocess.run(["git", "add", "-A"], cwd=REPO, check=False)
    if git_is_clean():
        print(c("  (no changes to commit)", Colors.DIM))
        return
    message = f"rollout({batch.id}): {batch.title}\n\nAutomated commit by generated rollout.py"
    print(c("$ git commit -m <batch message>", Colors.DIM))
    subprocess.run(["git", "commit", "-m", message], cwd=REPO, check=True)


def strip_outer_quotes(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
        return value[1:-1]
    return value


def split_command_line(command: str) -> list[str]:
    if sys.platform == "win32":
        return [strip_outer_quotes(part) for part in shlex.split(command, posix=False)]
    return shlex.split(command)


def find_executable(command: str) -> str | None:
    resolved = shutil.which(command)
    if resolved:
        return resolved

    candidate = Path(command)
    if candidate.exists():
        return str(candidate)

    if sys.platform != "win32":
        return None

    suffixes = [""] if candidate.suffix else [".cmd", ".bat", ".exe", ".ps1"]
    search_dirs = os.environ.get("PATH", "").split(os.pathsep)
    for directory in search_dirs:
        if not directory:
            continue
        for suffix in suffixes:
            executable = Path(directory) / f"{command}{suffix}"
            if executable.exists():
                return str(executable)
    return None


def resolve_executable_command(command: str) -> list[str]:
    executable = find_executable(command)
    if executable is None:
        print(
            c(
                f"! 未找到命令 `{command}`。请安装 {AGENT['display_name']} CLI，"
                f"或使用 --agent-cmd / {AGENT['legacy_command_flag']} 覆盖。",
                Colors.RED,
            )
        )
        sys.exit(2)

    if sys.platform == "win32" and Path(executable).suffix.lower() == ".ps1":
        launcher = shutil.which("pwsh") or shutil.which("powershell")
        if launcher is None:
            print(c(f"! `{command}` 解析为 PowerShell 脚本，但未找到 pwsh/powershell。", Colors.RED))
            sys.exit(2)
        script_path = executable.replace("'", "''")
        return [launcher, "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", f"$input | & '{script_path}' @args"]

    return [executable]


def resolve_agent_cmd(user_cmd: str | None, model: str | None) -> list[str]:
    template = user_cmd or ROLLOUT.get("agent_cmd") or AGENT["default_command"]
    rendered = template.format(repo=str(REPO))
    cmd = split_command_line(rendered)
    require(bool(cmd), f"{AGENT['display_name']} command is empty.")
    cmd = [*resolve_executable_command(cmd[0]), *cmd[1:]]
    if model and "--model" not in cmd:
        if AGENT["model_placement"] == "before_stdin_marker" and AGENT["stdin_marker"] in cmd:
            index = cmd.index(AGENT["stdin_marker"])
            cmd[index:index] = ["--model", model]
        else:
            cmd.extend(["--model", model])
    if AGENT["ensure_stdin_marker"] and AGENT["stdin_marker"] not in cmd:
        cmd.append(AGENT["stdin_marker"])
    return cmd


def ordered_unique(items: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        ordered.append(item)
    return ordered


def phase_dependency_ids(phase_id: str) -> list[str]:
    ordered: list[str] = []
    visited: set[str] = set()

    def visit(target_id: str) -> None:
        for dependency in PHASE_BY_ID[target_id].depends_on:
            if dependency in visited:
                continue
            visit(dependency)
            visited.add(dependency)
            ordered.append(dependency)

    visit(phase_id)
    return ordered


def batch_prerequisites(batch_id: str) -> list[str]:
    batch = BATCH_BY_ID[batch_id]
    phase = PHASE_BY_BATCH_ID[batch_id]
    phase_dependency_set = set(phase_dependency_ids(phase.id))
    prerequisites: list[str] = []

    for candidate_phase in PHASES:
        if candidate_phase.id in phase_dependency_set:
            prerequisites.extend(batch.id for batch in candidate_phase.batches)

    for candidate_batch in phase.batches:
        if candidate_batch.id == batch_id:
            break
        prerequisites.append(candidate_batch.id)

    prerequisites.extend(batch.depends_on)
    return ordered_unique(prerequisites)


def require_known_phase_ids(flag: str, phase_ids: list[str]) -> None:
    unknown = [phase_id for phase_id in phase_ids if phase_id not in PHASE_BY_ID]
    require(not unknown, f"{flag} contains unknown phase ids: {', '.join(unknown)}")


def require_known_batch_ids(flag: str, batch_ids: list[str]) -> None:
    unknown = [batch_id for batch_id in batch_ids if batch_id not in BATCH_BY_ID]
    require(not unknown, f"{flag} contains unknown batch ids: {', '.join(unknown)}")


def expand_phase_ids_with_dependencies(phase_ids: list[str]) -> list[str]:
    ordered: list[str] = []
    visited: set[str] = set()
    visiting: set[str] = set()

    def visit(phase_id: str) -> None:
        if phase_id in visited:
            return
        require(phase_id not in visiting, f"Cyclic phase dependency detected at {phase_id}")
        visiting.add(phase_id)
        for dependency in PHASE_BY_ID[phase_id].depends_on:
            visit(dependency)
        visiting.remove(phase_id)
        visited.add(phase_id)
        ordered.append(phase_id)

    for phase_id in phase_ids:
        visit(phase_id)
    return ordered


def batch_ids_for_phases(phase_ids: list[str]) -> list[str]:
    phase_set = set(phase_ids)
    return [batch.id for phase in PHASES if phase.id in phase_set for batch in phase.batches]


def select_batch_ids(args, state: dict) -> list[str]:
    if args.only_phase:
        require_known_phase_ids("--only-phase", args.only_phase)
        phase_ids = expand_phase_ids_with_dependencies(ordered_unique(args.only_phase))
        selected = batch_ids_for_phases(phase_ids)
    elif args.only_batch:
        require_known_batch_ids("--only-batch", args.only_batch)
        target_set = set(args.only_batch)
        selected = [batch_id for batch_id in ALL_BATCH_IDS if batch_id in target_set]
    elif args.from_phase:
        require_known_phase_ids("--from-phase", [args.from_phase])
        start_index = next(index for index, phase in enumerate(PHASES) if phase.id == args.from_phase)
        selected = [batch.id for phase in PHASES[start_index:] for batch in phase.batches]
    elif args.from_batch:
        require_known_batch_ids("--from-batch", [args.from_batch])
        start_index = ALL_BATCH_IDS.index(args.from_batch)
        selected = ALL_BATCH_IDS[start_index:]
    else:
        selected = list(ALL_BATCH_IDS)

    if args.force:
        return selected

    done = {
        batch_id
        for batch_id, info in state.get("batches", {}).items()
        if info.get("status") == "done"
    }
    return [batch_id for batch_id in selected if batch_id not in done]


def ensure_selection_ready(selected_batch_ids: list[str], state: dict) -> None:
    completed = {
        batch_id
        for batch_id, info in state.get("batches", {}).items()
        if info.get("status") == "done"
    }
    planned_now: set[str] = set()

    for batch_id in selected_batch_ids:
        missing = [
            dependency
            for dependency in batch_prerequisites(batch_id)
            if dependency not in completed and dependency not in planned_now
        ]
        require(
            not missing,
            f"Batch `{batch_id}` is blocked by unfinished prerequisites: {', '.join(missing)}. "
            "Run an earlier phase or batch first, or rerun with a broader selection.",
        )
        planned_now.add(batch_id)


def batch_status(state: dict, batch_id: str) -> str:
    return state.get("batches", {}).get(batch_id, {}).get("status", "pending")


def phase_status(phase: Phase, state: dict) -> tuple[str, int, int]:
    statuses = [batch_status(state, batch.id) for batch in phase.batches]
    done_count = sum(status == "done" for status in statuses)
    total = len(statuses)
    if done_count == total:
        return "done", done_count, total
    if "failed" in statuses:
        return "failed", done_count, total
    if "running" in statuses:
        return "running", done_count, total
    if done_count:
        return "partial", done_count, total
    return "pending", done_count, total


def list_plan(state: dict) -> None:
    print(c(f"Rollout: {ROLLOUT['name']}", Colors.BOLD))
    for phase in PHASES:
        status, done_count, total = phase_status(phase, state)
        print(f"  {phase.id}  {phase.title}  [{status} {done_count}/{total}]")
        for batch in phase.batches:
            print(
                f"    - {batch.id}  {batch.title}  "
                f"[{batch_status(state, batch.id)}; {batch.execution}/{batch.kind}]"
            )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=f"Run rollout plan: {ROLLOUT['name']}",
    )
    parser.add_argument("--list", action="store_true", help="List phases and batch status")

    selection = parser.add_mutually_exclusive_group()
    selection.add_argument("--from-phase", dest="from_phase", metavar="PHASE_ID", help="Start from this phase")
    selection.add_argument("--from-batch", dest="from_batch", metavar="BATCH_ID", help="Start from this batch")
    selection.add_argument("--only-phase", nargs="+", metavar="PHASE_ID", help="Run only these phases")
    selection.add_argument("--only-batch", nargs="+", metavar="BATCH_ID", help="Run only these batches")

    parser.add_argument("--force", action="store_true", help="Rerun selected batches even if already done")
    parser.add_argument("--dry-run", action="store_true", help="Write prompts only, do not invoke the selected agent")
    commit_group = parser.add_mutually_exclusive_group()
    commit_group.add_argument(
        "--commit-per-batch",
        dest="commit_per_batch",
        action="store_true",
        default=None,
        help="Commit after each successful batch (default)",
    )
    commit_group.add_argument(
        "--no-commit-per-batch",
        dest="commit_per_batch",
        action="store_false",
        help="Do not commit after each successful batch",
    )
    parser.add_argument("--agent-cmd", help="Override the selected agent command template")
    parser.add_argument(
        AGENT["legacy_command_flag"],
        dest="legacy_agent_cmd",
        help=f"Legacy alias for --agent-cmd when running {AGENT['display_name']}",
    )
    parser.add_argument("--model", help=f"Override the {AGENT['display_name']} model")
    parser.add_argument("--reset-batch", metavar="BATCH_ID", help="Reset one batch to pending state")
    parser.add_argument(
        "--max-fix-attempts",
        type=int,
        default=None,
        help="Retries after agent or verification failures; defaults to the plan value",
    )
    parser.add_argument("--allow-dirty", action="store_true", help="Allow a dirty git worktree")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.agent_cmd and args.legacy_agent_cmd:
        print(c("! Pass only one of --agent-cmd and the legacy agent command flag.", Colors.RED))
        return 2
    state = load_state()

    if args.list:
        list_plan(state)
        return 0

    if args.reset_batch:
        require_known_batch_ids("--reset-batch", [args.reset_batch])
        state.setdefault("batches", {}).pop(args.reset_batch, None)
        save_state(state)
        print(c(f"Reset batch `{args.reset_batch}` to pending.", Colors.GREEN))
        return 0

    require(REPO.exists(), f"Repository root does not exist: {REPO}")

    max_fix_attempts = (
        ROLLOUT.get("max_fix_attempts", 1)
        if args.max_fix_attempts is None
        else args.max_fix_attempts
    )
    require(max_fix_attempts >= 0, "--max-fix-attempts cannot be negative.")

    allow_dirty = bool(ROLLOUT.get("allow_dirty", False) or args.allow_dirty)
    commit_per_batch = bool(
        ROLLOUT.get("commit_per_batch", True)
        if args.commit_per_batch is None
        else args.commit_per_batch
    )
    require(
        not (commit_per_batch and allow_dirty),
        "`commit_per_batch` cannot be combined with `--allow-dirty`; pass `--no-commit-per-batch` or set `rollout.commit_per_batch: false`.",
    )

    if not allow_dirty and not git_is_clean():
        print(c("! Working tree is dirty. Commit first or pass --allow-dirty.", Colors.RED))
        return 2

    ensure_dirs()
    model = args.model or ROLLOUT.get("model")
    if args.dry_run:
        agent_cmd = AGENT["dry_run_command"]
    else:
        agent_cmd = resolve_agent_cmd(args.agent_cmd or args.legacy_agent_cmd, model)
        print(c(f"{AGENT['name']} cmd: {shlex.join(agent_cmd)}", Colors.DIM))

    selected_batch_ids = select_batch_ids(args, state)
    if not selected_batch_ids:
        print(c("All selected batches are already complete.", Colors.GREEN))
        return 0

    ensure_selection_ready(selected_batch_ids, state)

    print(c(f"Running {len(selected_batch_ids)} batch(es):", Colors.BOLD))
    for batch_id in selected_batch_ids:
        phase = PHASE_BY_BATCH_ID[batch_id]
        batch = BATCH_BY_ID[batch_id]
        print(f"  - {batch.id}  {batch.title}  ({phase.id})")

    for batch_id in selected_batch_ids:
        phase = PHASE_BY_BATCH_ID[batch_id]
        batch = BATCH_BY_ID[batch_id]
        banner = f"═══ {phase.id} / {batch.id} · {batch.title} ═══"
        print("\n" + c(banner, Colors.BOLD, Colors.BLUE))

        log_path = LOGS_DIR / f"{batch.id}.log"
        t0 = time.time()
        extra_notes: str | None = None
        attempt = 0

        if not args.dry_run:
            mark_batch(state, batch.id, "running")

        while True:
            rc, prompt_path, agent_output = invoke_agent(
                phase,
                batch,
                agent_cmd,
                log_path,
                args.dry_run,
                attempt=attempt,
                extra_notes=extra_notes,
            )
            elapsed = time.time() - t0

            if rc != 0:
                agent_failure = AgentFailure(
                    exit_code=rc,
                    output=truncate_output(agent_output or "(no output)"),
                )
                if attempt < max_fix_attempts:
                    attempt += 1
                    extra_notes = build_agent_retry_notes(batch, agent_failure, attempt)
                    print(c(f"↺ {batch.id} {AGENT['name']} exited with {rc}, retrying ({attempt})", Colors.YELLOW))
                    continue
                if not args.dry_run:
                    mark_batch(
                        state,
                        batch.id,
                        "failed",
                        exit_code=rc,
                        reason="agent_failed",
                        log=display_path(log_path),
                        prompt=display_path(prompt_path),
                        agent_failure={
                            "exit_code": agent_failure.exit_code,
                            "output": agent_failure.output,
                        },
                    )
                print(c(f"✗ {batch.id} {AGENT['name']} exited with {rc} ({elapsed:.0f}s)", Colors.RED))
                return rc

            if args.dry_run:
                print(c(f"◌ {batch.id} prompt generated ({elapsed:.0f}s)", Colors.CYAN))
                break

            verify_result = verify_batch(batch, log_path)
            if verify_result.ok:
                mark_batch(
                    state,
                    batch.id,
                    "done",
                    duration_sec=round(elapsed, 1),
                    log=display_path(log_path),
                    prompt=display_path(prompt_path),
                )
                print(c(f"✔ {batch.id} complete ({elapsed:.0f}s)", Colors.GREEN))
                if commit_per_batch:
                    git_commit_batch(batch)
                break

            if attempt >= max_fix_attempts:
                mark_batch(
                    state,
                    batch.id,
                    "failed",
                    reason="verify_failed",
                    log=display_path(log_path),
                    prompt=display_path(prompt_path),
                    verify_failures=[
                        {
                            "cmd": failure.cmd,
                            "exit_code": failure.exit_code,
                            "output": failure.output,
                        }
                        for failure in verify_result.failures
                    ],
                )
                print(c(f"✗ {batch.id} failed verification", Colors.RED))
                return 1

            attempt += 1
            extra_notes = build_verify_retry_notes(batch, verify_result, attempt)
            print(c(f"↺ {batch.id} verification failed, retrying ({attempt})", Colors.YELLOW))

    print("\n" + c("All selected batches completed.", Colors.BOLD, Colors.GREEN))
    return 0


if __name__ == "__main__":
    sys.exit(main())
'''


def fail(message: str) -> None:
    print(f"[ERROR] {message}")
    sys.exit(1)


def require(condition: bool, message: str) -> None:
    if not condition:
        fail(message)


def as_string(value, field_name: str) -> str:
    require(isinstance(value, str) and value.strip(), f"{field_name} must be a non-empty string")
    return value.strip()


def as_string_list(value, field_name: str) -> list[str]:
    if value is None:
        return []
    require(isinstance(value, list), f"{field_name} must be a list")
    normalized: list[str] = []
    for index, item in enumerate(value):
        require(isinstance(item, str) and item.strip(), f"{field_name}[{index}] must be a non-empty string")
        normalized.append(item.strip())
    return normalized


def as_optional_string(value, field_name: str) -> str:
    if value is None:
        return ""
    require(isinstance(value, str), f"{field_name} must be a string")
    return value.strip()


def as_choice(value, field_name: str, choices: set[str]) -> str:
    result = as_string(value, field_name)
    require(result in choices, f"{field_name} must be one of: {', '.join(sorted(choices))}")
    return result


def as_bool(value, field_name: str) -> bool:
    require(isinstance(value, bool), f"{field_name} must be a boolean")
    return value


def as_int(value, field_name: str) -> int:
    require(isinstance(value, int), f"{field_name} must be an integer")
    return value


def load_agent_adapter(agent_name: str) -> dict:
    require(
        agent_name in AGENT_CONFIG_PATHS,
        f"--agent must be one of: {', '.join(sorted(AGENT_CONFIG_PATHS))}",
    )
    adapter_path = AGENT_CONFIG_PATHS[agent_name]
    require(adapter_path.is_file(), f"Agent adapter not found: {adapter_path}")
    try:
        raw = yaml.safe_load(adapter_path.read_text())
    except yaml.YAMLError as exc:
        fail(f"Invalid YAML in agent adapter {adapter_path}: {exc}")

    require(isinstance(raw, dict), f"Agent adapter must decode to a YAML dictionary: {adapter_path}")
    rollout = raw.get("rollout")
    require(isinstance(rollout, dict), f"Agent adapter is missing `rollout`: {adapter_path}")

    adapter = {
        "name": as_choice(rollout.get("name"), f"{adapter_path}.rollout.name", set(AGENT_CONFIG_PATHS)),
        "display_name": as_string(rollout.get("display_name"), f"{adapter_path}.rollout.display_name"),
        "default_command": as_string(
            rollout.get("default_command"),
            f"{adapter_path}.rollout.default_command",
        ),
        "dry_run_command": as_string_list(
            rollout.get("dry_run_command"),
            f"{adapter_path}.rollout.dry_run_command",
        ),
        "legacy_command_key": as_string(
            rollout.get("legacy_command_key"),
            f"{adapter_path}.rollout.legacy_command_key",
        ),
        "legacy_command_flag": as_string(
            rollout.get("legacy_command_flag"),
            f"{adapter_path}.rollout.legacy_command_flag",
        ),
        "model_placement": as_choice(
            rollout.get("model_placement"),
            f"{adapter_path}.rollout.model_placement",
            MODEL_PLACEMENTS,
        ),
        "stdin_marker": as_optional_string(
            rollout.get("stdin_marker"),
            f"{adapter_path}.rollout.stdin_marker",
        ),
        "ensure_stdin_marker": as_bool(
            rollout.get("ensure_stdin_marker"),
            f"{adapter_path}.rollout.ensure_stdin_marker",
        ),
    }
    require(adapter["name"] == agent_name, f"Adapter name does not match selected agent: {adapter_path}")
    require(adapter["dry_run_command"], f"{adapter_path}.rollout.dry_run_command must not be empty")
    require(
        not adapter["ensure_stdin_marker"] or bool(adapter["stdin_marker"]),
        f"{adapter_path}.rollout.stdin_marker is required when ensure_stdin_marker is true",
    )
    require(
        adapter["model_placement"] != "before_stdin_marker" or bool(adapter["stdin_marker"]),
        f"{adapter_path}.rollout.stdin_marker is required for before_stdin_marker model placement",
    )
    return adapter


def require_existing_repo_path(repo_root: Path, value: str, field_name: str) -> None:
    path = Path(value)
    resolved = path if path.is_absolute() else repo_root / path
    require(resolved.exists(), f"{field_name} must point to an existing file or directory: {value}")


def load_plan_block(plan_path: Path) -> dict:
    require(plan_path.exists(), f"Plan file not found: {plan_path}")
    content = plan_path.read_text()
    match = PLAN_BLOCK_RE.search(content)
    require(
        match is not None,
        "Could not find a YAML block between <!-- rollout-plan:start --> and <!-- rollout-plan:end -->.",
    )
    try:
        data = yaml.safe_load(match.group(1))
    except yaml.YAMLError as exc:
        fail(f"Invalid YAML in plan block: {exc}")
    require(isinstance(data, dict), "Plan block must decode to a YAML dictionary.")
    return data


def infer_legacy_agent(data: dict) -> str | None:
    """Infer an adapter only for plans written before rollout.agent existed."""
    candidates: set[str] = set()
    raw_rollout = data.get("rollout")
    if isinstance(raw_rollout, dict):
        if "claude_cmd" in raw_rollout:
            candidates.add("claude")
        if "codex_cmd" in raw_rollout:
            candidates.add("codex")

    raw_phases = data.get("phases")
    if isinstance(raw_phases, list):
        for raw_phase in raw_phases:
            if not isinstance(raw_phase, dict):
                continue
            raw_batches = raw_phase.get("batches")
            if not isinstance(raw_batches, list):
                continue
            for raw_batch in raw_batches:
                if not isinstance(raw_batch, dict):
                    continue
                execution = raw_batch.get("execution")
                if execution in AGENT_CONFIG_PATHS:
                    candidates.add(execution)

    require(
        len(candidates) <= 1,
        "Could not infer one agent from legacy plan fields; pass --agent claude|codex.",
    )
    return next(iter(candidates), None)


def validate_rollout(raw: dict, plan_path: Path, adapter: dict) -> dict:
    require(isinstance(raw, dict), "Top-level rollout config must be a dictionary.")
    plan_agent = raw.get("agent")
    if plan_agent is not None:
        plan_agent = as_choice(plan_agent, "rollout.agent", set(AGENT_CONFIG_PATHS))
        require(
            plan_agent == adapter["name"],
            f"rollout.agent is `{plan_agent}`, but --agent selected `{adapter['name']}`",
        )

    legacy_command_key = adapter["legacy_command_key"]
    agent_cmd = raw.get("agent_cmd")
    legacy_agent_cmd = raw.get(legacy_command_key)
    if agent_cmd is not None:
        agent_cmd = as_string(agent_cmd, "rollout.agent_cmd")
    if legacy_agent_cmd is not None:
        legacy_agent_cmd = as_string(legacy_agent_cmd, f"rollout.{legacy_command_key}")
    if agent_cmd is not None and legacy_agent_cmd is not None:
        require(
            agent_cmd == legacy_agent_cmd,
            f"rollout.agent_cmd and rollout.{legacy_command_key} must match when both are set",
        )

    repo_root = Path(as_string(raw.get("repo_root"), "rollout.repo_root"))
    if not repo_root.is_absolute():
        repo_root = (plan_path.parent / repo_root).resolve()

    name = as_string(raw.get("name"), "rollout.name")
    default_spec_path = f".agents/rollouts/{name}/spec.md"
    default_workdir = f".agents/rollouts/{name}/logs"
    spec_path = as_string(raw.get("spec_path", default_spec_path), "rollout.spec_path")
    require_existing_repo_path(repo_root, spec_path, "rollout.spec_path")
    sources_of_truth = as_string_list(raw.get("sources_of_truth", []), "rollout.sources_of_truth")
    if spec_path not in sources_of_truth:
        sources_of_truth = [spec_path, *sources_of_truth]
    rollout = {
        "name": name,
        "agent": adapter["name"],
        "repo_root": str(repo_root),
        "spec_path": spec_path,
        "workdir": as_string(raw.get("workdir", default_workdir), "rollout.workdir"),
        "agent_cmd": agent_cmd or legacy_agent_cmd,
        "model": raw.get("model"),
        "max_fix_attempts": as_int(raw.get("max_fix_attempts", 1), "rollout.max_fix_attempts"),
        "allow_dirty": as_bool(raw.get("allow_dirty", False), "rollout.allow_dirty"),
        "commit_per_batch": as_bool(raw.get("commit_per_batch", True), "rollout.commit_per_batch"),
        "sources_of_truth": sources_of_truth,
        "planning_notes": as_string_list(raw.get("planning_notes", []), "rollout.planning_notes"),
        "success_metrics": as_string_list(raw.get("success_metrics", []), "rollout.success_metrics"),
        "global_context": as_string_list(raw.get("global_context", []), "rollout.global_context"),
        "hard_rules": as_string_list(raw.get("hard_rules", []), "rollout.hard_rules"),
        "batch_prompt_suffix": as_string_list(raw.get("batch_prompt_suffix", []), "rollout.batch_prompt_suffix"),
    }

    if rollout["model"] is not None:
        rollout["model"] = as_string(rollout["model"], "rollout.model")

    require(rollout["max_fix_attempts"] >= 0, "rollout.max_fix_attempts must be >= 0")
    return rollout


def validate_phases(raw_phases: object, adapter: dict) -> list[dict]:
    require(isinstance(raw_phases, list) and raw_phases, "phases must be a non-empty list")

    normalized: list[dict] = []
    seen_phase_ids: set[str] = set()
    seen_batch_ids: set[str] = set()

    for phase_index, raw_phase in enumerate(raw_phases):
        require(isinstance(raw_phase, dict), f"phases[{phase_index}] must be a dictionary")
        phase_id = as_string(raw_phase.get("id"), f"phases[{phase_index}].id")
        require(ID_RE.match(phase_id) is not None, f"Invalid phase id: {phase_id}")
        require(phase_id not in seen_phase_ids, f"Duplicate phase id: {phase_id}")
        seen_phase_ids.add(phase_id)

        depends_on_value = raw_phase.get("depends_on")
        if depends_on_value is None:
            depends_on = [] if phase_index == 0 else [normalized[phase_index - 1]["id"]]
        else:
            depends_on = as_string_list(depends_on_value, f"phases[{phase_index}].depends_on")

        raw_batches = raw_phase.get("batches")
        require(isinstance(raw_batches, list) and raw_batches, f"phases[{phase_index}].batches must be a non-empty list")
        batches: list[dict] = []
        for batch_index, raw_batch in enumerate(raw_batches):
            require(isinstance(raw_batch, dict), f"phases[{phase_index}].batches[{batch_index}] must be a dictionary")
            batch_id = as_string(raw_batch.get("id"), f"phases[{phase_index}].batches[{batch_index}].id")
            require(ID_RE.match(batch_id) is not None, f"Invalid batch id: {batch_id}")
            require(batch_id not in seen_batch_ids, f"Duplicate batch id: {batch_id}")
            seen_batch_ids.add(batch_id)
            batch_kind = as_string(raw_batch.get("kind", "code"), f"{batch_id}.kind")
            require(
                batch_kind != "manual",
                f"{batch_id}.kind cannot be `manual`; keep non-automated work in prose or a separate checklist",
            )
            manual_instructions = as_string_list(
                raw_batch.get("manual_instructions", []),
                f"{batch_id}.manual_instructions",
            )
            require(
                not manual_instructions,
                f"{batch_id}.manual_instructions is not supported; move those steps to prose or an external checklist",
            )
            as_choice(
                raw_batch.get("execution", "agent"),
                f"{batch_id}.execution",
                {"agent", adapter["name"]},
            )

            batches.append(
                {
                    "id": batch_id,
                    "title": as_string(raw_batch.get("title"), f"{batch_id}.title"),
                    "kind": batch_kind,
                    "execution": "agent",
                    "goal": as_string(raw_batch.get("goal"), f"{batch_id}.goal"),
                    "depends_on": as_string_list(raw_batch.get("depends_on", []), f"{batch_id}.depends_on"),
                    "deliverables": as_string_list(raw_batch.get("deliverables", []), f"{batch_id}.deliverables"),
                    "acceptance": as_string_list(raw_batch.get("acceptance", []), f"{batch_id}.acceptance"),
                    "evidence_to_capture": as_string_list(raw_batch.get("evidence_to_capture", []), f"{batch_id}.evidence_to_capture"),
                    "verify_commands": as_string_list(raw_batch.get("verify_commands", []), f"{batch_id}.verify_commands"),
                    "files_to_touch": as_string_list(raw_batch.get("files_to_touch", []), f"{batch_id}.files_to_touch"),
                    "prompt_context": as_string_list(raw_batch.get("prompt_context", []), f"{batch_id}.prompt_context"),
                }
            )

        normalized.append(
            {
                "id": phase_id,
                "title": as_string(raw_phase.get("title"), f"{phase_id}.title"),
                "goal": as_string(raw_phase.get("goal"), f"{phase_id}.goal"),
                "depends_on": depends_on,
                "summary": as_optional_string(raw_phase.get("summary"), f"{phase_id}.summary"),
                "entry_criteria": as_string_list(raw_phase.get("entry_criteria", []), f"{phase_id}.entry_criteria"),
                "exit_criteria": as_string_list(raw_phase.get("exit_criteria", []), f"{phase_id}.exit_criteria"),
                "risks": as_string_list(raw_phase.get("risks", []), f"{phase_id}.risks"),
                "batches": batches,
            }
        )

    phase_ids = {phase["id"] for phase in normalized}
    for phase in normalized:
        for dependency in phase["depends_on"]:
            require(dependency in phase_ids, f"Unknown dependency `{dependency}` in phase `{phase['id']}`")

    batch_ids = {batch["id"] for phase in normalized for batch in phase["batches"]}
    for phase in normalized:
        for batch in phase["batches"]:
            for dependency in batch["depends_on"]:
                require(dependency in batch_ids, f"Unknown batch dependency `{dependency}` in batch `{batch['id']}`")
                require(dependency != batch["id"], f"Batch `{batch['id']}` cannot depend on itself")

    return normalized


def normalize_plan(data: dict, plan_path: Path, adapter: dict) -> dict:
    require("rollout" in data, "Plan block is missing `rollout`.")
    require("phases" in data, "Plan block is missing `phases`.")
    return {
        "agent": adapter,
        "rollout": validate_rollout(data["rollout"], plan_path, adapter),
        "phases": validate_phases(data["phases"], adapter),
    }


def render_runner(plan: dict) -> str:
    return RUNNER_TEMPLATE.replace(
        "__PLAN_JSON_STRING__",
        json.dumps(json.dumps(plan, ensure_ascii=False)),
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate rollout.py from a Markdown implementation plan.")
    parser.add_argument("--plan", required=True, help="Path to the plan Markdown file")
    parser.add_argument("--output", help="Path to the generated rollout.py")
    parser.add_argument(
        "--agent",
        choices=sorted(AGENT_CONFIG_PATHS),
        help="Agent adapter to embed; defaults to rollout.agent in the plan",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    plan_path = Path(args.plan).resolve()
    output_path = Path(args.output).resolve() if args.output else plan_path.with_name("rollout.py")

    data = load_plan_block(plan_path)
    raw_rollout = data.get("rollout")
    require(isinstance(raw_rollout, dict), "Plan block is missing a rollout dictionary.")
    plan_agent = raw_rollout.get("agent")
    if plan_agent is not None:
        plan_agent = as_choice(plan_agent, "rollout.agent", set(AGENT_CONFIG_PATHS))
    agent_name = args.agent or plan_agent or infer_legacy_agent(data)
    require(agent_name is not None, "Pass --agent claude|codex or set rollout.agent in the plan.")
    adapter = load_agent_adapter(agent_name)
    plan = normalize_plan(data, plan_path, adapter)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(render_runner(plan))
    output_path.chmod(output_path.stat().st_mode | stat.S_IXUSR)

    print(f"[OK] Generated rollout runner: {output_path}")
    print(f"[OK] Agent: {adapter['name']}")
    print(f"[OK] Repo root: {plan['rollout']['repo_root']}")
    print(f"[OK] Phases: {len(plan['phases'])}")
    print(f"[OK] Batches: {sum(len(phase['batches']) for phase in plan['phases'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
