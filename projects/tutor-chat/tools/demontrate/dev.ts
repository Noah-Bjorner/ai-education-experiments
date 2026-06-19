import { createDemonstration } from "./index.ts";

const instruction = Deno.args.join(" ").trim() ||
  "Explain the multiple generations, long term effect on having an TFR(Total Fertility Rate) of 1.5 on total population by doing a graph showing how many children each generation will have.";

const start = performance.now();
const result = await createDemonstration({ instruction });
const end = performance.now();

console.log("Result:", JSON.stringify(result, null, 2));
console.log(`Time taken: ${((end - start) / 1000).toFixed(2)} seconds`);

/*
  Examples
  - Show how recursion works by visualizing the call stack for a factorial(3) calculation. First, show three stack frames piling up as the function calls itself down to the base case of factorial(1) = 1. Then, show the stack unwinding as values are returned back down the stack to compute the final result of 6.
  - Explain supply and demand curves by showing a graph with price on the vertical axis and quantity on the horizontal axis. Start with a downward-sloping demand curve and an upward-sloping supply curve, then highlight the equilibrium point where they intersect. Show what happens when demand increases by shifting the demand curve right, raising both equilibrium price and quantity.
  - Explain the offside rule in soccer by showing a simple field view with an attacker, defenders, the ball, and the goal. Pause at the moment the pass is made, draw a line through the second-to-last defender, and show that an attacker is offside if they are beyond that line and actively involved in the play. Contrast it with an onside example where the attacker stays level with or behind the defender when the pass is played.
  - Explain the three branches of government in the USA by showing three labeled pillars: Legislative, Executive, and Judicial. Show Congress making laws, the President enforcing laws, and the Supreme Court interpreting laws. Then animate arrows between the branches to show checks and balances, such as vetoes, judicial review, and congressional oversight.
  - Explain bell curve distributions by showing a normal distribution curve centered around the mean. Highlight that most values cluster near the center, fewer values appear toward the tails, and the curve is symmetric. Add bands for one, two, and three standard deviations to show how data becomes less common farther from the average.
  - Explain the multiple generations, long term effect on having an TFR(Total Fertility Rate) of 1.5 on total population by doing a graph showing how many children each generation will have.

  - Show the teritory held by Nazi Germany in the beginning of World War II and at the end.
  - Show the EUs expansion from inception to present day use blue to indicate the countries that joined.
  - Show the scandinavian countries on a map in the main color of their flag
  */
