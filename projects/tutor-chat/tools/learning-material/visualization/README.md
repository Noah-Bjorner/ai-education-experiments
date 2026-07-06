**Build plan *temp***
1. build image tool with first each modalities and then parent
2. build motion tool
3. put it all together and add to parent as valid tool

**Status *temp***
- implent generate ai image tool as primitive
- then setup remtion solution that is not that fucking slow
- goal is to have all the primatives and infrastructure in place for tommorow


## Idea

Have a visualizing tool that can leverage both still images and short motion/videos

Have it be a unifed tool that routes to the 3 different modalities: ai generated, web searched, remotion rendered

Have it use the same code as much as possible, as an example for animated graphs, make it get "image" version first then apply the animation, do this kind of thing whenever possible.

interface
- type: <still|motion>
- instructions: <string>

execution function
1. route based on type
2. route based on modality

tool defintion:
system prompt usage instruction:

to figure out:
1. can I allow anything other then just passing forward the instructions from parent to the moadlity functions?

### Image

modalities
- **ai generated**
    - ex: infographics, illustrations, pre-photographic reconstruction, annotate, stylize photo
- **web searched:** 
    - ex: current events, real world objects, historical photos, people, artworks, landmarks
- **remotion rendered:** 
    - ex: maps, concept maps, anatomy, statistics, flags, flowcharts, diagrams, astrology
    - logic: need grounding in svg or react code for things like graphs

### Motion
