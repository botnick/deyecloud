// node design/house/shoot.cjs '[{"q":"mode=day","out":"/path/day.png"}]'  (serve the repo root: python3 -m http.server 8766 --bind 127.0.0.1)
const puppeteer = require("../../node_modules/puppeteer-core"); const fs = require("fs");
(async () => {
  const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const p = await b.newPage(); p.on("pageerror", (e) => console.log("err:", e.message)); p.on("console", (m) => console.log("page:", m.text()));
  for (const job of JSON.parse(process.argv[2])) {
    await p.goto(`http://127.0.0.1:8766/design/house/scene.html?${job.q}`, { waitUntil: "load" });
    await p.waitForFunction(() => window.__done, { timeout: 90000 });
    fs.writeFileSync(job.out, Buffer.from((await p.evaluate(() => window.__done)).split(",")[1], "base64"));
    console.log(job.out, JSON.stringify(await p.evaluate(() => window.__anchors)));
  }
  await b.close();
})();
