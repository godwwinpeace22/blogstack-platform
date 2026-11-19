import type {
  DurableObjectState,
  WebSocket,
  Request,
} from "@cloudflare/workers-types";
import { verifyDraftAssertion } from "../lib/draft-auth.js";
import { validContent } from "../lib/content.js";
import type { Bindings } from "../types.js";

/** Authenticated, hibernation-safe collaborative draft storage. */
export class EditorDraft {
  constructor(
    private state: DurableObjectState,
    private env: Bindings,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const assertion = request.headers.get("x-draft-assertion") ?? "";
    const signature = request.headers.get("x-draft-signature") ?? "";
    if (
      !(await verifyDraftAssertion(
        this.env.BETTER_AUTH_SECRET,
        assertion,
        signature,
      ))
    )
      return new Response("Unauthorized", { status: 401 });
    let identity: {
      userId: string;
      postId: string;
      role: string;
      expiresAt: number;
    };
    try {
      identity = JSON.parse(assertion);
    } catch {
      return new Response("Unauthorized", { status: 401 });
    }
    const now = Math.floor(Date.now() / 1000);
    const postId = new URL(request.url).pathname.split("/")[2];
    if (
      identity.postId !== postId ||
      !identity.userId ||
      !["writer", "editor", "project_admin"].includes(identity.role) ||
      !Number.isSafeInteger(identity.expiresAt) ||
      identity.expiresAt <= now ||
      identity.expiresAt > now + 60
    )
      return new Response("Unauthorized", { status: 401 });
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
      return new Response("Expected WebSocket upgrade", { status: 426 });
    const pair = new WebSocketPair() as { 0: WebSocket; 1: WebSocket };
    const [client, server] = [pair[0], pair[1]];
    server.serializeAttachment({
      userId: identity.userId,
      postId: identity.postId,
      connectedAt: now,
    });
    this.state.acceptWebSocket(server);
    const saved = await this.state.storage.get<string>("content");
    const post =
      saved === undefined
        ? await this.env.MAIN_DB.prepare(
            `SELECT content FROM posts WHERE id = ?`,
          )
            .bind(identity.postId)
            .first<{ content: string }>()
        : null;
    server.send(
      JSON.stringify({ type: "init", content: saved ?? post?.content ?? "[]" }),
    );
    return new Response(null, {
      status: 101,
      // @ts-expect-error Cloudflare adds webSocket to ResponseInit.
      webSocket: client,
    });
  }

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    if (
      typeof message !== "string" ||
      new TextEncoder().encode(message).length > 1024 * 1024
    ) {
      ws.close(1009, "Message too large");
      return;
    }
    const identity = ws.deserializeAttachment() as {
      userId: string;
      postId: string;
      connectedAt: number;
    } | null;
    if (!identity || Date.now() / 1000 - identity.connectedAt > 3600) {
      ws.close(1008, "Reconnect to renew authorization");
      return;
    }
    const { getEffectiveProjectRole } = await import("../lib/permissions.js");
    const post = await this.env.MAIN_DB.prepare(
      `SELECT project_id, author_id FROM posts WHERE id = ?`,
    )
      .bind(identity.postId)
      .first<{ project_id: string; author_id: string }>();
    const role = post
      ? await getEffectiveProjectRole(
          this.env.MAIN_DB,
          identity.userId,
          post.project_id,
        )
      : null;
    if (!role || (role === "writer" && post?.author_id !== identity.userId)) {
      ws.close(1008, "Access revoked");
      return;
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(message);
    } catch {
      ws.close(1007, "Invalid JSON");
      return;
    }
    if (!parsed || typeof parsed !== "object") {
      ws.close(1008, "Invalid message");
      return;
    }
    let outgoing: unknown;
    if (
      parsed.type === "save" &&
      typeof parsed.content === "string" &&
      validContent(parsed.content)
    ) {
      await this.state.storage.put("content", parsed.content);
      outgoing = { type: "save", content: parsed.content };
    } else if (
      parsed.type === "cursor" &&
      typeof parsed.position === "object" &&
      JSON.stringify(parsed.position).length <= 4096
    ) {
      outgoing = {
        type: "cursor",
        userId: identity.userId,
        position: parsed.position,
      };
    } else {
      ws.close(1008, "Invalid message");
      return;
    }
    for (const session of this.state.getWebSockets()) {
      if (session !== ws && session.readyState === 1)
        session.send(JSON.stringify(outgoing));
    }
  }
  async webSocketClose(ws: WebSocket): Promise<void> {
    ws.close();
  }
  async webSocketError(ws: WebSocket): Promise<void> {
    ws.close(1011, "WebSocket error");
  }
}
