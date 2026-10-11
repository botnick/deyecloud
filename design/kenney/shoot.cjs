const puppeteer=require("/home/l22/Desktop/deyecloud/.tmx-worktrees/main/node_modules/puppeteer-core");const fs=require("fs");
(async()=>{const b=await puppeteer.launch({executablePath:"/usr/bin/google-chrome",headless:true,args:["--no-sandbox","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});
const p=await b.newPage(); p.on("console",m=>console.log("page:",m.text())); p.on("pageerror",e=>console.log("err:",e.message));
for (const job of JSON.parse(process.argv[2])) {
  await p.goto(`http://127.0.0.1:8766/render/render.html?${job.q}`,{waitUntil:"load"});
  await p.waitForFunction(()=>window.__done,{timeout:60000});
  const d=await p.evaluate(()=>window.__done); fs.writeFileSync(job.out,Buffer.from(d.split(",")[1],"base64"));
  if(job.mats) console.log(job.out, JSON.stringify(await p.evaluate(()=>window.__sizes)));
}
await b.close();})();
