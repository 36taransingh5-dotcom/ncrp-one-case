import "server-only";

import { isLocalBackend } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { currentSession } from "@/lib/auth";

export async function assertRateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number,
) {
  if (isLocalBackend()) {
    const session = await currentSession();
    if (!session) throw new Error("UNAUTHORIZED");
    db.exec(
      "CREATE TABLE IF NOT EXISTS request_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL)",
    );
    const key = `${session.userId}:${bucket}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;
    const row = db
      .prepare(
        "INSERT INTO request_limits(key,count) VALUES(?,1) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
      )
      .get(key) as { count: number };
    if (row.count > limit) throw new Error("RATE_LIMITED");
    return;
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("consume_rate_limit", {
    p_bucket: bucket,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw new Error("Rate-limit state is unavailable. Please retry.");
  if (!data) throw new Error("RATE_LIMITED");
}
