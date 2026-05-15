/**
 * Orchestration helpers — intent detection, tool routing, and capability-aware
 * system-prompt formatting.
 *
 * Separating this from the route handler keeps the chat API thin and makes
 * routing logic testable in isolation.
 */

import type { UIMessage } from "ai";
import {
  SUPPORTED_ARTIFACT_MIME_TYPES,
  type ExecutionLimits,
} from "./code-execution";

// ─── Capability descriptor ────────────────────────────────────────────────────

export interface AgentCapabilities {
  codeExecution: { available: boolean; reason?: string | null; limits?: ExecutionLimits };
  webSearch: boolean;
  githubAnalysis: boolean;
}

// ─── Intent detection ─────────────────────────────────────────────────────────

export type DetectedIntent =
  | "self_audit"
  | "capability_truth"
  | "approval_required"
  | "not_connected"
  | "repo_proposal"
  | "code_execution"
  | "web_search"
  | "github_analysis"
  | "datetime"
  | "calculate"
  | "plan"
  | "general";

export type ReasoningRoute =
  | "answer_only"
  | "truth_check"
  | "self_audit"
  | "inspect_first"
  | "plan_first"
  | "proposal_required"
  | "approval_required"
  | "not_connected";

/**
 * Detect the primary tool intent from the latest user message.
 *
 * The ordering of checks below is intentional — more specific patterns are
 * tested first so that a message containing both a code block and a search
 * keyword routes to code execution, not web search.
 */
export function detectToolIntent(
  input: string,
  capabilities: AgentCapabilities
): DetectedIntent {
  if (!input.trim()) return "general";

  const lower = input.toLowerCase();

  // ── Brain/control-plane routing ─────────────────────────────────────────
  if (/(self[- ]?audit|audit yourself|system health|are you ready|check your brain|what should we patch next|brain check|readiness report)/.test(lower)) {
    return "self_audit";
  }

  if (/(what can you actually do|what can you do|what is connected|what's connected|what is missing|what's missing|setup missing|capabilities|capability|how far can we take you|are you fully set up)/.test(lower)) {
    return "capability_truth";
  }

  if (/(send email|email customer|reply to customer|grant free|grant credit|free month|refund|charge|bank transfer|bill payment|move money|delete production|deploy|push to production|open pr|pull request|commit|merge)/.test(lower)) {
    return "approval_required";
  }

  if (/(bank|banking|bank of america|gmail|outlook|customer inbox|revenuecat admin|app store connect|google play console|play console|send customer email)/.test(lower)) {
    return "not_connected";
  }

  if (/(fix|patch|change|modify|update|implement|add|remove|refactor)/.test(lower) && /(repo|repository|code|jarvis|unfiltr|swh|family|app)/.test(lower)) {
    return "repo_proposal";
  }

  // ── Code execution ──────────────────────────────────────────────────────
  if (capabilities.codeExecution.available) {
    const hasCodeBlock = /```[\s\S]*?```/.test(input);
    const executionVerb =
      /\b(run|execute|test|simulate|debug|benchmark|profile|check|evaluate)\b/.test(lower);
    const executionNoun =
      /\b(code|snippet|script|function|algorithm|javascript|typescript|js|ts|loop)\b/.test(lower);
    const artifactIntent =
      /\b(create|generate|produce|build|export)\b/.test(lower) &&
      /\b(artifact|file|download|csv|json|report|output|svg|chart|diagram)\b/.test(lower) &&
      /\b(code|snippet|script|javascript|typescript|js|ts)\b/.test(lower);
    // Purely explanatory requests should not trigger execution
    const explainOnly =
      /\b(explain|review|summarize|understand|what does|why does)\b/.test(lower) &&
      !executionVerb;

    if (
      !explainOnly &&
      (hasCodeBlock || artifactIntent || (executionVerb && executionNoun))
    ) {
      return "code_execution";
    }
  }

  // ── GitHub analysis ─────────────────────────────────────────────────────
  if (capabilities.githubAnalysis) {
    const hasGitHubUrl = /github\.com\/[^\s/]+\/[^\s/]+/.test(input);
    const ownedRepo =
      /\b[a-z0-9_-]{1,39}\/[a-z0-9_.-]{1,100}\b/i.test(input);
    const analyzeVerb =
      /\b(analyze|analyse|look at|check|review|explore|inspect|fetch)\b/.test(lower);
    if (hasGitHubUrl || (ownedRepo && analyzeVerb)) {
      return "github_analysis";
    }
  }

  // ── Web search ──────────────────────────────────────────────────────────
  if (capabilities.webSearch) {
    const timeSignal =
      /\b(latest|recent|current|today|now|news|update|release|this week|this month)\b/.test(lower);
    const queryVerb =
      /\b(search|find|look up|what is|who is|when did|where is|tell me about)\b/.test(lower);
    // Require at least two independent search-like signals to reduce false positives
    if (
      (timeSignal && queryVerb) ||
      (timeSignal &&
        /\b(what|who|when|where|why|how)\b/.test(lower)) ||
      /\b(search the web|search for|google|look up)\b/.test(lower)
    ) {
      return "web_search";
    }
  }

  // ── Datetime ────────────────────────────────────────────────────────────
  if (
    /\b(what time|what date|today|day of week|current time|current date|right now|what day)\b/.test(
      lower
    )
  ) {
    return "datetime";
  }

  // ── Calculate ───────────────────────────────────────────────────────────
  if (
    /\b(calculate|compute|how much|how many|convert|what is)\b/.test(lower) &&
    /[\d+\-*/^%().]/.test(input)
  ) {
    return "calculate";
  }

  // ── Plan ────────────────────────────────────────────────────────────────
  if (
    /\b(plan|steps|roadmap|outline|approach|walk me through|how do i|how to)\b/.test(lower) &&
    input.trim().length > 30
  ) {
    return "plan";
  }

  return "general";
}

