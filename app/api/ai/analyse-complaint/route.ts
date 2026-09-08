import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { assertRateLimit } from "@/lib/rate-limit";
import { analyseCaseContent } from "@/lib/ai/case-intelligence";
import { aiError } from "@/lib/ai/http";

export async function POST(request: Request) {
  try {
    await requireRole("citizen");
    await assertRateLimit("ai-complaint", 6, 600);
    const { description } = z
      .object({ description: z.string().min(30).max(5000) })
      .strict()
      .parse(await request.json());
    return Response.json(await analyseCaseContent(description), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return aiError(error);
  }
}
