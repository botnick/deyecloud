import puppeteer from "puppeteer-core";
const BASE="http://localhost:5174", PIN="2580";
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:"/usr/bin/google-chrome-stable",headless:true,args:["--no-sandbox","--hide-scrollbars","--force-color-profile=srgb"]});
const p=await b.newPage(); await p.setViewport({width:393,height:852,deviceScaleFactor:2});
await p.goto(BASE,{waitUntil:"domcontentloaded"});
await p.evaluate(async(pin)=>{await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pin})});},PIN);
await p.goto(BASE+"/history",{waitUntil:"networkidle2"}); await sleep(3500);
await p.evaluate(()=>{const x=[...document.querySelectorAll('button[aria-label="ก่อนหน้า"]')][0]; if(x)x.click();}); // yesterday
await sleep(5500);
await p.evaluate(()=>{const h=[...document.querySelectorAll("h2,h3")].find(e=>e.textContent.includes("วิเคราะห์")); if(h)h.scrollIntoView({block:"start"});}); await sleep(900);
await p.screenshot({path:"design/shots/real-hist-yday.png"}); console.log("shot yday");
await b.close();