export interface PlannerStep {
  key: string;
  label: string;
  detail: string;
}

export interface PlannerOutput {
  intent: DetectedIntent;
  forcedToolName:
    | "execute_code"
    | "calculate"
    | "get_current_datetime"
    | "analyze_github_repo"
    | "get_jarvis_capability_snapshot"
    | "get_jarvis_self_audit_snapshot"
    | null;
  reasoningRoute: ReasoningRoute;
  routingHint: string;
  steps: PlannerStep[];
}

export function buildPlannerOutput(options: {
  input: string;
  capabilities: AgentCapabilities;
}): PlannerOutput {
  const intent = detectToolIntent(options.input, options.capabilities);

  const baseSteps: PlannerStep[] = [
    {
      key: "capture_request",
      label: "Capture request",
      detail: "Normalize user intent and validate task scope/capability fit.",
    },
    {
      key: "retrieve_workspace_context",
      label: "Retrieve workspace context",
      detail: "Load relevant files, artifacts, and chat memory for grounding.",
    },
    {
      key: "execute_plan",
      label: "Execute plan",
      detail: "Run the best matching tools with explicit step discipline.",
    },
    {
      key: "persist_results",
      label: "Persist results",
      detail: "Save exchange/task outcome and refresh workspace state.",
    },
  ];

  if (intent === "self_audit") {
    return {
      intent,
      forcedToolName: "get_jarvis_self_audit_snapshot",
      reasoningRoute: "self_audit",
      routingHint:
        "- Reasoning Router: run Self-Audit Mode before answering. Report verified, partial, missing, not connected, and next patch.",
      steps: baseSteps,
    };
  }
  if (intent === "capability_truth") {
    return {
      intent,
      forcedToolName: "get_jarvis_capability_snapshot",
      reasoningRoute: "truth_check",
      routingHint:
        "- Reasoning Router: use the Capability Truth Layer before answering. Separate verified/configured/partial/missing/not connected/approval-required.",
      steps: baseSteps,
    };
  }
  if (intent === "approval_required") {
    return {
      intent,
      forcedToolName: "get_jarvis_capability_snapshot",
      reasoningRoute: "approval_required",
      routingHint:
        "- Reasoning Router: sensitive action detected. Gather facts only, explain findings/plan, and ask Javier for explicit approval before execution. Do not perform the action yet.",
      steps: baseSteps,
    };
  }
  if (intent === "not_connected") {
    return {
      intent,
      forcedToolName: "get_jarvis_capability_snapshot",
      reasoningRoute: "not_connected",
      routingHint:
        "- Reasoning Router: requested capability may not be connected. Check truth layer, state the limitation plainly, and suggest the safest next setup path.",
      steps: baseSteps,
    };
  }
  if (intent === "repo_proposal") {
    return {
      intent,
      forcedToolName: null,
      reasoningRoute: "proposal_required",
      routingHint:
        "- Reasoning Router: repo/app change requested. Provide Findings → Plan first and route actual changes through Repo Control approval gates before execution.",
      steps: baseSteps,
    };
  }
  if (intent === "code_execution") {
    return {
      intent,
      forcedToolName: "execute_code",
      reasoningRoute: "inspect_first",
      routingHint:
        "- Planner decision: this is execution-heavy; prioritize execute_code with observable outputs.",
      steps: baseSteps,
    };
  }
  if (intent === "calculate") {
    return {
      intent,
      forcedToolName: "calculate",
      reasoningRoute: "answer_only",
      routingHint:
        "- Planner decision: this is numeric; use calculate for deterministic math.",
      steps: baseSteps,
    };
  }
  if (intent === "datetime") {
    return {
      intent,
      forcedToolName: "get_current_datetime",
      reasoningRoute: "answer_only",
      routingHint:
        "- Planner decision: this is time-sensitive; use get_current_datetime.",
      steps: baseSteps,
    };
  }
  if (intent === "github_analysis") {
    return {
      intent,
      forcedToolName: "analyze_github_repo",
      reasoningRoute: "inspect_first",
      routingHint:
        "- Planner decision: this targets a GitHub repo; use analyze_github_repo first.",
      steps: baseSteps,
    };
  }
  if (intent === "web_search") {
    return {
      intent,
      forcedToolName: null,
      reasoningRoute: "inspect_first",
      routingHint:
        "- Planner decision: this likely needs fresh information; prefer web_search early.",
      steps: baseSteps,
    };
  }

  return {
    intent,
    forcedToolName: null,
    reasoningRoute: intent === "plan" ? "plan_first" : "answer_only",
    routingHint:
      "- Planner decision: no hard route override; pick tools opportunistically based on concrete sub-steps.",
    steps: baseSteps,
  };
}

