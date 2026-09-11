/**
 * Self-contained tutor goals for spec-generation tests.
 * Paste `goal` into the whiteboard tool. `expectedTypes` / `expectedLayout`
 * are tester hints only — do not put type names in the goal itself.
 */
export type WhiteboardPromptLayout = "single" | "split" | "stack";

export type WhiteboardPromptType =
  | "xy_chart"
  | "pie_chart"
  | "math_expressions"
  | "coordinate_plot"
  | "geometry"
  | "freeform";

export type WhiteboardPromptCase = {
  id: string;
  expectedTypes: readonly WhiteboardPromptType[];
  expectedLayout: WhiteboardPromptLayout;
  goal: string;
};

export const WHITEBOARD_PROMPT_BANK = {
  xy_chart: [
    {
      id: "xy-bar-lemonade",
      expectedTypes: ["xy_chart"],
      expectedLayout: "single",
      goal:
        "A 6th grader ran a weekend lemonade stand and wants to see which flavor sold best. Saturday they sold 14 classic, 9 strawberry, and 5 mint. Sunday they sold 11 classic, 16 strawberry, and 4 mint. Help them compare the flavors and notice that strawberry overtook classic on Sunday.",
    },
    {
      id: "xy-line-battery",
      expectedTypes: ["xy_chart"],
      expectedLayout: "single",
      goal:
        "A middle-schooler is confused about why their phone is dead by last period. Help them see battery percent falling through the school day: 7:00 100%, 9:00 82%, 12:00 61%, 14:00 44%, 16:00 18%. They should notice the drop speeds up after lunch. Circle the 16:00 point and add a callout that they are below 20% by the end of the day.",
    },
    {
      id: "xy-scatter-free-throws",
      expectedTypes: ["xy_chart"],
      expectedLayout: "single",
      goal:
        "A basketball coach wants a 9th grader to see whether practice time is related to free-throw percentage. Paired observations this month: 1 hour → 42%, 2 → 48%, 3 → 55%, 4 → 61%, 5 → 58%, 6 → 70%, 8 → 74%. Help them see the overall upward relationship and that 5 hours is a bit off the pattern.",
    },
    {
      id: "xy-area-savings",
      expectedTypes: ["xy_chart"],
      expectedLayout: "single",
      goal:
        "Help a high-schooler picture how a savings balance grows when they add the same amount each month. Starting January they have $40, then $80, $120, $160, $200, and $240 by June. The takeaway is that the amount in the account is the accumulating total, not just each month's deposit.",
    },
    {
      id: "xy-line-two-cities",
      expectedTypes: ["xy_chart"],
      expectedLayout: "single",
      goal:
        "A geography class is comparing typical high temperatures in °C for two cities over the same week. Portland: Mon 12, Tue 14, Wed 11, Thu 13, Fri 16, Sat 18, Sun 15. Phoenix: Mon 28, Tue 30, Wed 31, Thu 33, Fri 34, Sat 32, Sun 29. Help them see that Phoenix stays much warmer and that Portland's weekend bump still never catches up.",
    },
    {
      id: "xy-bar-not-pie",
      expectedTypes: ["xy_chart"],
      expectedLayout: "single",
      goal:
        "Four classmates took the same quiz out of 20 points: Maya 18, Jordan 12, Priya 16, Luis 9. Help a 5th grader compare their scores. These are independent scores, not parts of one whole, so they should see who scored highest and that Luis is furthest behind.",
    },
  ],

  pie_chart: [
    {
      id: "pie-allowance",
      expectedTypes: ["pie_chart"],
      expectedLayout: "single",
      goal:
        "A 5th grader gets a $20 weekly allowance and wants to see where it goes: $8 snacks, $5 savings, $4 games, $3 gifts. Help them understand how each category shares the same $20, and that snacks are the largest slice. Circle snacks' percentage and add an arrow that snacks are 40% of the allowance.",
    },
    {
      id: "pie-class-time",
      expectedTypes: ["pie_chart"],
      expectedLayout: "single",
      goal:
        "Help a new 7th grader picture a 6-hour school day: 3 hours core classes, 1 hour electives, 1 hour lunch and passing, 1 hour advisory and PE. They should see that core classes are half the day and that lunch-plus-passing is the same size as electives.",
    },
    {
      id: "pie-screen-time",
      expectedTypes: ["pie_chart"],
      expectedLayout: "single",
      goal:
        "A parent and 8th grader logged 10 hours of weekend screen time: 4 hours video, 3 hours games, 2 hours social, 1 hour homework apps. Help them see the mix of the 10 hours and that entertainment (video plus games) is most of it. Put a bracket around video and games if that makes the grouping clear.",
    },
    {
      id: "pie-soccer-minutes",
      expectedTypes: ["pie_chart"],
      expectedLayout: "single",
      goal:
        "In an 80-minute youth soccer match, one player was on the field 48 minutes, on the bench 24 minutes, and in a drinks break 8 minutes. Help the player see those as parts of the same match, and that they were on the field for more than half the time.",
    },
    {
      id: "pie-pizza-vote",
      expectedTypes: ["pie_chart"],
      expectedLayout: "single",
      goal:
        "A class of 24 students voted on one pizza topping each: 10 pepperoni, 7 cheese, 5 veggie, 2 pineapple. Help them see how the votes make up the class, and that pepperoni is the plurality but not a majority. Call out that pepperoni is less than half.",
    },
  ],

  math_expressions: [
    {
      id: "math-two-step-tickets",
      expectedTypes: ["math_expressions"],
      expectedLayout: "single",
      goal:
        "A 7th grader bought movie tickets. Two tickets plus a $4 popcorn came to $22. Help them solve 2x + 4 = 22 for the price of one ticket, showing the algebra steps in order so they see why they subtract 4 first, then divide by 2. The ticket costs $9.",
    },
    {
      id: "math-percent-sale",
      expectedTypes: ["math_expressions"],
      expectedLayout: "single",
      goal:
        "A hoodie is marked $48 and is 25% off. Help an 8th grader write and evaluate the sale price as 48(1 - 0.25), then as 48 × 0.75, and land on $36. They should see that 25% off means paying 75% of the original.",
    },
    {
      id: "math-like-terms",
      expectedTypes: ["math_expressions"],
      expectedLayout: "single",
      goal:
        "A student simplified 3x + 5 + 2x - 1 incorrectly to 5x - 4. Show the correct combining of like terms to 5x + 4, and strike through the wrong result if that helps them see the sign error on the constants.",
    },
    {
      id: "math-pythagorean-ladder",
      expectedTypes: ["math_expressions"],
      expectedLayout: "single",
      goal:
        "A painter's ladder sits 8 ft from a wall and reaches 15 ft up. Help a geometry student use a^2 + b^2 = c^2 to find the ladder length, showing 8^2 + 15^2 = c^2, 64 + 225 = 289, and c = 17 ft.",
    },
    {
      id: "math-coffee-system",
      expectedTypes: ["math_expressions"],
      expectedLayout: "single",
      goal:
        "Two coffee orders: 2 lattes and 1 muffin cost $11; 1 latte and 1 muffin cost $7. Help an Algebra 1 student write the system 2L + M = 11 and L + M = 7, then subtract to find L = 4 and M = 3. Keep it to a short sequence of steps.",
    },
    {
      id: "math-quadratic-formula",
      expectedTypes: ["math_expressions"],
      expectedLayout: "single",
      goal:
        "A student needs to solve x^2 - 5x + 6 = 0 with the quadratic formula, not factoring. Show the formula, substitute a = 1, b = -5, c = 6, simplify under the radical to 1, and get x = 3 and x = 2.",
    },
  ],

  coordinate_plot: [
    {
      id: "coord-ramp-slope",
      expectedTypes: ["coordinate_plot"],
      expectedLayout: "single",
      goal:
        "A civic-design unit is checking a wheelchair ramp. The ramp follows y = (1/12)x from (0, 0) to (12, 1), with x in feet of run and y in feet of rise. Help a 8th grader see that a run of 12 ft gives a rise of 1 ft. Draw the rise and run segments and label them 1 and 12 so the 1:12 slope is obvious.",
    },
    {
      id: "coord-ball-throw",
      expectedTypes: ["coordinate_plot"],
      expectedLayout: "single",
      goal:
        "In physics, a ball thrown from a 1 m height follows y = -0.2x^2 + 1.6x + 1, with x in meters downfield and y in meters up. Help them see it rises then falls back to the ground. Mark the vertex around (4, 4.2) and the landing near x = 8.5. Use a window that shows the whole flight, not a zoomed-in sliver.",
    },
    {
      id: "coord-taxi-piecewise",
      expectedTypes: ["coordinate_plot"],
      expectedLayout: "single",
      goal:
        "A city's taxi fare is $3 for any ride up to 1 km, then $2 per extra km. For distance x in km, fare is 3 when 0 ≤ x ≤ 1, and 2x + 1 when x > 1. Help a student graph this piecewise function with closed/open endpoints at x = 1 so they see the flag drop, then the steeper line after 1 km.",
    },
    {
      id: "coord-ferris-wheel",
      expectedTypes: ["coordinate_plot"],
      expectedLayout: "single",
      goal:
        "A Ferris wheel has radius 10 m and a center 12 m above the ground, so a rider's height is h(t) = 12 + 10 sin(t) with t in radians. Help a precalculus student see one period from t = 0 to 2π, that the low point is 2 m and the high point is 22 m, and that it starts at the center height going up.",
    },
    {
      id: "coord-blank-grid",
      expectedTypes: ["coordinate_plot"],
      expectedLayout: "single",
      goal:
        "Give a 6th grader a blank coordinate grid from -5 to 5 on both axes so they can plot homework points themselves. Do not draw the points. The takeaway is that they have an empty plane ready for (2, 3), (-4, 1), and (0, -2).",
    },
    {
      id: "coord-phone-plans",
      expectedTypes: ["coordinate_plot"],
      expectedLayout: "single",
      goal:
        "Two phone plans: Plan A is y = 20 + 5x and Plan B is y = 10x, where x is extra gigabytes and y is dollars. Help a student see they meet at (4, 40), that B is cheaper below 4 GB and A is cheaper after. Plot both lines on the same plane and mark the intersection.",
    },
    {
      id: "coord-garden-circle",
      expectedTypes: ["coordinate_plot"],
      expectedLayout: "single",
      goal:
        "A circular garden is centered at the origin with radius 4 m. A straight path runs along the line y = x. Help a geometry student see the circle and the path on the coordinate plane, and mark the two intersection points near (2.83, 2.83) and (-2.83, -2.83).",
    },
  ],

  geometry: [
    {
      id: "geo-roof-height",
      expectedTypes: ["geometry"],
      expectedLayout: "single",
      goal:
        "A carpentry class is looking at a triangular gable. The base is 6 m across and the peak is 3 m above the base, but they should not see those measurements as numbers on the drawing. Show triangle ABC with base BC and a dashed perpendicular from A to BC, mark the right angle at the foot, and label the base b and the height h.",
    },
    {
      id: "geo-similar-shadow",
      expectedTypes: ["geometry"],
      expectedLayout: "single",
      goal:
        "A student is finding a tree's height with similar triangles. A 1.5 m meter stick casts a 2 m shadow; the tree casts a 10 m shadow at the same time. Draw the two right triangles sharing the sun-ray angle, label the known lengths, and help them see the triangles are similar so 1.5/2 = h/10.",
    },
    {
      id: "geo-parallel-streets",
      expectedTypes: ["geometry"],
      expectedLayout: "single",
      goal:
        "Two parallel streets are cut by a diagonal avenue. Help a geometry student see corresponding and alternate interior angles. Draw two parallel lines cut by a transversal, mark a pair of alternate interior angles as equal, and mark a pair of corresponding angles as equal. Do not invent degree measures that were not given.",
    },
    {
      id: "geo-pizza-tangent",
      expectedTypes: ["geometry"],
      expectedLayout: "single",
      goal:
        "A pizza is a circle of radius 3. A knife resting against the crust is tangent at point A. Help a student see that a radius to the point of tangency is perpendicular to the tangent. Draw circle center O, radius OA, a tangent line at A, and a right-angle mark at A.",
    },
    {
      id: "geo-kite-angles",
      expectedTypes: ["geometry"],
      expectedLayout: "single",
      goal:
        "A playground kite is a rhombus-like kite with two pairs of adjacent equal sides. Show kite ABCD with AC as the symmetry diagonal, mark the equal sides, and mark that the diagonal AC is a perpendicular bisector of BD. Vertex names only; no invented side lengths.",
    },
    {
      id: "geo-perp-bisector",
      expectedTypes: ["geometry"],
      expectedLayout: "single",
      goal:
        "Show the classic compass construction of the perpendicular bisector of a segment. Segment AB is given. Draw two circles of equal radius, each centered at an endpoint and large enough to cross twice. Mark the two intersections and the line through them, and show that it meets AB at its midpoint at a right angle.",
    },
  ],

  freeform: [
    {
      id: "free-water-cycle",
      expectedTypes: ["freeform"],
      expectedLayout: "single",
      goal:
        "A 4th-grade science class needs a simple water-cycle diagram: ocean, cloud, rain, and groundwater. Help them see water moving ocean → cloud (evaporation), cloud → rain (precipitation), rain → ocean or groundwater (collection), and groundwater back toward the ocean. Keep labels short. This is a schematic, not a realistic landscape.",
    },
    {
      id: "free-message-passing",
      expectedTypes: ["freeform"],
      expectedLayout: "single",
      goal:
        "An intro CS student is stuck on how a chat message gets from their phone to a friend's. Show Phone A, a server in the middle, and Phone B, with arrows A → server → B. They should take away that the phones do not talk directly; the server relays the message.",
    },
    {
      id: "free-passing-play",
      expectedTypes: ["freeform"],
      expectedLayout: "single",
      goal:
        "A youth soccer coach wants a 2-on-1 schematic: two attackers and one defender on a simplified pitch. The passer on the left sends the ball ahead to a teammate, while one defender sits closer to goal. Use O for attackers and X for the defender. This is an illustrative play, not a real match diagram.",
    },
    {
      id: "free-photosynthesis",
      expectedTypes: ["freeform"],
      expectedLayout: "single",
      goal:
        "Help a 5th grader see photosynthesis as inputs and an output around a leaf: sunlight, water, and carbon dioxide go in; sugar and oxygen come out. Boxes or ovals for the leaf and the five labels, with arrows showing in vs out. No chemical formulas required.",
    },
    {
      id: "free-plot-mountain",
      expectedTypes: ["freeform"],
      expectedLayout: "single",
      goal:
        "An ELA class is mapping story structure: exposition, rising action, climax, falling action, resolution. Help them see the rise to a peak at the climax and the fall afterward, with those five labels in order along the shape.",
    },
    {
      id: "free-reflex-arc",
      expectedTypes: ["freeform"],
      expectedLayout: "single",
      goal:
        "A biology student needs the path of a knee-jerk reflex: receptor in the knee, sensory neuron to the spinal cord, motor neuron back to the thigh muscle. Show those three stations in order with arrows. Emphasize that the signal turns around in the spinal cord, not the brain.",
    },
    {
      id: "free-wifi-home",
      expectedTypes: ["freeform"],
      expectedLayout: "single",
      goal:
        "A family is arguing about whose device is slowing the wifi. Draw a simple home network: a router in the center connected to a laptop, a phone, a TV, and a game console. They should see that every device shares the same router, not that one device is 'the internet'.",
    },
  ],

  mixed: [
    {
      id: "mix-triangle-area",
      expectedTypes: ["geometry", "math_expressions"],
      expectedLayout: "split",
      goal:
        "A student knows the formula for a triangle's area but cannot picture the height. On one side, show a triangle with base 10 cm and a dashed perpendicular height of 6 cm, with the right angle marked. Beside it, show A = (1/2)bh, then (1/2)(10)(6) = 30. They should connect the drawn height to the h in the formula. Units are centimeters; area is 30 cm².",
    },
    {
      id: "mix-slope-steps",
      expectedTypes: ["coordinate_plot", "math_expressions"],
      expectedLayout: "stack",
      goal:
        "An Algebra 1 student can recite 'rise over run' but does not see it on a graph. Show y = 2x on a coordinate plane with a rise-2, run-1 triangle between x = 1 and x = 2. Below or beside it, write m = Δy/Δx = 2/1 = 2. The takeaway is that the 2 in y = 2x is that slope.",
    },
    {
      id: "mix-budget-cut",
      expectedTypes: ["pie_chart", "math_expressions"],
      expectedLayout: "split",
      goal:
        "A teen spends a $50 weekly budget: $20 food, $15 transit, $10 fun, $5 savings. They want to cut fun in half and move that $5 into savings. Show how the current $50 is split, and next to it the arithmetic that fun becomes $5 and savings becomes $10. They should see the whole is still $50.",
    },
    {
      id: "mix-projectile",
      expectedTypes: ["coordinate_plot", "math_expressions"],
      expectedLayout: "stack",
      goal:
        "A physics student launched a model rocket. Height in meters is h(t) = -5t^2 + 20t, with t in seconds. Help them see the parabola from t = 0 to t = 4, landing back at 0, with the max around t = 2, h = 20. Also show the algebra that sets -5t^2 + 20t = 0, factors 5t(-t + 4) = 0, and gets t = 0 or t = 4. Do not invent extra data.",
    },
    {
      id: "mix-sales-vs-share",
      expectedTypes: ["xy_chart", "pie_chart"],
      expectedLayout: "split",
      goal:
        "A school store sold 40 items on Friday: 18 pencils, 12 erasers, 10 notebooks. Help a student see two views of the same facts: how the counts compare as quantities, and how they share the 40-item total. They should notice pencils are the most in both views, and that pencils are a bit under half the sales.",
    },
  ],
} as const satisfies Record<string, readonly WhiteboardPromptCase[]>;

export const ALL_WHITEBOARD_PROMPTS: WhiteboardPromptCase[] = Object.values(
  WHITEBOARD_PROMPT_BANK,
).flat();
