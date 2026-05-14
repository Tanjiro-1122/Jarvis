import { getSupabaseClient } from "@/lib/supabase";
import { logError } from "@/lib/errors";
import { logActionEvent } from "@/lib/action-events";

export type RepoActionRisk = "low" | "medium" | "high";
export type RepoActionStatus = "draft" | "proposed" | "approved" | "rejected" | "blocked" | "executed" | "cancelled";

export interface RepoActionFileTarget {
  path: string;
  operation?: "create" | "update" | "delete" | "inspect";
  note?: string;
}

export interface RepoActionProposalInput {
  title: string;
  summary: string;
  findings?: string;
  plan?: string;
  repo?: string | null;
  projectKey?: string | null;
  riskLevel?: RepoActionRisk;
  files?: RepoActionFileTarget[];
  diffPreview?: string;
  sessionId?: string | null;
  workspaceId?: string | null;
  conversationId?: string | null;
}

export interface RepoActionProposalRow {
  id: string;
  title: string;
  summary: string;
  findings: string;
  plan: string;
  repo: string;
  project_key: string;
  risk_level: RepoActionRisk;
  status: RepoActionStatus;
  files: RepoActionFileTarget[];
  diff_preview: string;
  approval_note: string | null;
  session_id: string | null;
  workspace_id: string | null;
  conversation_id: string | null;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  executed_at: string | null;
}

const VALID_RISKS: RepoActionRisk[] = ["low", "medium", "high"];
const VALID_STATUSES: RepoActionStatus[] = ["draft", "proposed", "approved", "rejected", "blocked", "executed", "cancelled"];
const DEFAULT_REPO = "Tanjiro-1122/Jarvis";

function cleanText(value: unknown, maxChars = 4000) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

function cleanMultiline(value: unknown, maxChars = 8000) {
  const text = String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, "").trim();
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n…` : text;
}

function normalizeProjectKey(value: unknown) {
  const cleaned = cleanText(value, 80).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "jarvis";
}

function normalizeRisk(value: unknown): RepoActionRisk {
  return VALID_RISKS.includes(value as RepoActionRisk) ? (value as RepoActionRisk) : "medium";
}

function normalizeStatus(value: unknown): RepoActionStatus {
  return VALID_STATUSES.includes(value as RepoActionStatus) ? (value as RepoActionStatus) : "proposed";
}

function cleanFiles(files: unknown): RepoActionFileTarget[] {
  if (!Array.isArray(files)) return [];
  return files.slice(0, 20).map((file) => {
    const item = file && typeof file === "object" ? file as Record<string, unknown> : {};
    const operation = ["create", "update", "delete", "inspect"].includes(String(item.operation))
      ? item.operation as RepoActionFileTarget["operation"]
      : "inspect";
    return {
      path: cleanText(item.path, 240),
      operation,
      note: item.note ? cleanText(item.note, 500) : undefined,
    };
  }).filter((file) => file.path);
}

function approvalStageFor(status: RepoActionStatus) {
  if (status === "proposed" || status === "draft") return "plan";
  if (status === "approved") return "approval";
  if (status === "executed") return "complete";
  if (status === "blocked" || status === "rejected" || status === "cancelled") return "approval";
  return "none";
}

export async function createRepoActionProposal(input: RepoActionProposalInput) {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  const title = cleanText(input.title, 180);
  const summary = cleanText(input.summary, 900);
  if (!title || !summary) return { ok: false, error: "Proposal title and summary are required." };

  const payload = {
    title,
    summary,
    findings: cleanMultiline(input.findings, 6000),
    plan: cleanMultiline(input.plan, 6000),
    repo: cleanText(input.repo || process.env.JARVIS_GITHUB_REPO || DEFAULT_REPO, 160),
    project_key: normalizeProjectKey(input.projectKey),
    risk_level: normalizeRisk(input.riskLevel),
    status: "proposed" as RepoActionStatus,
    files: cleanFiles(input.files),
    diff_preview: cleanMultiline(input.diffPreview, 10000),
    session_id: input.sessionId ? cleanText(input.sessionId, 120) : null,
    workspace_id: input.workspaceId || null,
    conversation_id: input.conversationId || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("jarvis_repo_action_proposals")
    .insert(payload)
    .select("id, title, summary, findings, plan, repo, project_key, risk_level, status, files, diff_preview, approval_note, session_id, workspace_id, conversation_id, created_at, updated_at, approved_at, executed_at")
    .single();

  if (error) {
    logError("repoActions.createRepoActionProposal", error);
    return { ok: false, error: error.message };
  }

  await logActionEvent({
    eventType: "repo_action.proposed",
    summary: `Repo action proposed: ${title}`,
    status: "proposed",
    approvalStage: "plan",
    riskLevel: payload.risk_level,
    projectKey: payload.project_key,
    sessionId: payload.session_id,
    workspaceId: payload.workspace_id,
    conversationId: payload.conversation_id,
    metadata: { proposalId: data.id, repo: payload.repo, files: payload.files },
  });

  return { ok: true, proposal: data as RepoActionProposalRow };
}

export async function listRepoActionProposals(options: { projectKey?: string | null; limit?: number } = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) return [] as RepoActionProposalRow[];

  const limit = Math.min(Math.max(options.limit ?? 20, 1), 80);
  let request = supabase
    .from("jarvis_repo_action_proposals")
    .select("id, title, summary, findings, plan, repo, project_key, risk_level, status, files, diff_preview, approval_note, session_id, workspace_id, conversation_id, created_at, updated_at, approved_at, executed_at")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (options.projectKey) {
    request = request.in("project_key", ["global", normalizeProjectKey(options.projectKey)]);
  }

  const { data, error } = await request;
  if (error) {
    logError("repoActions.listRepoActionProposals", error);
    return [] as RepoActionProposalRow[];
  }

  return (data ?? []) as RepoActionProposalRow[];
}

export async function updateRepoActionStatus(options: {
  id: string;
  status: RepoActionStatus;
  approvalNote?: string | null;
}) {
  const supabase = getSupabaseClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  const id = cleanText(options.id, 120);
  const status = normalizeStatus(options.status);
  if (!id) return { ok: false, error: "Proposal id is required." };

  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    status,
    approval_note: options.approvalNote ? cleanText(options.approvalNote, 700) : null,
    updated_at: now,
  };
  if (status === "approved") payload.approved_at = now;
  if (status === "executed") payload.executed_at = now;

  const { data, error } = await supabase
    .from("jarvis_repo_action_proposals")
    .update(payload)
    .eq("id", id)
    .select("id, title, summary, findings, plan, repo, project_key, risk_level, status, files, diff_preview, approval_note, session_id, workspace_id, conversation_id, created_at, updated_at, approved_at, executed_at")
    .single();

  if (error) {
    logError("repoActions.updateRepoActionStatus", error);
    return { ok: false, error: error.message };
  }

  const proposal = data as RepoActionProposalRow;
  await logActionEvent({
    eventType: `repo_action.${status}`,
    summary: `Repo action ${status}: ${proposal.title}`,
    status: status === "approved" ? "approved" : status === "rejected" || status === "blocked" || status === "cancelled" ? "blocked" : status === "executed" ? "executed" : "info",
    approvalStage: approvalStageFor(status),
    riskLevel: proposal.risk_level,
    projectKey: proposal.project_key,
    sessionId: proposal.session_id,
    workspaceId: proposal.workspace_id,
    conversationId: proposal.conversation_id,
    metadata: { proposalId: proposal.id, repo: proposal.repo, approvalNote: payload.approval_note },
  });

  return { ok: true, proposal };
}
