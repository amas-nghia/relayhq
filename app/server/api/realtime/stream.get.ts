import { createEventStream, defineEventHandler } from "h3";

import { subscribeRealtimeUpdates } from "../../services/realtime/bus";

export default defineEventHandler((event) => {
  const stream = createEventStream(event);

  const unsubscribe = subscribeRealtimeUpdates((update) => {
    void stream.push(JSON.stringify(update));
  });

  const heartbeat = setInterval(() => {
    void stream.push(JSON.stringify({
      id: `ping-${Date.now()}`,
      kind: "ping",
      reason: null,
      timestamp: new Date().toISOString(),
      taskId: null,
      agentId: null,
      source: null,
    }));
  }, 30_000);

  stream.onClosed(() => {
    clearInterval(heartbeat);
    unsubscribe();
  });

  return stream.send();
});
