import { createClient } from "redis";

export const redis = createClient({
  url: process.env.REDIS_URL,
  socket: {
    reconnectStrategy: retries => Math.min(retries * 150, 2500)
  }
});

redis.on("error", err =>
  console.error("Redis connection:", err.message)
);