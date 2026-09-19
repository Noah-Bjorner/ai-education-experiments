import { renderWhiteboardSvg } from "../render/index.ts";
import { applyDrawingAnimation } from "./index.ts";

const spec = {
  title: "Parts of a whole",
  figures: [
    {
      type: "text" as const,
      id: "ask",
      title: null,
      role: "question" as const,
      text: "Which genre is more than half?",
      annotations: [],
      anchor: null,
      side: null,
    },
    {
      type: "pie_chart" as const,
      id: "books",
      title: "20 books",
      annotations: [
        {
          type: "callout" as const,
          targetIds: ["fiction"],
          text: "More than half",
        },
      ],
      slices: [
        { id: "fiction", label: "Fiction", value: 12 },
        { id: "nonfiction", label: "Nonfiction", value: 6 },
        { id: "poetry", label: "Poetry", value: 2 },
      ],
      anchor: "ask",
      side: "bottom" as const,
    },
    {
      type: "math_expressions" as const,
      id: "share",
      title: null,
      annotations: [],
      expressions: [{ id: "frac", latex: "12/20 = 0.6" }],
      anchor: "books",
      side: "bottom" as const,
    },
  ],
};

const { svg } = renderWhiteboardSvg(spec);
const animated = applyDrawingAnimation(svg, { speed: 1.25 });
const duration = Number(
  /data-drawing-duration="([^"]+)"/.exec(animated)?.[1] ?? 8,
);
const html = `<!doctype html>
<html lang="en"><meta charset="utf-8">
<title>Policy preview</title>
<style>
body{font:15px system-ui;margin:24px;background:#f5f4f1;color:#222}
svg{display:block;width:min(720px,100%);height:auto;background:white;border-radius:12px}
.controls{display:flex;gap:12px;align-items:center;margin:16px 0;max-width:720px}
input{flex:1}
</style>
<p>Title stays. Question draws. Chart pops. Then callout, equation.</p>
<div class="controls">
<button id="play">Pause</button>
<input id="time" type="range" min="0" max="${duration}" step="0.02" value="0">
<output id="readout">0.00 s</output>
</div>
${animated}
<script>
const svg=document.querySelector("svg");
const slider=document.getElementById("time");
const readout=document.getElementById("readout");
const button=document.getElementById("play");
const max=${duration};
let playing=true, time=0, previous=performance.now();
svg.pauseAnimations();
function seek(t){
  time=Math.min(max, Math.max(0,t));
  svg.setCurrentTime(time);
  slider.value=time;
  readout.value=time.toFixed(2)+" s / "+max.toFixed(2)+" s";
}
slider.oninput=()=>{playing=false;button.textContent="Play";seek(Number(slider.value));};
button.onclick=()=>{playing=!playing;if(time>=max)seek(0);button.textContent=playing?"Pause":"Play";};
function tick(now){
  if(playing){let next=time+(now-previous)/1000;if(next>max+0.8)next=0;seek(next);}
  previous=now;requestAnimationFrame(tick);
}
seek(0);requestAnimationFrame(tick);
</script>
`;
await Deno.mkdir(new URL("./output/", import.meta.url), { recursive: true });
const path = new URL("./output/policy-preview.html", import.meta.url);
await Deno.writeTextFile(path, html);
console.log(path.pathname);
console.log("duration", duration);
console.log(
  "instant",
  (animated.match(/data-drawing-method="instant"/g) || []).length,
);
console.log(
  "stroke",
  (animated.match(/data-drawing-method="(path|skeleton|wipe)"/g) || []).length,
);
