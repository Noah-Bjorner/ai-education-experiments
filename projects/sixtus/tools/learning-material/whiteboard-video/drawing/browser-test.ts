import { strict as assert } from "node:assert";
// Verification-only dependency; the SVG generator does not require a browser.
// deno-lint-ignore no-import-prefix
import { chromium } from "npm:playwright-core@1.55.0";
import { applyDrawingAnimation } from "./index.ts";

Deno.test("Chromium: blank start, partial ink, backward seeking, and pixel-identical final artwork", async () => {
  const browser = await chromium.launch({
    executablePath: Deno.env.get("CHROME_PATH") ??
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-background-networking"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1000, height: 400 },
    });
    // These fixtures contain only outlined geometry. No external fonts are needed.
    await page.route("https://**/*", (route) => route.abort());
    const mount = async (svg: string) => {
      await page.setContent(
        `<style>body{margin:0;background:white}svg{display:block;width:900px;height:300px}</style>${svg}`,
      );
    };
    const seek = async (seconds: number) => {
      await page.locator("svg").evaluate((element, seconds) => {
        const svg = element as SVGSVGElement;
        svg.pauseAnimations();
        svg.setCurrentTime(seconds);
      }, seconds);
      return await page.locator("svg").screenshot();
    };
    for (const name of ["equation", "shapes"]) {
      const original = await Deno.readTextFile(
        new URL(`./fixtures/${name}.svg`, import.meta.url),
      );
      await mount(original);
      const finished = await page.locator("svg").screenshot();
      await page.locator("svg").evaluate((element) => element.innerHTML = "");
      const blank = await page.locator("svg").screenshot();
      await mount(applyDrawingAnimation(original, { duration: 5 }));
      assert.deepEqual(await seek(0), blank, `${name}: zero must be blank`);
      const partial = await seek(1.6);
      assert.notDeepEqual(partial, blank);
      assert.notDeepEqual(partial, finished);
      assert.deepEqual(
        await seek(5),
        finished,
        `${name}: final artwork must match exactly`,
      );
      assert.deepEqual(
        await seek(1.6),
        partial,
        `${name}: backward seek must reproduce the same pixels`,
      );
      assert.deepEqual(
        await seek(0),
        blank,
        `${name}: rewind must hide completed strokes`,
      );
    }
  } finally {
    await browser.close();
  }
});