// ─── Message helpers ──────────────────────────────────────────────────────────

/**
 * Extract the plain-text content of the most recent user message.
 * Handles multi-part messages (text + attachments).
 */
export function getLatestUserText(messages: UIMessage[]): string {
  const lastUserMessage = messages.findLast((m) => m.role === "user");
  if (!lastUserMessage) return "";

  return lastUserMessage.parts
    .filter(
      (part): part is Extract<typeof part, { type: "text" }> =>
        part.type === "text"
    )
    .map((part) => part.text)
    .join("\n")
    .trim();
}

// ─── System-prompt formatters ─────────────────────────────────────────────────

/**
 * Format the code-execution capability block for the system prompt.
 */
export function formatCodeExecutionSummary(codeExecution: {
  available: boolean;
  reason?: string | null;
  limits?: ExecutionLimits;
}): string {
  if (!codeExecution.available) {
    const reason = codeExecution.reason ?? "no specific reason was provided";
    return `- Sandboxed code execution is unavailable in this deployment because ${reason}.`;
  }

  const { limits } = codeExecution;
  if (!limits) {
    return "- `execute_code` — sandboxed JavaScript/TypeScript execution is available.";
  }

  return [
    "- `execute_code` — sandboxed JavaScript/TypeScript execution for short self-contained snippets only.",
    `Limits: ${limits.timeoutMs}ms timeout, ${limits.maxSourceLength} characters of source,`,
    `${limits.maxOutputChars} characters of combined logs,`,
    `up to ${limits.maxArtifacts} artifacts of ${limits.maxArtifactBytes} bytes each,`,
    `and an isolated worker memory ceiling of ~${limits.memoryLimitMb}MB.`,
    "No imports, filesystem, process, or network access.",
    `Supported artifact MIME types: ${SUPPORTED_ARTIFACT_MIME_TYPES.join(", ")}.`,
  ].join(" ");
}

/**
 * Return guidance lines for the system prompt based on execution availability.
 */
export function getCodeExecutionGuidance(available: boolean): string {
  if (!available) {
    return (
      "- Do not claim you can run code in this deployment; explain precisely that sandboxed execution is " +
      "disabled here and offer static analysis or code review instead."
    );
  }

  return [
    "- Use `execute_code` for short self-contained JavaScript/TypeScript checks; include an explicit `return` to surface a final value.",
    "- If the user asks to run/evaluate code, call `execute_code` immediately rather than replying with prose alone.",
    "- For downloadable output use `createArtifact(name, content, mimeType?)` inside the snippet.",
    `  Supported MIME types: ${SUPPORTED_ARTIFACT_MIME_TYPES.map((mimeType) => `\`${mimeType}\``).join(", ")}.`,
    "- You can generate SVG charts/diagrams as `image/svg+xml` artifacts for visual outputs.",
    "- For CSV exports: `createArtifact('data.csv', rows.join('\\n'), 'text/csv')`.",
  ].join("\n");
}
