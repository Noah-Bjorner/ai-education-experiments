import { applyDrawingAnimation } from "./index.ts";

const directory = new URL("./", import.meta.url);
const equation = await Deno.readTextFile(
  new URL("fixtures/equation.svg", directory),
);
const shapes = await Deno.readTextFile(
  new URL("fixtures/shapes.svg", directory),
);
const duration = 5;
const animated = applyDrawingAnimation(equation, {
  duration,
  idPrefix: "equation-demo",
});
const animatedShapes = applyDrawingAnimation(shapes, {
  duration,
  idPrefix: "shapes-demo",
});
const wipe = applyDrawingAnimation(equation, {
  mode: "wipe",
  duration,
  idPrefix: "wipe-demo",
});
await Deno.writeTextFile(new URL("example.svg", directory), animated);
await Deno.writeTextFile(new URL("shapes.svg", directory), animatedShapes);
await Deno.writeTextFile(
  new URL("preview.html", directory),
  `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Whiteboard drawing comparison</title>
<style>
body{font:15px system-ui,sans-serif;color:#242424;background:#f5f4f1;margin:32px auto;padding:0 24px;max-width:920px}
h1{font-size:25px;font-weight:600}p{color:#666}section{background:white;padding:24px;margin:16px 0;border-radius:12px}
h2{font-size:14px;font-weight:500;color:#666;margin:0 0 20px}section svg{display:block;width:100%;height:140px}
.controls{display:flex;align-items:center;gap:16px;margin:24px 0}input{flex:1}button{padding:8px 14px;cursor:pointer}output{font-variant-numeric:tabular-nums;min-width:60px}
</style>
<h1>Whiteboard drawing</h1><p>Compare the original wipe with inferred pen strokes. Scrub to inspect any point.</p>
<div class="controls"><button id="play">Pause</button><input aria-label="Animation time" id="time" type="range" min="0" max="5" step="0.01" value="0"><output id="readout">0.00 s</output></div>
<section><h2>Stroke masks · Zhang–Suen centerlines</h2>${animated}</section>
<section><h2>Original rectangular wipe</h2>${wipe}</section>
<section><h2>Shapes · existing paths, plus an inferred filled ring</h2>${animatedShapes}</section>
<script>
const svgs=[...document.querySelectorAll('svg')];
const slider=document.getElementById('time'), readout=document.getElementById('readout'), button=document.getElementById('play');
let playing=true, time=0, previous=performance.now();
svgs.forEach(svg=>svg.pauseAnimations());
function seek(t){time=t;svgs.forEach(svg=>svg.setCurrentTime(Math.min(5,t)));slider.value=Math.min(5,t);readout.value=Math.min(5,t).toFixed(2)+' s';}
slider.oninput=()=>{playing=false;button.textContent='Play';seek(Number(slider.value));};
button.onclick=()=>{playing=!playing;if(time>=5)seek(0);button.textContent=playing?'Pause':'Play';};
function tick(now){if(playing){let next=time+(now-previous)/1000;if(next>6.2)next=0;seek(next);}previous=now;requestAnimationFrame(tick);}
seek(0);requestAnimationFrame(tick);
</script></html>`,
);
console.log("Generated drawing/example.svg, shapes.svg and preview.html");
