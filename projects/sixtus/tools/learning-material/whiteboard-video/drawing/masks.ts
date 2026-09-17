import { distance, pathData } from "./geometry.ts";
import type { StrokePlan } from "./stroke-plan.ts";

export type CreateSvg = (
  name: string,
  attributes: Record<string, string | number>,
) => Element;

/** All animation uses explicit SMIL times so arbitrary and backward seeks work. */
export function appendStrokeMasks(
  mask: Element,
  plan: StrokePlan,
  begin: number,
  duration: number,
  strokeGap: number,
  transform: string,
  create: CreateSvg,
) {
  const total = plan.strokes.reduce((sum, stroke) => sum + stroke.length, 0);
  const inkTime = duration - (plan.strokes.length - 1) * strokeGap;
  let cursor = begin;
  plan.strokes.forEach((stroke, index) => {
    const strokeDuration = inkTime * stroke.length / total;
    const group = create("g", {
      transform,
      "data-drawing-stroke": index,
      "data-stroke-start": cursor,
      "data-stroke-duration": strokeDuration,
    });
    const points = stroke.points;
    if (points.length === 1) {
      const dot = create("circle", {
        cx: points[0].x,
        cy: points[0].y,
        r: 0,
        style: "fill:white;stroke:none",
      });
      dot.appendChild(
        create("animate", {
          attributeName: "r",
          from: 0,
          to: points[0].width / 2,
          begin: `${cursor}s`,
          dur: `${strokeDuration}s`,
          fill: "freeze",
        }),
      );
      group.appendChild(dot);
    } else {
      // A direct SVG stroke needs only one brush. Inferred strokes use shorter
      // brushes to track changing ink widths without exposing nearby ink early.
      const segments = plan.kind === "path"
        ? [points]
        : points.slice(1).map((p, i) => [points[i], p]);
      const lengths = segments.map((segment) =>
        segment.slice(1).reduce((sum, p, i) => sum + distance(segment[i], p), 0)
      );
      const length = lengths.reduce((sum, value) => sum + value, 0);
      let offset = 0;
      segments.forEach((segment, i) => {
        if (lengths[i] <= 1e-8) return;
        const width = Math.max(...segment.map((p) => p.width));
        const start = cursor + strokeDuration * offset / length;
        const time = strokeDuration * lengths[i] / length;
        const brush = create("path", {
          d: pathData(segment),
          pathLength: lengths[i],
          "stroke-width": width,
          "stroke-dasharray": `${lengths[i]} ${lengths[i] + width * 2}`,
          "stroke-dashoffset": lengths[i],
          visibility: "hidden",
          style:
            "fill:none;stroke:white;stroke-linecap:round;stroke-linejoin:round;opacity:0;stroke-opacity:1",
        });
        // Hidden before begin also prevents a round dash cap leaving a dot at t=0.
        brush.appendChild(
          create("set", {
            attributeName: "visibility",
            to: "visible",
            begin: `${start}s`,
            fill: "freeze",
          }),
        );
        brush.appendChild(
          create("animate", {
            attributeName: "opacity",
            from: 0,
            to: 1,
            begin: `${start}s`,
            dur: `${Math.min(time, 0.004)}s`,
            fill: "freeze",
          }),
        );
        brush.appendChild(
          create("animate", {
            attributeName: "stroke-dashoffset",
            from: lengths[i],
            to: 0,
            begin: `${start}s`,
            dur: `${time}s`,
            fill: "freeze",
            calcMode: "linear",
          }),
        );
        group.appendChild(brush);
        offset += lengths[i];
      });
    }
    mask.appendChild(group);
    cursor += strokeDuration + strokeGap;
  });
}
