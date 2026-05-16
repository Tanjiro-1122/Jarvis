#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUIRED_APPROVAL = "APPROVE OWNER PREVIEW HOSTING";

function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : "";
}

function isTrue(value) {
  return value === true || value === "true";
}

function isFalse(value) {
  return value === false || value === "false" || value === undefined || value === null;
}

function relativePathInside(baseDir, relativePath) {
  if (!relativePath || path.isAbsolute(relativePath)) return false;
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(baseDir, relativePath);
  return resolvedTarget.startsWith(resolvedBase + path.sep);
}

function validateExecutionGate({ proposalId, approval, gate, cwd }) {
  const blockers = [];
  const appDir = String(gate.appDir || "");

  if (!UUID_RE.test(proposalId)) blockers.push("invalid_proposal_id");
  if (approval !== REQUIRED_APPROVAL) blockers.push("approval_phrase_mismatch");
  if (gate.proposalId !== proposalId) blockers.push("gate_proposal_id_mismatch");
  if (!isTrue(gate.ok)) blockers.push("preview_gate_not_ok");
  if (Array.isArray(gate.blockers) && gate.blockers.length > 0) blockers.push("preview_gate_has_blockers");
  if (gate.safety !== "owner_only_hosted_preview_gate_prepared_no_public_preview") blockers.push("gate_safety_not_owner_only_prepared");
  if (!isTrue(gate.ownerOnly)) blockers.push("owner_only_not_true");
  if (gate.targetAudience !== "javier_only") blockers.push("target_audience_not_javier_only");
  if (gate.productionClass !== "private_owner_only") blockers.push("production_class_not_private_owner_only");
  if (!isTrue(gate.authRequired)) blockers.push("auth_required_not_true");
  if (gate.accessPolicy !== "owner_only_authenticated_javier") blockers.push("access_policy_not_owner_only_authenticated_javier");
  if (!isFalse(gate.publicLaunch)) blockers.push("public_launch_must_be_false");
  if (!isFalse(gate.customerFacing)) blockers.push("customer_facing_must_be_false");
  if (!isFalse(gate.paymentsChange)) blockers.push("payments_change_must_be_false");
  if (!isFalse(gate.schemaMutation)) blockers.push("schema_mutation_must_be_false");
  if (!isFalse(gate.vercelProd)) blockers.push("vercel_prod_must_be_false");
  if (!isFalse(gate.promotionAllowed)) blockers.push("promotion_allowed_must_be_false");
  if (!isFalse(gate.hostedPreviewCreated)) blockers.push("hosted_preview_already_created_or_true");
  if (gate.publicPreviewUrl !== null && gate.publicPreviewUrl !== undefined && gate.publicPreviewUrl !== "") blockers.push("public_preview_url_must_be_empty");
  if (gate.nextRequiredApproval !== REQUIRED_APPROVAL) blockers.push("required_approval_phrase_not_recorded");
  if (!relativePathInside(path.join(cwd, "apps"), appDir.replace(/^apps\//, ""))) blockers.push("app_dir_not_inside_apps");
  if (!existsSync(path.resolve(cwd, appDir))) blockers.push("app_dir_missing");

  return { ok: blockers.length === 0, blockers, appDir };
}

async function main() {
  const proposalId = argValue("proposal-id");
  const approval = argValue("approval");
  if (!UUID_RE.test(proposalId)) throw new Error("A valid --proposal-id=<uuid> is required.");

  const cwd = process.cwd();
  const gatePath = path.join(cwd, ".jarvis", "private-preview-gates", `${proposalId}.json`);
  if (!existsSync(gatePath)) throw new Error(`Owner-only preview gate not found: ${path.relative(cwd, gatePath)}`);

  const gate = JSON.parse(await readFile(gatePath, "utf8"));
  const validation = validateExecutionGate({ proposalId, approval, gate, cwd });

  const outputDir = path.join(cwd, ".jarvis", "private-preview-executions");
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${proposalId}.json`);
  const execution = {
    proposalId,
    appName: gate.appName || gate.slug,
    slug: gate.slug,
    appDir: validation.appDir,
    gatePath: path.relative(cwd, gatePath),
    ownerOnly: true,
    targetAudience: "javier_only",
    productionClass: "private_owner_only",
    authRequired: true,
    accessPolicy: "owner_only_authenticated_javier",
    publicLaunch: false,
    customerFacing: false,
    paymentsChange: false,
    schemaMutation: false,
    envWrites: false,
    mergePerformed: false,
    deployCommandExecuted: false,
    hostedPreviewCreated: false,
    publicPreviewUrl: null,
    protectedPreviewUrl: null,
    vercelProd: false,
    promotionAllowed: false,
    approvalPhrase: REQUIRED_APPROVAL,
    checkedAt: new Date().toISOString(),
    ok: validation.ok,
    blockers: validation.blockers,
    safety: validation.ok
      ? "protected_owner_preview_execution_recorded_no_hosting_no_public_url"
      : "protected_owner_preview_execution_blocked_no_hosting_no_public_url",
    nextRequiredApproval: "APPROVE PROTECTED HOSTING PROVIDER",
  };

  await writeFile(outputPath, `${JSON.stringify(execution, null, 2)}\n`, "utf8");
  if (!validation.ok) {
    throw new Error(`Protected owner preview execution blocked: ${validation.blockers.join(", ")}`);
  }

  console.log(`Protected owner preview execution recorded: ${path.relative(cwd, outputPath)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
