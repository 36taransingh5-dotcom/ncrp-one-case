import { events } from "@/lib/realtime";
import { currentSession } from "@/lib/auth";
export const dynamic = "force-dynamic";
export async function GET() {
  if (!(await currentSession()))
    return new Response("Unauthorized", { status: 401 });
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (payload: unknown) =>
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
        );
      const update = (payload: unknown) => send(payload);
      events.on("case-update", update);
      send({ type: "connected" });
      const heartbeat = setInterval(() => send({ type: "heartbeat" }), 25000);
      cleanup = () => {
        clearInterval(heartbeat);
        events.off("case-update", update);
      };
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
