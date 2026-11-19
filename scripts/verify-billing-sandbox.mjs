import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";
import {createPolar} from "@polar-sh/sdk/2026-10";
const path=".launch/billing-sandbox-fixture.json";
const fixture=JSON.parse(readFileSync(path,"utf8"));
assert.match(new URL(fixture.url).hostname,/^blogstack-sandbox-app\./);
const access=JSON.parse(readFileSync(".launch/polar.sandbox.secrets.json","utf8"));
const client=createPolar({accessToken:access.POLAR_ACCESS_TOKEN,environment:"sandbox",timeout:20000});
const main=JSON.parse(readFileSync("artifacts/polar-webhook.sandbox.json","utf8"));
if(process.argv.includes("--restore-preview-webhook")){
  await client.webhooks.updateWebhookEndpoint(main.id,{enabled:true});
  console.log("Restored the preview's sandbox notification endpoint.");
  process.exit();
}
const save=()=>writeFileSync(path,JSON.stringify(fixture,null,2)+"\n",{mode:0o600});
async function request(user,path,method="GET",body){
  const response=await fetch(fixture.url+path,{method,headers:{Origin:fixture.url,Accept:"application/json","Content-Type":"application/json",Cookie:user.cookie??""},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error("Sandbox "+path+" returned HTTP "+response.status);
  return response.json();
}
for(const user of fixture.users){
  if(!user.cookie){
    const response=await fetch(fixture.url+"/api/auth/sign-in/email",{method:"POST",headers:{Origin:fixture.url,"Content-Type":"application/json"},body:JSON.stringify({email:user.email,password:fixture.password}),signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw new Error("Synthetic "+user.plan+"/"+user.interval+" sign-in returned HTTP "+response.status);
    user.cookie=response.headers.getSetCookie().map(value=>value.split(";")[0]).join("; ");
  }
  assert(user.cookie,"Expected a real signed session cookie");
  const account=await request(user,"/accounts/me");
  assert.equal(account.ownerId,user.userId);
  user.accountId=account.id;
  save();
  console.log("PASS real sandbox owner session: "+user.plan+"/"+user.interval);
}
if(process.argv.includes("--prepare-checkouts")){
  // The live app is still a closed sandbox preview; direct synthetic notifications only to the test database.
  await client.webhooks.updateWebhookEndpoint(main.id,{enabled:false});
  try{
    for(const user of fixture.users){
      const result=await request(user,"/accounts/"+user.accountId+"/billing/checkout","POST",{plan:user.plan,interval:user.interval});
      assert.equal(new URL(result.url).hostname,"sandbox.polar.sh","A payment drill must never open a live checkout");
      user.checkoutUrl=result.url;save();
      console.log("READY sandbox checkout: "+user.plan+"/"+user.interval);
    }
  }catch(error){await client.webhooks.updateWebhookEndpoint(main.id,{enabled:true});throw error;}
}
if(process.argv.includes("--report")){
  const results=[];
  for(const user of fixture.users){
    const status=await request(user,"/accounts/"+user.accountId+"/billing");
    results.push({plan:user.plan,interval:user.interval,confirmedPlan:status.plan,status:status.status,paidThrough:status.paidThrough,providerStatus:status.providerStatus});
  }
  writeFileSync("artifacts/verification/billing-sandbox.json",JSON.stringify({verifiedAt:new Date().toISOString(),environment:"sandbox",results},null,2)+"\n");
  console.log(JSON.stringify(results,null,2));
}
