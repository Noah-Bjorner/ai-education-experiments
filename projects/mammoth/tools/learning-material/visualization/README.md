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
- **html:** 
    - ex: maps, mind maps, anatomy, diagrams, flowcharts, diagrams, astrology, worked examples, map directions between pins, map with pin, 360 world image, 
    - logic: take instructions then output json like {content: "xyz", type: "mermaid"} based on type then have reliable logic that converts it into html
    - challenge: how do I make it reliable as well as fast and cover all possible educational use cases

logic
1. route to correct modality


### animation

1. get reference when possible from html static?

### interactive

1. get reference when possible from html static?
