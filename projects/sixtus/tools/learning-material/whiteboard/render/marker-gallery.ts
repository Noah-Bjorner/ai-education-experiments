/** Production-renderer preview: deno run --allow-read --allow-write render/marker-gallery.ts */
import { renderHandwritten } from "./handwritten.ts";
import type { Shape } from "./shapes.ts";
import { applyDrawingAnimation } from "../animation/index.ts";
import { renderWhiteboardSvg } from "./index.ts";

export function markerSampler(roughness: number): string {
  let sequence = 0;
  const draw = (shape: Shape, options = {}) =>
    renderHandwritten(shape, {
      id: `sample-${sequence}`,
      seed: 31 + sequence++,
      roughness,
      stroke: "#263d59",
      strokeWidth: 2.7,
      ...options,
    }).markup;
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    draw({ type: "line", x1, y1, x2, y2 });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 280">
    ${line(34, 54, 217, 54)}
    ${draw({ type: "circle", cx: 365, cy: 83, r: 51 })}
    ${draw({ type: "rectangle", x: 490, y: 33, width: 230, height: 100 })}
    ${line(34, 116, 217, 107)}${line(201, 98, 217, 107)}${
    line(217, 107, 203, 118)
  }
    ${
    draw({ type: "ellipse", cx: 124, cy: 216, rx: 86, ry: 27 }, {
      stroke: "#3c82f6",
      strokeWidth: 3,
    })
  }
    ${
    draw({ type: "rectangle", x: 282, y: 180, width: 169, height: 64 }, {
      strokeDasharray: [8, 6],
      strokeWidth: 2,
    })
  }
    ${
    draw({ type: "circle", cx: 600, cy: 208, r: 41 }, {
      stroke: "#3c82f6",
      fill: "#3c82f6",
    })
  }
    <g data-drawing="static" fill="#8a9099" font-family="system-ui,sans-serif" font-size="11">
      <text x="34" y="19">LINE &amp; ARROW</text><text x="313" y="19">CIRCLE</text><text x="490" y="19">BOX</text>
      <text x="34" y="168">EMPHASIS</text><text x="282" y="168">DASHED BORDER</text><text x="552" y="155">HATCH FILL</text>
    </g></svg>`;
}

if (import.meta.main) {
  const out = new URL("./output-ex/marker/", import.meta.url);
  await Deno.mkdir(out, { recursive: true });
  const levels = [0, 0.7, 1.5, 3, 5];
  const variants = levels.map((roughness, i) =>
    applyDrawingAnimation(markerSampler(roughness), {
      duration: 7,
      idPrefix: `marker-${i}`,
    })
  );
  const board = renderWhiteboardSvg({
    title: "A little more human",
    figures: [{
      type: "xy_chart",
      id: "growth",
      title: "Progress over time",
      anchor: null,
      side: null,
      chartStyle: "bar",
      xLabel: "Week",
      yLabel: "Progress",
      series: [{
        id: "progress",
        name: "Practice",
        points: [
          { id: "a", x: "1", y: 3 },
          { id: "b", x: "2", y: 5 },
          { id: "c", x: "3", y: 8 },
        ],
      }],
      annotations: [
        { type: "highlight", targetIds: ["c"], text: null },
        { type: "callout", targetIds: ["b"], text: "Small steps add up" },
      ],
    }],
  }, { width: 740, height: 400 });
  await Deno.writeTextFile(new URL("board.svg", out), board.svg);
  const html =
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Whiteboard marker study</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f6f8;color:#263244;font:15px system-ui,sans-serif}main{max-width:1024px;margin:56px auto;padding:0 28px 60px}header{margin-bottom:28px}.eyebrow{font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:#647892}h1{font-size:34px;letter-spacing:-1px;font-weight:550;margin:10px 0}p{color:#738094;line-height:1.6;margin:8px 0}section{background:white;border:1px solid #e4e8ee;border-radius:16px;margin-top:20px;padding:26px}h2{font-size:16px;font-weight:550;margin:0 0 10px}.controls{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:24px 0 12px;font-size:13px}select,button{font:inherit;background:white;border:1px solid #d6dde7;border-radius:7px;padding:8px 12px;color:inherit}button{cursor:pointer}button:first-of-type{background:#263d59;color:white;border-color:#263d59}input{flex:1;min-width:100px;accent-color:#263d59}output{font-variant-numeric:tabular-nums;color:#738094}svg,img{display:block;width:100%;height:auto}.variants>div[hidden]{display:none}.comparison{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}.comparison section{padding:18px}.comparison svg{margin-top:20px}.comparison p{font-size:12px}.board img{max-width:780px;margin:20px auto}a{color:#3c82f6}@media(max-width:680px){main{padding:0 16px;margin-top:28px}.comparison{grid-template-columns:1fr}h1{font-size:28px}}
</style><main><header><div class="eyebrow">Whiteboard · marker study</div><h1>One stroke, a little human.</h1><p>Smooth hand drift, a gently changing marker width, and one continuous drawing movement.</p></header>
<section><h2>Try the hand steadiness</h2><p>These use the actual renderer. The seed stays the same as you change roughness.</p>
<div class="controls"><label for="roughness">Roughness</label><select id="roughness"><option value="0">0 · Clean</option><option value="1">0.7 · Steady</option><option value="2" selected>1.5 · Natural</option><option value="3">3 · Loose</option><option value="4">5 · Very loose</option></select><button id="play">Replay drawing</button><button id="finish">Finished</button><input id="time" aria-label="Drawing progress" type="range" min="0" max="7" value="7" step="0.01"><output id="readout">7.00 s</output></div>
<div class="variants">${
      variants.map((svg, i) => `<div ${i === 2 ? "" : "hidden"}>${svg}</div>`)
        .join("")
    }</div></section>
<div class="comparison">${
      [0.7, 1.5, 3].map((r, i) =>
        `<section><h2>${
          ["Steady", "Natural · default", "Loose"][i]
        }</h2><p>roughness = ${r}</p>${
          markerSampler(r).replaceAll("sample-", `compare-${i}-`)
        }</section>`
      ).join("")
    }</div>
<section class="board"><h2>On a real whiteboard</h2><p>The same single-pass treatment reaches chart outlines, axes, headings, and teaching annotations.</p><img src="board.svg" alt="Bar chart with hand-drawn marker outlines, boxed heading, highlight, and callout"></section></main>
<script>
const panels=[...document.querySelectorAll('.variants>div')],svgs=panels.map(p=>p.querySelector('svg')),slider=document.getElementById('time'),play=document.getElementById('play'),readout=document.getElementById('readout');
let time=7,playing=false,previous=performance.now();svgs.forEach(s=>s.pauseAnimations());
function seek(t){time=t;svgs.forEach(s=>s.setCurrentTime(t));slider.value=t;readout.value=t.toFixed(2)+' s';}
function stop(){playing=false;play.textContent='Replay drawing';}
document.getElementById('roughness').onchange=e=>{panels.forEach((p,i)=>p.hidden=i!==Number(e.target.value));seek(time)};
play.onclick=()=>{if(playing){stop();play.textContent='Continue'}else{if(time>=7)seek(0);playing=true;play.textContent='Pause'}};
document.getElementById('finish').onclick=()=>{stop();seek(7)};
slider.oninput=()=>{stop();seek(Number(slider.value))};
function tick(now){if(playing){seek(Math.min(7,time+(now-previous)/1000));if(time>=7)stop()}previous=now;requestAnimationFrame(tick)}seek(7);requestAnimationFrame(tick);
</script></html>`;
  await Deno.writeTextFile(new URL("index.html", out), html);
  console.log(new URL("index.html", out).pathname);
}
