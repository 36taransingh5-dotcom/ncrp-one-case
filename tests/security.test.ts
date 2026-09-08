import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { jobsForCaseEvent } from "../lib/jobs/event-jobs";

const rls = fs.readFileSync("supabase/migrations/002_rls.sql", "utf8");
const evidence = fs.readFileSync(
  "supabase/migrations/006_evidence_function.sql",
  "utf8",
);
const commands = fs.readFileSync(
  "supabase/migrations/005_domain_functions.sql",
  "utf8",
);
const httpIntegrations = fs.readFileSync(
  "supabase/migrations/012_http_integrations.sql",
  "utf8",
);

test("RLS scopes citizen case, evidence, event, and notification reads", () => {
  assert.match(rls, /cases_select[\s\S]*owns_case\(id\)/);
  assert.match(rls, /evidence_select[\s\S]*owns_case\(case_id\)/);
  assert.match(rls, /events_select[\s\S]*citizen_visible/);
  assert.match(rls, /notifications_select[\s\S]*user_id = auth\.uid\(\)/);
});

test("a citizen cannot self-assign the operator role", () => {
  assert.match(rls, /grant update\(display_name\) on public\.profiles/);
  assert.doesNotMatch(rls, /grant update\(role\)/);
  assert.match(
    commands,
    /if not public\.is_operator\(\) then raise exception 'OPERATOR_REQUIRED'/,
  );
});

test("private evidence requires ownership, safe keys and content metadata", () => {
  assert.match(rls, /values \('case-evidence', 'case-evidence', false/);
  assert.match(rls, /storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/);
  assert.match(evidence, /p_storage_key not like auth\.uid\(\)::text/);
  assert.match(evidence, /p_file_size <= 0 or p_file_size > 8388608/);
  assert.match(evidence, /p_sha256 !~ '\^\[a-f0-9\]\{64\}\$'/);
});

test("operator commands are idempotent and concurrency guarded", () => {
  assert.match(
    commands,
    /domain_command_receipts where idempotency_key = p_idempotency_key/,
  );
  assert.match(commands, /for update/);
  assert.match(
    commands,
    /if v_case\.version <> p_expected_version then raise exception 'CASE_CHANGED'/,
  );
});

test("inbound webhooks are operator-readable and jobs enqueue from case events", () => {
  assert.match(
    httpIntegrations,
    /create policy webhook_receipts_operator_select/,
  );
  assert.match(httpIntegrations, /using \(public\.is_operator\(\)\)/);
  assert.doesNotMatch(
    httpIntegrations,
    /grant insert on public\.integration_webhook_receipts/,
  );
  assert.match(httpIntegrations, /create_external_complaint/);
  assert.match(httpIntegrations, /identify_beneficiary/);
});

test("application job specs use the same idempotency keys as the SQL trigger", () => {
  const created = jobsForCaseEvent("CASE_CREATED");
  const identified = jobsForCaseEvent("BENEFICIARY_BANK_IDENTIFIED");
  assert.equal(
    created[0]?.idempotencyKey("case-1"),
    "reporting:complaint:case-1",
  );
  assert.equal(identified[0]?.idempotencyKey("case-1"), "bank:identify:case-1");
  assert.equal(identified[1]?.idempotencyKey("case-1"), "bank:notify:case-1");
  assert.match(
    httpIntegrations,
    /'reporting:complaint:' \|\| new\.case_id::text/,
  );
  assert.match(httpIntegrations, /'bank:identify:' \|\| new\.case_id::text/);
  assert.match(httpIntegrations, /'bank:notify:' \|\| new\.case_id::text/);
});
