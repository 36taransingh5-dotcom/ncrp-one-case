import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const rls = fs.readFileSync("supabase/migrations/002_rls.sql", "utf8");
const evidence = fs.readFileSync(
  "supabase/migrations/006_evidence_function.sql",
  "utf8",
);
const commands = fs.readFileSync(
  "supabase/migrations/005_domain_functions.sql",
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
