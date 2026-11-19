import {getCollection} from "astro:content";
export async function GET(){
 const posts=await getCollection("blog",({data})=>!data.draft);
 const paths=["/","/pricing","/features","/blog","/privacy","/terms","/refunds","/support",...posts.map(p=>"/blog/"+p.slug)];
 return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+paths.map(path=>"<url><loc>https://blogstack-site.hidden-silence-2d18.workers.dev"+path.replaceAll("&","&amp;")+"</loc></url>").join("")+"</urlset>",{headers:{"Content-Type":"application/xml"}});
}
