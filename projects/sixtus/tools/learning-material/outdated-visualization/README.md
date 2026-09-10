**Build plan *temp***
- make still first since it will be a lot of overlap from that to motion for example

## Idea

Have a visualizing tool that can leverage both still images and short motion/videos

Have it be a unifed tool that routes to the 3 different modalities: ai generated, web searched, remotion rendered

Have it use the same code as much as possible, as an example for animated graphs, make it get "image" version first then apply the animation, do this kind of thing whenever possible.

interface
- type: <static|animation|interactive>
- instructions: <string>

execution function
1. route based on type
2. route based on modality

tool defintion:
system prompt usage instruction:

### static

modalities
- **ai generated**
    - ex: infographics?, illustrations, pre-photographic reconstruction, annotate, stylize photo
- **web searched:** 
    - ex: current events, real world objects, historical photos, people, artworks, landmarks, flags
- **svg/programmatic:** 
    - ex: maps, mind maps, anatomy, diagrams, flowcharts, diagrams, astrology, worked examples, map directions between pins, map with pin, 
    - logic: take instructions then output JSON like `{ content: "xyz", type: "xy_chart" }` and render that typed spec directly to standalone SVG
    - challenge: how do I make it reliable as well as fast and cover all possible educational use cases

Programmatic renderer layout:
- `static/renderers/<type>.ts`: one typed spec → standalone SVG
- `static/shared/`: SVG helpers and visual tokens shared by renderers
- `static/render.ts`: dispatch a diagram spec to the appropriate renderer

logic
1. route to correct modality


### animation

1. get reference when possible from html static?

### interactive

1. get reference when possible from html static?
