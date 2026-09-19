## Idea 1
1. generate full per scene script with grounding if needed
2. create the whiteboard visuals and speech
3. layout a canvas with all visuals layed out then have remotion logic and have timestamp based camera movings and drawing animations

## Primatives required
- whiteboard
- text-to-speech [DONE]
- drawing animation (SVG rewrite lives in `../whiteboard/animation`; this package later triggers/seeks it)

## Canvas idea
- have a flex box grid that progresses from left to right and also goes top to bottom when more on same subject

## Drawing logic
- SVG handwriting animation is generated in `../whiteboard/animation` because it is part of the SVG
- this package later triggers when to play it (and which parts start already visible)
- need handrawn animation style that's realistic
- need to be able to set trigger for it and also sometimes part's might be visible from the jump
- needs to be realisic so multiple parts can't be drawn at the same time
- remotion -> drawing: [target_id: X, start_time: X, duration: X]

## Remotion data
- canvas
- scenes:
    - 
