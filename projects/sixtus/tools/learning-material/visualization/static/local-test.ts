import "@std/dotenv/load";

import { svgStaticVisualizationExecutor } from "./index.ts";

/** Pick any instruction, or paste a one-off. */
const instruction =
  "xy_chart (line): Supply, Demand, and Market Equilibrium. X=Quantity, Y=Price. Demand: (10,90), (30,70), (50,50), (70,30), (90,10). Supply: (10,10), (30,30), (50,50), (70,70), (90,90). Mark equilibrium at Q=50, P=50.";

const start = performance.now();

const result = await svgStaticVisualizationExecutor(instruction);
const end = performance.now();
console.log(JSON.stringify(result, null, 2));
console.log(`Time taken: ${((end - start) / 1000).toFixed(2)} seconds`);
console.log("Rendered a standalone SVG visualization.");

/*
Examples (static / still — not motion):

Diagrams / charts
- show a diagram to explain bell curve of heights among swedish men with data: ???
- xy_chart (line): Supply, Demand, and Market Equilibrium. X=Quantity, Y=Price. Demand: (10,90), (30,70), (50,50), (70,30), (90,10). Supply: (10,10), (30,30), (50,50), (70,70), (90,90). Mark equilibrium at Q=50, P=50.
- Draw a flowchart for the scientific method: ask a question, research, hypothesize, experiment, analyze, conclude (with a loop back if the hypothesis fails).
- Pie chart of Earth's atmosphere by volume: nitrogen ~78%, oxygen ~21%, argon ~0.9%, other gases ~0.1%.
- Venn diagram comparing mitosis vs meiosis: shared steps vs unique outcomes (identical vs genetically diverse cells).
- Timeline of the American Revolution from 1765 Stamp Act through 1783 Treaty of Paris.
- Quadrant: Eisenhower matrix for study tasks (urgent/important axes) with a few labeled homework examples.
- Radar chart comparing three study skills across focus, memory, note-taking, time management, and test strategy.
- Sequence diagram of HTTP request/response between Browser, CDN, and Origin server.

Maps / geography
- Simple labeled map of the Mediterranean showing Rome, Carthage, and major trade routes during the Punic Wars.
- World map highlighting the Ring of Fire with labels for major tectonic plate boundaries and volcano clusters.
- Choropleth-style US map showing relative population density by region (Northeast, South, Midwest, West).
- Map of the Nile with labels for Upper Egypt, Lower Egypt, the Delta, and key ancient cities.

Anatomy / biology
- Labeled cross-section of a plant cell: nucleus, chloroplast, mitochondria, cell wall, vacuole.
- Side-view diagram of the human heart showing chambers, valves, and oxygenated vs deoxygenated blood paths.
- Layered diagram of Earth's atmosphere: troposphere, stratosphere, mesosphere, thermosphere, exosphere.
- Food chain / energy pyramid for a grassland ecosystem (producers → primary → secondary → tertiary consumers).

Autonomy / systems & decision-making
- Flowchart of a self-driving car's perceive → plan → act loop, with sensors, planner, and actuators labeled.
- Decision tree for a thermostat: sense temperature → compare to setpoint → heat / cool / idle.
- Mind map of personal learning autonomy: goal-setting, self-monitoring, resource choice, reflection.
- Sequence diagram of a robot vacuum: map room → plan path → clean → dock when battery low.

General educational
- Mind map of the water cycle with evaporation, condensation, precipitation, and runoff around a center hub.
- Worked example: step-by-step solve of 2x + 5 = 17, each algebraic step as a labeled stage.
- Annotated solar system diagram with planets ordered from the Sun and relative orbit rings (not to scale, labeled).
- Comparison bar chart of renewable energy sources by typical capacity factor (solar, wind, hydro, nuclear).
*/
