import { HTTPException } from "hono/http-exception";

export function pagination(
  query: Record<string, string>,
  defaultLimit = 20,
  maxLimit = 100,
) {
  const limit = query.limit === undefined ? defaultLimit : Number(query.limit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > maxLimit) {
    throw new HTTPException(400, {
      message: `limit must be an integer from 1 to ${maxLimit}`,
    });
  }
  let cursor: { time: number; id: string } | null = null;
  if (query.cursor !== undefined) {
    const match = /^(\d+):([\w-]+)$/.exec(query.cursor);
    if (!match || !Number.isSafeInteger(Number(match[1])))
      throw new HTTPException(400, { message: "Invalid cursor" });
    cursor = { time: Number(match[1]), id: match[2]! };
  }
  if ((query.q?.length ?? 0) > 200)
    throw new HTTPException(400, {
      message: "Search is limited to 200 characters",
    });
  return { limit, cursor };
}

export const encodeCursor = (time: number, id: string) => `${time}:${id}`;
