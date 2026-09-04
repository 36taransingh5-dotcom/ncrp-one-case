import crypto from "node:crypto";
import { createClient, type User } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const citizenEmail = process.env.NCRP_SHOWCASE_CITIZEN_EMAIL;
const citizenPassword = process.env.NCRP_SHOWCASE_CITIZEN_PASSWORD;

if (!url || !secret || !citizenEmail || !citizenPassword)
  throw new Error(
    "Supabase URL/secret and showcase citizen credentials are required.",
  );

const showcaseIdentity = {
  citizenEmail,
  citizenPassword,
};

const admin = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const caseId = "21000000-0000-0000-0000-000000000001";
const publicCaseId = "NCRP-26-926184";

async function listUsers() {
  const users: User[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

async function main() {
  const users = await listUsers();
  const existingCitizen = users.find(
    (user) =>
      user.email?.toLowerCase() === showcaseIdentity.citizenEmail.toLowerCase(),
  );
  const { data: operator, error: operatorError } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "operator")
    .order("created_at")
    .limit(1)
    .single();
  if (operatorError || !operator)
    throw (
      operatorError || new Error("The seeded synthetic operator was not found.")
    );

  const citizenResult = existingCitizen
    ? await admin.auth.admin.updateUserById(existingCitizen.id, {
        password: showcaseIdentity.citizenPassword,
        email_confirm: true,
        user_metadata: {
          display_name: "Riya Sharma (synthetic showcase)",
          synthetic: true,
          showcase: true,
        },
      })
    : await admin.auth.admin.createUser({
        email: showcaseIdentity.citizenEmail,
        password: showcaseIdentity.citizenPassword,
        email_confirm: true,
        user_metadata: {
          display_name: "Riya Sharma (synthetic showcase)",
          synthetic: true,
          showcase: true,
        },
      });
  if (citizenResult.error || !citizenResult.data.user)
    throw citizenResult.error || new Error("Showcase citizen creation failed.");
  const citizen = citizenResult.data.user;

  const { error: profileError } = await admin.from("profiles").upsert({
    id: citizen.id,
    display_name: "Riya Sharma (synthetic showcase)",
    role: "citizen",
  });
  if (profileError) throw profileError;
  const { error: citizenError } = await admin.from("citizens").upsert(
    {
      user_id: citizen.id,
      full_name: "Riya Sharma (synthetic showcase)",
      phone_masked: "+91 ••••• 20481",
      city: "Bengaluru",
      state: "Karnataka",
      preferred_language: "en",
    },
    { onConflict: "user_id" },
  );
  if (citizenError) throw citizenError;

  const evidenceText = [
    "NCRP ONE CASE — SYNTHETIC BANK STATEMENT EXTRACT",
    "This file contains no real citizen or financial information.",
    "Account: SBI ••2048 (simulated)",
    "Transaction: SIM-UPI-86750",
    "Amount: INR 86,750",
    "Beneficiary: simulated@upi",
  ].join("\n");
  const evidenceBytes = new TextEncoder().encode(evidenceText);
  const evidenceHash = crypto
    .createHash("sha256")
    .update(evidenceBytes)
    .digest("hex");
  const evidenceKey = `${citizen.id}/${caseId}/synthetic-bank-statement.txt`;
  const { error: uploadError } = await admin.storage
    .from("case-evidence")
    .upload(evidenceKey, evidenceBytes, {
      contentType: "text/plain",
      upsert: true,
    });
  if (uploadError) throw uploadError;

  const { data, error: seedError } = await admin.rpc("seed_showcase_demo", {
    p_citizen_user_id: citizen.id,
    p_operator_user_id: operator.id,
    p_evidence_key: evidenceKey,
    p_evidence_sha256: evidenceHash,
    p_evidence_size: evidenceBytes.byteLength,
  });
  if (seedError) throw seedError;
  if (data !== publicCaseId)
    throw new Error("The showcase seed returned an unexpected case id.");
  console.info(
    `Seeded ${publicCaseId} for Riya Sharma (synthetic showcase) with private SHA-256 evidence.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
