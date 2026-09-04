import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { seedDemo } from "@/lib/seed";
import { isDemoAccessEnabled, isLocalBackend } from "@/lib/supabase/config";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  if (!isDemoAccessEnabled())
    return NextResponse.json(
      { error: "Demo reset is disabled on the production backend." },
      { status: 404 },
    );
  try {
    await requireRole("operator");
    if (isLocalBackend()) {
      seedDemo(true);
    } else {
      const citizenEmail = process.env.NCRP_DEMO_CITIZEN_EMAIL;
      const operatorEmail = process.env.NCRP_DEMO_OPERATOR_EMAIL;
      if (!citizenEmail || !operatorEmail)
        throw new Error("Demo identities are not configured.");
      const admin = createSupabaseAdminClient();
      const { data, error: usersError } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      if (usersError) throw usersError;
      const citizen = data.users.find(
        (user) => user.email?.toLowerCase() === citizenEmail.toLowerCase(),
      );
      const operator = data.users.find(
        (user) => user.email?.toLowerCase() === operatorEmail.toLowerCase(),
      );
      if (!citizen || !operator)
        throw new Error("Demo identities are missing.");
      const { error: seedError } = await admin.rpc("seed_round2_demo", {
        p_citizen_user_id: citizen.id,
        p_operator_user_id: operator.id,
      });
      if (seedError) throw seedError;
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Operator access is required." },
      { status: 403 },
    );
  }
}
