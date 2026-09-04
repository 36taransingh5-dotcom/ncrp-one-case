import { createClient, type User } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const citizenEmail = process.env.NCRP_DEMO_CITIZEN_EMAIL;
const citizenPassword = process.env.NCRP_DEMO_CITIZEN_PASSWORD;
const operatorEmail = process.env.NCRP_DEMO_OPERATOR_EMAIL;
const operatorPassword = process.env.NCRP_DEMO_OPERATOR_PASSWORD;
if (
  !url ||
  !secret ||
  !citizenEmail ||
  !citizenPassword ||
  !operatorEmail ||
  !operatorPassword
)
  throw new Error(
    "Supabase URL/secret and all four NCRP_DEMO_* identity variables are required.",
  );

const admin = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const existing: User[] = [];
for (let page = 1; ; page += 1) {
  const { data, error: listError } = await admin.auth.admin.listUsers({
    page,
    perPage: 1000,
  });
  if (listError) throw listError;
  existing.push(...data.users);
  if (data.users.length < 1000) break;
}

async function ensureUser(
  email: string,
  password: string,
  displayName: string,
): Promise<User> {
  const found = existing.find(
    (user) => user.email?.toLowerCase() === email.toLowerCase(),
  );
  if (found) return found;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName, synthetic: true },
  });
  if (error || !data.user)
    throw error || new Error(`Could not create ${email}.`);
  return data.user;
}

const citizen = await ensureUser(
  citizenEmail,
  citizenPassword,
  "Asha Mehta (synthetic)",
);
const operator = await ensureUser(
  operatorEmail,
  operatorPassword,
  "Priya Nair (synthetic operator)",
);
const { error: profileError } = await admin.from("profiles").upsert([
  {
    id: citizen.id,
    display_name: "Asha Mehta (synthetic)",
    role: "citizen",
  },
  {
    id: operator.id,
    display_name: "Priya Nair (synthetic operator)",
    role: "operator",
  },
]);
if (profileError) throw profileError;
const { error: citizenError } = await admin
  .from("citizens")
  .upsert(
    { user_id: citizen.id, full_name: "Asha Mehta (synthetic)" },
    { onConflict: "user_id" },
  );
if (citizenError) throw citizenError;
const { error: citizenRoleError } = await admin
  .from("profiles")
  .update({ role: "citizen" })
  .eq("id", citizen.id);
if (citizenRoleError) throw citizenRoleError;
const { error: operatorRoleError } = await admin
  .from("profiles")
  .update({ role: "operator" })
  .eq("id", operator.id);
if (operatorRoleError) throw operatorRoleError;
const { error: institutionError } = await admin.from("institutions").upsert([
  {
    id: "10000000-0000-0000-0000-000000000001",
    name: "State Bank of India (simulated)",
    institution_type: "bank",
    short_code: "SBI",
    simulated: true,
  },
  {
    id: "10000000-0000-0000-0000-000000000002",
    name: "HDFC Bank (simulated)",
    institution_type: "bank",
    short_code: "HDFC",
    simulated: true,
  },
  {
    id: "10000000-0000-0000-0000-000000000003",
    name: "ICICI Bank (simulated)",
    institution_type: "bank",
    short_code: "ICICI",
    simulated: true,
  },
  {
    id: "10000000-0000-0000-0000-000000000004",
    name: "Bengaluru Cyber Crime Unit (simulated)",
    institution_type: "cyber_cell",
    short_code: "BLR-CCU",
    city: "Bengaluru",
    state: "Karnataka",
    simulated: true,
  },
  {
    id: "10000000-0000-0000-0000-000000000005",
    name: "Bengaluru Cyber Crime Police Station (simulated)",
    institution_type: "police",
    short_code: "BLR-CCPS",
    city: "Bengaluru",
    state: "Karnataka",
    simulated: true,
  },
]);
if (institutionError) throw institutionError;
const { data: caseId, error: seedError } = await admin.rpc("seed_round2_demo", {
  p_citizen_user_id: citizen.id,
  p_operator_user_id: operator.id,
});
if (seedError) throw seedError;
console.info(
  `Seeded ${caseId} with synthetic citizen ${citizenEmail} and operator ${operatorEmail}.`,
);
