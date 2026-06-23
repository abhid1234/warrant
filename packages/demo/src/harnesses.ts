// Cross-harness adapters (v2). Different agent harnesses emit different native
// run shapes; each adapter normalizes one into an OpenTrajectory 0.1 body — the
// warrant body. Because the warrant format is harness-agnostic, the SAME agent
// identity earns ONE portable reputation regardless of which harness it ran in.
//
// These are minimal illustrative shapes (a Claude-Code-style step log and a
// LangGraph-style node trace). The shipped OpenTrajectory `capture` package has
// the real from-claude-code / from-codex adapters; this mirrors that pattern.

type OTBody = Record<string, unknown>;

// ---- harness A: Claude-Code-style transcript -------------------------------
export interface ClaudeCodeRun {
  trajectory_id: string;
  task: string;
  events: Array<{ kind: "user" | "assistant" | "tool"; text?: string; tool?: string; args?: unknown; result?: string; ok?: boolean }>;
}

export function fromClaudeCode(run: ClaudeCodeRun): OTBody {
  const steps = run.events.map((e, index) => {
    if (e.kind === "tool") {
      return { index, role: "assistant", tool_call: { name: e.tool ?? "tool", args: e.args ?? {}, result: e.result ?? "", success: e.ok !== false } };
    }
    return { index, role: e.kind, message: { text: e.text ?? "" } };
  });
  return {
    ot_version: "0.1",
    trajectory_id: run.trajectory_id,
    harness: { name: "claude-code", version: "2.x" },
    task: { description: run.task },
    steps,
    outcome: { status: "success", resolved: true },
  };
}

// ---- harness B: LangGraph-style node trace ---------------------------------
export interface LangGraphRun {
  thread_id: string;
  goal: string;
  nodes: Array<{ node: string; output?: string; tool_calls?: Array<{ name: string; input?: unknown; output?: string; error?: string }> }>;
}

export function fromLangGraph(run: LangGraphRun): OTBody {
  const steps: Array<Record<string, unknown>> = [];
  let index = 0;
  for (const n of run.nodes) {
    for (const tc of n.tool_calls ?? []) {
      steps.push({
        index: index++,
        role: "assistant",
        tool_call: { name: tc.name, args: tc.input ?? {}, result: tc.output ?? tc.error ?? "", success: tc.error === undefined },
      });
    }
    if (n.output) steps.push({ index: index++, role: "assistant", message: { text: n.output } });
  }
  return {
    ot_version: "0.1",
    thread_id: run.thread_id,
    trajectory_id: run.thread_id,
    harness: { name: "langgraph", version: "0.x" },
    task: { description: run.goal },
    steps,
    outcome: { status: "success", resolved: true },
  };
}
