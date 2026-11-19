import { createPolar } from "@polar-sh/sdk/2026-10";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
process.loadEnvFile("launch.env");
if (process.env.POLAR_SERVER !== "sandbox") throw new Error("This probe is sandbox-only");
const client = createPolar({accessToken:process.env.POLAR_ACCESS_TOKEN,environment:"sandbox",timeout:20000});
const saved=JSON.parse(readFileSync("artifacts/polar-webhook.sandbox.json","utf8"));
const endpoint=await client.webhooks.getWebhookEndpoint(saved.id);
const product=await client.products.get(process.env.POLAR_PRODUCT_SOLO_MONTH);
const probe=crypto.randomUUID();
let verified;
try {
  await client.webhooks.updateWebhookEndpoint(endpoint.id,{events:[...new Set([...endpoint.events,"product.updated"])]});
  await client.products.update(product.id,{metadata:{...product.metadata,blogstack_webhook_probe:probe}});
  for(let attempt=0;attempt<60;attempt++) {
    const deliveries=await client.webhooks.listWebhookDeliveries({endpoint_id:endpoint.id,event_type:"product.updated",limit:20});
    const delivery=deliveries.items.find(item=>JSON.stringify(item.webhook_event).includes(probe));
    if(delivery?.succeeded && delivery.http_code===200) {
      const sql="SELECT id,processed_at FROM payment_events WHERE type='product.updated' AND json_extract(payload,'$.data.metadata.blogstack_webhook_probe')='"+probe+"'";
      const result=spawnSync(process.execPath,["scripts/launch.mjs","cloudflare","d1","execute","MAIN_DB","--remote","--config",".launch/app.wrangler.json","--command",sql,"--json"],{encoding:"utf8",env:process.env});
      if(result.status!==0) throw new Error("Could not verify the persisted notification");
      const row=JSON.parse(result.stdout).flatMap(item=>item.results??[])[0];
      if(row?.processed_at) {
        verified={verifiedAt:new Date().toISOString(),environment:"sandbox",endpointId:endpoint.id,deliveryId:delivery.id,httpStatus:delivery.http_code,signedDelivery:true,persisted:true,processed:true,chargedCustomer:false};
        break;
      }
    }
    await new Promise(resolve=>setTimeout(resolve,2000));
  }
  if(!verified) throw new Error("The signed sandbox notification did not complete within the verification window");
  writeFileSync("artifacts/verification/polar-webhook.json",JSON.stringify(verified,null,2)+"\n");
  console.log("PASS: Polar signed a sandbox event; Cloudflare accepted, persisted and processed it. No customer or payment was created.");
} finally {
  await client.webhooks.updateWebhookEndpoint(endpoint.id,{events:endpoint.events});
  await client.products.update(product.id,{metadata:product.metadata});
}
