#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXPECTED_PREVIOUS_APPROVAL = "APPROVE OWNER PREVIEW TOKEN ROUTE";
const NEXT_REQUIRED_APPROVAL = "APPROVE OWNER PREVIEW TOKEN ROUTE IMPLEMENTATION";

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

function validateTokenRouteContractInput({ proposalId, contract, cwd }) {
  const blockers = [];
  const appDir = String(contract.appDir || "");
  const requiredClaims = Array.isArray(contract.requiredClaims) ? contract.requiredClaims : [];

  if (!UUID_RE.test(proposalId)) blockers.push("invalid_proposal_id");
  if (contract.proposalId !== proposalId) blockers.push("contract_proposal_id_mismatch");
  if (!isTrue(contract.ok)) blockers.push("token_contract_not_ok");
  if (Array.isArray(contract.blockers) && contract.blockers.length > 0) blockers.push("token_contract_has_blockers");
  if (contract.safety !== "owner_preview_token_contract_prepared_no_token_no_route_no_url") blockers.push("contract_safety_not_token_contract_prepared");
  if (contract.nextRequiredApproval !== EXPECTED_PREVIOUS_APPROVAL) blockers.push("previous_approval_phrase_not_recorded");
  if (contract.tokenType !== "owner_preview_access") blockers.push("token_type_not_owner_preview_access");
  if (contract.issuer !== "jarvis") blockers.push("issuer_not_jarvis");
  if (contract.audience !== "javier_only") blockers.push("audience_not_javier_only");
  if (contract.provider !== "jarvis_proxy") blockers.push("provider_not_jarvis_proxy");
  if (contract.strategy !== "jarvis_signed_owner_proxy") blockers.push("strategy_not_jarvis_signed_owner_proxy");
  if (contract.ttlSeconds !== 900) blockers.push("ttl_seconds_not_900");
  if (!isTrue(contract.singleUseRecommended)) blockers.push("single_use_recommended_not_true");
  if (!isTrue(contract.ownerSessionRequired)) blockers.push("owner_session_required_not_true");
  if (!isTrue(contract.revocationSupported)) blockers.push("revocation_supported_not_true");
  if (!isTrue(contract.accessAuditRequired)) blockers.push("access_audit_required_not_true");
  if (!isTrue(contract.rawProviderUrlHidden)) blockers.push("raw_provider_url_hidden_not_true");
  if (!isFalse(contract.rawProviderUrlExposed)) blockers.push("raw_provider_url_exposed_must_be_false");
  if (!isFalse(contract.tokenSigningPrepared)) blockers.push("token_signing_prepared_must_be_false");
  if (!isFalse(contract.tokenGenerated)) blockers.push("token_generated_must_be_false");
  if (!isFalse(contract.tokenRouteCreated)) blockers.push("token_route_created_must_be_false");
  if (!isFalse(contract.livePreviewRouteCreated)) blockers.push("live_preview_route_created_must_be_false");
  if (!isFalse(contract.publicLaunch)) blockers.push("public_launch_must_be_false");
  if (!isFalse(contract.customerFacing)) blockers.push("customer_facing_must_be_false");
  if (!isFalse(contract.paymentsChange)) blockers.push("payments_change_must_be_false");
  if (!isFalse(contract.schemaMutation)) blockers.push("schema_mutation_must_be_false");
  if (!isFalse(contract.envWrites)) blockers.push("env_writes_must_be_false");
  if (!isFalse(contract.mergePerformed)) blockers.push("merge_performed_must_be_false");
  if (!isFalse(contract.deployCommandPrepared)) blockers.push("deploy_command_prepared_must_be_false");
  if (!isFalse(contract.deployCommandExecuted)) blockers.push("deploy_command_executed_must_be_false");
  if (!isFalse(contract.hostedPreviewCreated)) blockers.push("hosted_preview_created_must_be_false");
  if (!isFalse(contract.vercelProd)) blockers.push("vercel_prod_must_be_false");
  if (!isFalse(contract.promotionAllowed)) blockers.push("promotion_allowed_must_be_false");
  if (contract.publicPreviewUrl !== null && contract.publicPreviewUrl !== undefined && contract.publicPreviewUrl !== "") blockers.push("public_preview_url_must_be_empty");
  if (contract.protectedPreviewUrl !== null && contract.protectedPreviewUrl !== undefined && contract.protectedPreviewUrl !== "") blockers.push("protected_preview_url_must_be_empty");
  if (contract.rawProviderPreviewUrl !== null && contract.rawProviderPreviewUrl !== undefined && contract.rawProviderPreviewUrl !== "") blockers.push("raw_provider_preview_url_must_be_empty");
  for (const claim of ["sub", "aud", "iss", "iat", "exp", "jti", "proposalId", "ownerOnly"]) {
    if (!requiredClaims.includes(claim)) blockers.push(`required_claim_missing_${claim}`);
  }
  if (!relativePathInside(path.join(cwd, "apps"), appDir.replace(/^apps\//, ""))) blockers.push("app_dir_not_inside_apps");
  if (!existsSync(path.resolve(cwd, appDir))) blockers.push("app_dir_missing");

  return { ok: blockers.length === 0, blockers, appDir };
}

async function main() {
  const proposalId = argValue("proposal-id");
  if (!UUID_RE.test(proposalId)) throw new Error("A valid --proposal-id=<uuid> is required.");

  const cwd = process.cwd();
  const contractPath = path.join(cwd, ".jarvis", "owner-preview-token-contracts", `${proposalId}.json`);
  if (!existsSync(contractPath)) throw new Error(`Owner preview token contract not found: ${path.relative(cwd, contractPath)}`);

  const contract = JSON.parse(await readFile(contractPath, "utf8"));
  const validation = validateTokenRouteContractInput({ proposalId, contract, cwd });

  const outputDir = path.join(cwd, ".jarvis", "owner-preview-token-routes");
  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${proposalId}.json`);
  const routeContract = {
    proposalId,
    appName: contract.appName || contract.slug,
    slug: contract.slug,
    appDir: validation.appDir,
    contractPath: path.relative(cwd, contractPath),
    routePath: "/api/owner-preview/token",
    method: "POST",
    routeContractOnly: true,
    apiRouteFileCreated: false,
    tokenType: "owner_preview_access",
    issuer: "jarvis",
    audience: "javier_only",
    provider: "jarvis_proxy",
    strategy: "jarvis_signed_owner_proxy",
    ttlSeconds: 900,
    singleUseRecommended: true,
    ownerSessionRequired: true,
    ownerAuthRequired: true,
    ownerOnly: true,
    accessPolicy: "owner_only_authenticated_javier",
    revocationRequired: true,
    revocationSupported: true,
    auditRequired: true,
    accessAuditRequired: true,
    rawProviderUrlHidden: true,
    rawProviderUrlExposed: false,
    tokenSigningPrepared: false,
    tokenGenerated: false,
    tokenRouteCreated: false,
    livePreviewRouteCreated: false,
    publicLaunch: false,
    customerFacing: false,
    paymentsChange: false,
    schemaMutation: false,
    envWrites: false,
    mergePerformed: false,
    deployCommandPrepared: false,
    deployCommandExecuted: false,
    hostedPreviewCreated: false,
    publicPreviewUrl: null,
    protectedPreviewUrl: null,
    rawProviderPreviewUrl: null,
    vercelProd: false,
    promotionAllowed: false,
    requiredClaims: ["sub", "aud", "iss", "iat", "exp", "jti", "proposalId", "ownerOnly"],
    requiredRequestBody: ["proposalId"],
    requiredResponses: ["ok", "error", "expiresAt", "auditId"],
    checkedAt: new Date().toISOString(),
    ok: validation.ok,
    blockers: validation.blockers,
    safety: validation.ok
      ? "owner_preview_token_route_contract_prepared_no_route_no_token_no_url"
      : "owner_preview_token_route_contract_blocked_no_route_no_token_no_url",
    nextRequiredApproval: NEXT_REQUIRED_APPROVAL,
  };

  await writeFile(outputPath, `${JSON.stringify(routeContract, null, 2)}\n`, "utf8");
  if (!validation.ok) {
    throw new Error(`Owner preview token route contract blocked: ${validation.blockers.join(", ")}`);
  }

  console.log(`Owner preview token route contract prepared: ${path.relative(cwd, outputPath)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
