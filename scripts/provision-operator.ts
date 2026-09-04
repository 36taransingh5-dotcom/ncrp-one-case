import { createClient } from "@supabase/supabase-js";

const [email] = process.argv.slice(2);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!email || !url || !secret) {
  throw new Error(
    "Usage: npm run provision-operator -- operator@example.org (with Supabase environment variables set)",
  );
}
const admin = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  let user;
  for (let page = 1; !user; page += 1) {
    const { data, error: listError } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (listError) throw listError;
    user = data.users.find(
      (candidate) => candidate.email?.toLowerCase() === email.toLowerCase(),
    );
    if (data.users.length < 1000) break;
  }
  if (!user) throw new Error(`No Supabase Auth user exists for ${email}.`);
  const { data: profile, error } = await admin
    .from("profiles")
    .update({ role: "operator" })
    .eq("id", user.id)
    .select("id")
    .single();
  if (error || !profile)
    throw error || new Error("The Auth user has no application profile.");
  console.info(`Operator role granted to ${email} (${user.id}).`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
