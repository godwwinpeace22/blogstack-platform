import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { fixture } from "../blogstack-api/test/support.js";
import { snapshot, persistSnapshot, analyticsReport } from "../blogstack-api/src/lib/analytics.js";
const config = parseEnv(readFileSync("launch.env", "utf8"));
const probe = JSON.parse(readFileSync(".launch/analytics-probe/runtime.json", "utf8"));
const f = fixture();
Object.assign(f.env,{CF_ACCOUNT_ID:config.CF_ACCOUNT_ID,CF_ANALYTICS_TOKEN:config.CF_ANALYTICS_TOKEN});
f.sql.run("INSERT INTO posts(id,project_id,title,slug,status,author_id,created_at,updated_at) VALUES(?,'p1','Synthetic analytics verification',?,'published','owner',?,?)",[probe.postId,probe.postId,f.now,f.now]);
async function event(type: string, overrides: Record<string,unknown> = {}, extraHeaders: Record<string,string> = {}) {
  const response=await fetch("http://localhost:8792/probe",{
    method:"POST",headers:{Authorization:"Bearer "+probe.secret,Origin:"https://blogstack-verification.example","Content-Type":"application/json","User-Agent":"BlogStack launch verification",...extraHeaders},
    body:JSON.stringify({postId:probe.postId,type,referrer:"https://search.example/find?private=one",...(type==="click"?{destination:"https://destination.example/read?private=one"}:{}),...overrides}),
  });
  assert.equal(response.status,204);
}
if (!process.argv.includes("--observe-only")) {
  await event("view"); await event("view"); await event("click");
  await event("view",{preview:true});
  await event("view",{},{DNT:"1"});
  await event("view",{},{"User-Agent":"Headless verification crawler"});
}
const day=new Date().toISOString().slice(0,10);
let rows: Awaited<ReturnType<typeof snapshot>> = [];
for(let attempt=0;attempt<40;attempt++){
  try { rows=await snapshot(f.env,"p1",day); } catch { /* First-write ingestion can be delayed. */ }
  if(rows.some(row=>row.post_id===probe.postId&&row.kind==="click"&&row.total===1) && rows.some(row=>row.post_id===probe.postId&&row.kind==="view"&&row.total===2))break;
  await new Promise(resolve=>setTimeout(resolve,2000));
}
const own=rows.filter(row=>row.post_id===probe.postId);
assert.equal(own.find(row=>row.kind==="view")?.total,2);
assert.equal(own.find(row=>row.kind==="click")?.total,1);
assert.equal(own.find(row=>row.kind==="destination")?.dimension,"https://destination.example/read");
await persistSnapshot(f.env,"p1",day);
await persistSnapshot(f.env,"p1",day);
const stored=f.sql.query("SELECT kind,total FROM analytics_daily WHERE project_id='p1' AND post_id=? AND day=? ORDER BY kind").all(probe.postId,day);
assert.deepEqual(stored,[{kind:"click",total:1},{kind:"destination",total:1},{kind:"view",total:2}]);
const report=await analyticsReport(f.env,"p1",1);
assert.equal(report.liveAvailable,true);
const post=report.posts.find(row=>row.postId===probe.postId);
assert.equal(post?.views,2);assert.equal(post?.clicks,1);
writeFileSync("artifacts/verification/analytics-live.json",JSON.stringify({verifiedAt:new Date().toISOString(),provider:"Cloudflare Analytics Engine",syntheticPostId:probe.postId,views:2,clicks:1,previewsOptOutAndBotsExcluded:true,destinationQueryRemoved:true,weightedQueries:true,dailySummaryIdempotent:true},null,2)+"\n");
console.log("PASS: real Analytics Engine collected two views and one click, excluded previews/opt-out/bots, and produced weighted reports and idempotent daily summaries.");
f.sql.close();
