import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
const host = "hidden-silence-2d18.workers.dev";
const checks = [["blogstack-app","/health","json"],["blogstack-app","/login","html"],["blogstack-docs","/docs/quickstart","html"],["blogstack-registry","/r/blog-post.json","registry"],["blogstack-site","/","preview"]];
const results = [];
for (const [worker,path,kind] of checks) {
  const url="https://"+worker+"."+host+path;
  const response=await fetch(url,{headers:{Accept:["html","preview"].includes(kind)?"text/html":"application/json"}});
  assert.equal(response.status,200,url);
  const body=await response.text();
  if(kind==="registry") {
    assert.equal(JSON.parse(body).name,"blog-post");
    assert.equal(response.headers.get("access-control-allow-origin"),"*");
    assert(body.includes("blogstack-app."+host));
  }
  if(kind==="preview") {
    assert(body.includes("Private preview"));
    assert(body.includes("$3"));
    assert(!body.includes("https://app.blogstack.dev"));
  }
  if(kind==="html") assert(body.includes("<html"));
  results.push({url,status:response.status});
  console.log("PASS "+url);
}
const unsigned=await fetch("https://blogstack-app."+host+"/billing/webhooks/polar",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});
assert.equal(unsigned.status,401);
results.push({check:"unsigned webhooks rejected",status:unsigned.status});
writeFileSync("artifacts/verification/preview-services.json",JSON.stringify({verifiedAt:new Date().toISOString(),results},null,2)+"\n");
