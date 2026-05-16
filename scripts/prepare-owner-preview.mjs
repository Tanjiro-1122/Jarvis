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

function validatePreviewGateInputs({ proposalId, manifest, verification, cwd }) {
  const blockers = [];
  const appDir = String(manifest.appDir || verification.appDir || "");

  if (!UUID_RE.test(proposalId)) blockers.push("invalid_proposal_id");
  if (manifest.proposalId !== proposalId) blockers.push("manifest_proposal_id_mismatch");
  if (verification.proposalId !== proposalId) blockers.push("verification_proposal_id_mismatch");
  if (!isTrue(verification.ok)) blockers.push("private_access_verification_not_ok");
  if (Array.isArray(verification.blockers) && verification.blockers.length > 0) blockers.push("private_access_verification_has_blockers");
  if (verification.safety !== "private_access_verified_owner_only_no_public_launch") blockers.push("verification_safety_not_private_owner_only");
  if (!isTrue(manifest.ownerOnly)) blockers.push("owner_only_not_true");
  if (manifest.targetAudience !== "javier_only") blockers.push("target_audience_not_javier_only");
  if (manifest.productionClass !== "private_owner_only") blockers.push("production_class_not_private_owner_only");
  if (!isTrue(manifest.authRequired)) blockers.push("auth_required_not_true");
  if (manifest.accessPolicy !== "owner_only_authenticated_javier") blockers.push("access_policy_not_owner_only_authenticated_javier");
  if (!isFalse(manifest.publicLaunch)) blockers.push("public_launch_must_be_false");
  if (!isFalse(manifest.customerFacing)) blockers.push("customer_facing_must_be_false");
  if (!isFalse(manifest.paymentsChange)) blockers.push("payments_change_must_be_false");
  if (!isFalse(manifest.schemaMutation)) blockers.push("schema_mutation_must_be_false");
  if (!isTrue(manifest.artifactOnly)) blockers.push("artifact_only_not_true");
  if (!isFalse(manifest.deployedPublicly)) blockers.push("deployed_publicly_must_be_false");
  if (!isFalse(manifest.vercelProd)) blockers.push("vercel_prod_must_be_false");
  if (!relativePathInside(path.join(cwd, "apps"), appDir.replace(/^apps\//, ""))) blockers.push("app_dir_not_inside_apps");
  if (!existsSync(path.resolve(cwd, appDir))) blockers.push("app_dir_missing");

  return { ok: blockers.length === 0, blockers, appDir };
}

async function main() {
  const proposalId = argValue("proposal-id");
  if (!UUID_RE.test(proposalId)) throw new Error("A valid --proposal-id=<uuid> is required.");

  const cwd = process.cwd();
  const manifestPath = path.join(cwd, ".jarvis", "private-deployments", `${proposalId}.json`);
  const verificationPath = path.join(cwd, ".jarvis", "private-access-verifications", `${proposalId}.json`);
  if (!existsSync(manifestPath)) throw new Error(`Private deployment manifest not found: ${path.relative(cwd, manifestPath)}`);
  if (!existsSync(verificationPath)) throw new Error(`Private access verification not found: ${path.relative(cwd, verificationPath)}`);

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const verification = JSON.parse(await readFile(verificationPath, "utf8"));
  const validation = validatePreviewGateInputs({ proposalId, manifest, verification, cwd });

  const outputDir = path.join(cwd, ".jarvis", "private-preview-gates");
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${proposalId}.json`);
  const gate = {
    proposalId,
    appName: manifest.appName || manifest.slug,
    slug: manifest.slug,
    appDir: validation.appDir,
    manifestPath: path.relative(cwd, manifestPath),
    verificationPath: path.relative(cwd, verificationPath),
    ownerOnly: true,
    targetAudience: "javier_only",
    productionClass: "private_owner_only",
    authRequired: true,
    accessPolicy: "owner_only_authenticated_javier",
    publicLaunch: false,
    customerFacing: false,
    paymentsChange: false,
    schemaMutation: false,
    deployCommandPrepared: false,
    hostedPreviewCreated: false,
    publicPreviewUrl: null,
    vercelProd: false,
    promotionAllowed: false,
    checkedAt: new Date().toISOString(),
    ok: validation.ok,
    blockers: validation.blockers,
    safety: validation.ok
      ? "owner_only_hosted_preview_gate_prepared_no_public_preview"
      : "owner_only_hosted_preview_gate_blocked_no_public_preview",
    nextRequiredApproval: "APPROVE OWNER PREVIEW HOSTING",
  };

  await writeFile(outputPath, `${JSON.stringify(gate, null, 2)}\n`, "utf8");
  if (!validation.ok) {
    throw new Error(`Owner-only hosted preview gate blocked: ${validation.blockers.join(", ")}`);
  }

  console.log(`Owner-only hosted preview gate prepared: ${path.relative(cwd, outputPath)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
