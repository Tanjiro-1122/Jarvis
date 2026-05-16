#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export function validatePrivateOwnerAccessManifest(manifest, options = {}) {
  const blockers = [];
  const proposalId = String(options.proposalId || manifest.proposalId || "");
  const appDir = String(manifest.appDir || "");
  const cwd = options.cwd || process.cwd();

  if (!UUID_RE.test(proposalId)) blockers.push("invalid_proposal_id");
  if (manifest.proposalId !== proposalId) blockers.push("manifest_proposal_id_mismatch");
  if (!isTrue(manifest.ownerOnly)) blockers.push("owner_only_not_true");
  if (manifest.targetAudience !== "javier_only") blockers.push("target_audience_not_javier_only");
  if (manifest.productionClass !== "private_owner_only") blockers.push("production_class_not_private_owner_only");
  if (!isFalse(manifest.publicLaunch)) blockers.push("public_launch_must_be_false");
  if (!isFalse(manifest.customerFacing)) blockers.push("customer_facing_must_be_false");
  if (!isFalse(manifest.paymentsChange)) blockers.push("payments_change_must_be_false");
  if (!isFalse(manifest.schemaMutation)) blockers.push("schema_mutation_must_be_false");
  if (!isTrue(manifest.authRequired)) blockers.push("auth_required_not_true");
  if (manifest.accessPolicy !== "owner_only_authenticated_javier") blockers.push("access_policy_not_owner_only_authenticated_javier");
  if (manifest.executorMode !== "owner_only_executor_v1") blockers.push("executor_mode_not_owner_only_executor_v1");
  if (!isTrue(manifest.artifactOnly)) blockers.push("artifact_only_not_true");
  if (!isFalse(manifest.deployedPublicly)) blockers.push("deployed_publicly_must_be_false");
  if (!isFalse(manifest.vercelProd)) blockers.push("vercel_prod_must_be_false");
  if (!relativePathInside(path.join(cwd, "apps"), appDir.replace(/^apps\//, ""))) blockers.push("app_dir_not_inside_apps");
  if (!existsSync(path.resolve(cwd, appDir))) blockers.push("app_dir_missing");

  return {
    ok: blockers.length === 0,
    blockers,
    proposalId,
    appDir,
    checkedAt: new Date().toISOString(),
    safety: blockers.length === 0
      ? "private_access_verified_owner_only_no_public_launch"
      : "private_access_verification_blocked_no_public_launch",
  };
}

async function main() {
  const proposalId = argValue("proposal-id");
  if (!UUID_RE.test(proposalId)) throw new Error("A valid --proposal-id=<uuid> is required.");

  const manifestPath = path.join(process.cwd(), ".jarvis", "private-deployments", `${proposalId}.json`);
  if (!existsSync(manifestPath)) throw new Error(`Private deployment manifest not found: ${path.relative(process.cwd(), manifestPath)}`);

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const verification = validatePrivateOwnerAccessManifest(manifest, { proposalId, cwd: process.cwd() });
  const outputDir = path.join(process.cwd(), ".jarvis", "private-access-verifications");
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${proposalId}.json`);
  const output = {
    ...verification,
    manifestPath: path.relative(process.cwd(), manifestPath),
    publicLaunch: false,
    customerFacing: false,
    schemaMutation: false,
    paymentsChange: false,
  };
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  if (!verification.ok) {
    throw new Error(`Private access verification blocked: ${verification.blockers.join(", ")}`);
  }

  console.log(`Private access verified owner-only: ${path.relative(process.cwd(), outputPath)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
