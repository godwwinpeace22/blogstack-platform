/** Synthetic, in-memory probe. Never passes customer content to the provider. */
import { fixture } from "../blogstack-api/test/support.js";
import {
  createAgentRun,
  executeAgent,
} from "../blogstack-api/src/lib/agents.js";
const token = process.env.CLOUDFLARE_API_TOKEN,
  account = process.env.CF_ACCOUNT_ID;
if (!token || !account)
  throw new Error(
    "Set Cloudflare account ID and API token. Values are never printed.",
  );
const f = fixture();
f.sql.run(
  "INSERT INTO posts(id,project_id,title,slug,content,author_id,created_at,updated_at) VALUES('synthetic','p1','Growing ferns','growing-ferns',?,'owner',?,?)",
  [
    JSON.stringify([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Ferns grow well in shade with moist soil." },
        ],
      },
    ]),
    f.now,
    f.now,
  ],
);
let calls = 0;
(f.env as any).AI = {
  run: async (model: string, options: Record<string, unknown>) => {
    calls++;
    const response = await fetch(
      "https://api.cloudflare.com/client/v4/accounts/" +
        encodeURIComponent(account) +
        "/ai/run/" +
        model,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(options),
        signal: AbortSignal.timeout(45000),
      },
    );
    const body = (await response.json()) as {
      success: boolean;
      result: unknown;
      errors?: { code: number }[];
    };
    console.log(
      JSON.stringify({
        providerStatus: response.status,
        errorCodes: body.errors?.map((e) => e.code),
        resultKeys:
          body.result && typeof body.result === "object"
            ? Object.keys(body.result)
            : [],
        usage: (body.result as { usage?: unknown })?.usage,
      }),
    );
    if (!response.ok || !body.success)
      throw new Error(
        "Workers AI probe failed (HTTP " +
          response.status +
          ", code " +
          (body.errors?.[0]?.code ?? "unknown") +
          ")",
      );
    return body.result;
  },
};
const id = await createAgentRun(f.env, "p1", "owner", {
  postId: "synthetic",
  profile: "seo",
  prompt:
    "Use the seo_report tool, then propose a concise descriptive search title only. Return the required JSON.",
});
await executeAgent(f.env, id);
const run = f.sql
  .query(
    "SELECT status,input_tokens,output_tokens,credits,error FROM agent_runs WHERE id=?",
  )
  .get(id);
console.log(
  JSON.stringify(
    { model: "llama-3.3-70b-instruct-fp8-fast", calls, ...(run as object) },
    null,
    2,
  ),
);
if ((run as { status: string }).status !== "complete") process.exitCode = 1;
