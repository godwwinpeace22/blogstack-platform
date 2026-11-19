import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
const databaseId=process.argv[2];
if(!/^[a-f0-9-]{36}$/.test(databaseId??""))throw new Error("Pass the actual isolated sandbox database ID");
const settings=JSON.parse(readFileSync(".launch/settings.json","utf8"));
const config=JSON.parse(readFileSync(".launch/app.wrangler.json","utf8"));
const resources=JSON.parse(readFileSync(".launch/sandbox-resources.json","utf8"));
if(config.d1_databases.some(db=>db.database_id===databaseId))throw new Error("The sandbox cannot use the live database");
if(resources.databaseId!==databaseId||config.kv_namespaces.some(ns=>[resources.cacheId,resources.cdnCacheId].includes(ns.id)))throw new Error("The sandbox must use its own resources");
const url="https://blogstack-sandbox-app."+settings.subdomain;
const cdnUrl="https://blogstack-sandbox-cdn."+settings.subdomain;
config.name="blogstack-sandbox-app";
config.assets.directory="./sandbox-dashboard";
config.d1_databases=[{binding:"MAIN_DB",database_name:"blogstack-sandbox-db",database_id:databaseId,migrations_dir:"../blogstack-api/migrations"}];
config.kv_namespaces=[{binding:"CACHE",id:resources.cacheId},{binding:"CDN_CACHE",id:resources.cdnCacheId}];
config.r2_buckets=[{binding:"MEDIA",bucket_name:resources.mediaBucket}];
config.queues={producers:[{binding:"JOB_QUEUE",queue:"blogstack-sandbox-jobs"}],consumers:[{queue:"blogstack-sandbox-jobs",max_batch_size:1,max_batch_timeout:1,max_retries:3,dead_letter_queue:"blogstack-sandbox-jobs-dead"}]};
config.ratelimits=config.ratelimits.map((limit,index)=>({...limit,namespace_id:String(1101+index)}));
config.vars={...config.vars,API_URL:url,FRONTEND_URL:url,CDN_URL:cdnUrl,SIGNUP_MODE:"closed",PILOT_EMAILS:"",CHECKOUT_ENABLED:"false",POLAR_SERVER:"sandbox",...JSON.parse(readFileSync("artifacts/polar-products.sandbox.json","utf8"))};
writeFileSync(".launch/sandbox.app.wrangler.json",JSON.stringify(config,null,2)+"\n",{mode:0o600});
if(!existsSync(".launch/sandbox.secrets.json")){
  const common=JSON.parse(readFileSync(".launch/secrets.json","utf8"));
  const polar=JSON.parse(readFileSync(".launch/polar.sandbox.secrets.json","utf8"));
  writeFileSync(".launch/sandbox.secrets.json",JSON.stringify({...common,...polar,BETTER_AUTH_SECRET:randomBytes(48).toString("base64url"),CDN_SECRET:randomBytes(48).toString("base64url")},null,2)+"\n",{mode:0o600});
}
const cdn=JSON.parse(readFileSync(".launch/cdn.wrangler.json","utf8"));
cdn.name="blogstack-sandbox-cdn";
cdn.d1_databases=config.d1_databases;
cdn.kv_namespaces=[{binding:"CDN_CACHE",id:resources.cdnCacheId}];
cdn.r2_buckets=[{binding:"R2",bucket_name:resources.mediaBucket}];
cdn.vars.API_BASE_URL=url;
writeFileSync(".launch/sandbox.cdn.wrangler.json",JSON.stringify(cdn,null,2)+"\n",{mode:0o600});
const secrets=JSON.parse(readFileSync(".launch/sandbox.secrets.json","utf8"));
writeFileSync(".launch/sandbox.cdn.secrets.json",JSON.stringify({CDN_SECRET:secrets.CDN_SECRET},null,2)+"\n",{mode:0o600});
const fixturePath=".launch/billing-sandbox-fixture.json";
if(!existsSync(fixturePath)){
  const password="Sandbox-"+randomBytes(24).toString("base64url");
  const users=[];
  for(const plan of ["solo","studio","growth"])for(const interval of ["month","year"])
    users.push({plan,interval,userId:randomUUID(),credentialId:randomUUID(),email:"qa-blogstack-"+plan+"-"+interval+"-"+randomBytes(6).toString("hex")+"@boldlaunchstudio.com",passwordHash:await hashPassword(password)});
  writeFileSync(fixturePath,JSON.stringify({url,databaseId,password,users},null,2)+"\n",{mode:0o600});
}
const fixture=JSON.parse(readFileSync(fixturePath,"utf8"));
if(fixture.databaseId!==databaseId||fixture.url!==url)throw new Error("The saved sandbox fixture belongs to another environment");
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const sql=[];
for(const user of fixture.users){
  sql.push("INSERT OR IGNORE INTO users(id,name,email,email_verified,created_at,updated_at) VALUES("+[user.userId,"Synthetic BlogStack billing owner",user.email,1].map(quote).join(",")+",unixepoch(),unixepoch());");
  sql.push("INSERT OR IGNORE INTO account(id,account_id,provider_id,user_id,password,created_at,updated_at) VALUES("+[user.credentialId,user.userId,"credential",user.userId,user.passwordHash].map(quote).join(",")+",unixepoch(),unixepoch());");
  // The authenticated API creates each owned billing account using its normal lifecycle.
}
writeFileSync(".launch/sandbox-seed.sql",sql.join("\n")+"\n",{mode:0o600});
console.log(JSON.stringify({url,databaseId,syntheticAccounts:fixture.users.length,signup:"closed",liveDatabaseUntouched:true}));
