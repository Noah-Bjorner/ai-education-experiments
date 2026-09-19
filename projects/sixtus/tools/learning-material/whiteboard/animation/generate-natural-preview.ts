import { applyDrawingAnimation } from "./index.ts";

const source = await Deno.readTextFile(
  new URL("./fixtures/natural-marks.svg", import.meta.url),
);
const equation = await Deno.readTextFile(
  new URL("./fixtures/equation.svg", import.meta.url),
);
const panels = [
  {
    name: "Natural drawing",
    description:
      "Softer starts and finishes, slower turns, brisker long gestures.",
    motion: "natural" as const,
    svg: source,
  },
  {
    name: "Previous drawing",
    description: "Constant speed and fixed pen-lift pauses.",
    motion: "linear" as const,
    svg: source.replaceAll("hatch-clip", "previous-hatch-clip"),
  },
  {
    name: "Writing · unchanged",
    description: "The existing equation strokes and timing.",
    motion: "natural" as const,
    svg: equation,
  },
];
const animated = panels.map((panel, i) =>
  applyDrawingAnimation(panel.svg, {
    markMotion: panel.motion,
    idPrefix: `comparison-${i}`,
  })
);
const html =
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Natural drawing comparison</title><style>
body{margin:40px auto;padding:0 24px;max-width:920px;background:#f5f4f1;color:#252525;font:15px system-ui,sans-serif}h1{font-size:26px}p{color:#666;line-height:1.5}section{padding:22px 28px;background:white;border-radius:12px;margin:18px 0}h2{font-size:17px;margin:0}section p{margin:6px 0 12px}svg{width:100%;height:240px;display:block}section:last-of-type svg{height:100px}.controls{display:flex;align-items:center;gap:12px;flex-wrap:wrap}button,select{font:inherit;padding:8px 12px}input{flex:1;min-width:120px}output{font-variant-numeric:tabular-nums;min-width:58px}.duration{font-size:13px;color:#666}
</style><h1>Natural drawing</h1><p>The same finished artwork with two movement models. Compare at natural speed, or fit both drawings into the same duration to focus on movement within each stroke.</p>
<div class="controls"><button id="play">Pause</button><button id="restart">Restart</button><select id="comparison" aria-label="Comparison timing"><option value="natural">Natural durations</option><option value="matched">Match durations</option></select><input aria-label="Animation time" id="time" type="range" min="0" step="0.01" value="0"><output id="readout">0.00 s</output></div>
${
    panels.map((p, i) =>
      `<section><h2>${p.name}</h2><p>${p.description} <span class="duration" id="duration-${i}"></span></p>${
        animated[i]
      }</section>`
    ).join("")
  }
<script>
const svgs=[...document.querySelectorAll('svg')],durations=svgs.map(s=>Number(s.dataset.drawingDuration));
const slider=document.getElementById('time'),button=document.getElementById('play'),mode=document.getElementById('comparison');
durations.forEach((d,i)=>document.getElementById('duration-'+i).textContent=d.toFixed(2)+' s');
let playing=true,time=0,previous=performance.now();
const limit=()=>mode.value==='matched'?Math.max(durations[0],durations[1]):Math.max(...durations);
svgs.forEach(s=>s.pauseAnimations());
function seek(t){time=t;const max=limit();slider.max=max;slider.value=Math.min(t,max);document.getElementById('readout').value=Math.min(t,max).toFixed(2)+' s';svgs.forEach((s,i)=>s.setCurrentTime(mode.value==='matched'&&i<2?Math.min(t,max)*durations[i]/max:Math.min(t,durations[i])));}
button.onclick=()=>{playing=!playing;if(time>=limit())seek(0);button.textContent=playing?'Pause':'Play';};
document.getElementById('restart').onclick=()=>seek(0);mode.onchange=()=>seek(0);
slider.oninput=()=>{playing=false;button.textContent='Play';seek(Number(slider.value));};
function tick(now){if(playing){const next=time+(now-previous)/1000;seek(next>limit()+1.2?0:next);}previous=now;requestAnimationFrame(tick);}
seek(0);requestAnimationFrame(tick);
</script></html>`;
await Deno.mkdir(new URL("./output/", import.meta.url), { recursive: true });
await Deno.writeTextFile(
  new URL("./output/natural-preview.html", import.meta.url),
  html,
);
console.log("Generated animation/output/natural-preview.html");
