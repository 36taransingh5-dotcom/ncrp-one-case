import "server-only";

import { isLocalBackend } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function assertRateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number,
) {
  if (isLocalBackend()) return;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("consume_rate_limit", {
    p_bucket: bucket,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw new Error("Rate-limit state is unavailable. Please retry.");
  if (!data) throw new Error("RATE_LIMITED");
}
