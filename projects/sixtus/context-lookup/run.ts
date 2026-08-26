import { generateContextLookup } from "./context.ts";
import type { ContextLookupRequest } from "./schema.ts";

const examples = {
  python: {
    term: "Python",
    context_message: "Python is a programming language.",
  },
  subsidiarity: {
    term: "principle of subsidiarity",
    context_message:
      "In EU law, the principle of subsidiarity limits Union action to cases where the objectives cannot be sufficiently achieved by the member states alone.",
  },
  occamsRazor: {
    term: "Occam's razor",
    context_message:
      "When two explanations fit the data equally well, Occam's razor says to prefer the simpler one.",
  },
  photosynthesis: {
    term: "photosynthesis",
    context_message:
      "Plants convert light energy into chemical energy through photosynthesis, producing glucose and releasing oxygen.",
  },
  magnaCarta: {
    term: "Magna Carta",
    context_message:
      "The Magna Carta of 1215 constrained the English king and later became a symbol of the idea that rulers are subject to law.",
  },
  gdp: {
    term: "GDP",
    context_message:
      "Economists often use GDP to compare the size of national economies, but it does not measure inequality or wellbeing.",
  },
  subsidiarityCatholic: {
    term: "principle of subsidiarity",
    context_message:
      "In Catholic social teaching, the principle of subsidiarity holds that higher authorities should not absorb functions that can be carried out by persons, families, or local communities.",
  },
  transubstantiation: {
    term: "transubstantiation",
    context_message:
      "The Council of Trent taught that in the Eucharist the substance of bread and wine is changed into the Body and Blood of Christ by transubstantiation.",
  },
  immaculateConception: {
    term: "Immaculate Conception",
    context_message:
      "Pius IX defined the Immaculate Conception as a dogma: Mary was preserved from original sin from the first moment of her conception.",
  },
  hypostaticUnion: {
    term: "hypostatic union",
    context_message:
      "Chalcedon confessed one person of Christ in two natures, the hypostatic union of divinity and humanity without confusion or division.",
  },
  magisterium: {
    term: "Magisterium",
    context_message:
      "Catholics hold that the Magisterium, the Church's teaching office, authentically interprets the deposit of faith in Scripture and Tradition.",
  },
  filioque: {
    term: "Filioque",
    context_message:
      "The Filioque clause in the Latin Creed states that the Holy Spirit proceeds from the Father and the Son, a major point of East–West controversy.",
  },
  exCathedra: {
    term: "ex cathedra",
    context_message:
      "Papal infallibility applies when the pope speaks ex cathedra, defining a doctrine of faith or morals to be held by the whole Church.",
  },
  theotokos: {
    term: "Theotokos",
    context_message:
      "Ephesus affirmed Mary as Theotokos, God-bearer, against those who would call her only Christotokos.",
  },
  originalSin: {
    term: "original sin",
    context_message:
      "Augustine and later Catholic teaching describe original sin as the fallen state inherited from Adam, healed in baptism though concupiscence remains.",
  },
  subsidiaritetSv: {
    term: "subsidiaritetsprincipen",
    context_message:
      "I katolsk sociallära innebär subsidiaritetsprincipen att högre instanser inte ska ta över uppgifter som personer, familjer eller lokalsamhällen kan sköta själva.",
  },
  dueDiligenceSvEn: {
    term: "due diligence",
    context_message:
      "Innan förvärvet gör köparen en due diligence för att granska bolagets avtal, skulder och risker.",
  },
  subsidiaritaetDe: {
    term: "Subsidiaritätsprinzip",
    context_message:
      "In der katholischen Soziallehre besagt das Subsidiaritätsprinzip, dass höhere Instanzen keine Aufgaben übernehmen sollen, die Personen, Familien oder lokale Gemeinschaften selbst erfüllen können.",
  },
  unbefleckteEmpfaengnisDe: {
    term: "Unbefleckte Empfängnis",
    context_message:
      "Pius IX. definierte die Unbefleckte Empfängnis als Dogma: Maria wurde vom ersten Augenblick ihrer Empfängnis an vor der Erbsünde bewahrt.",
  },
  subsidiariteFr: {
    term: "principe de subsidiarité",
    context_message:
      "Dans la doctrine sociale de l'Église, le principe de subsidiarité veut que les autorités supérieures n'absorbent pas les fonctions que les personnes, les familles ou les communautés locales peuvent exercer elles-mêmes.",
  },
  transsubstantiationFr: {
    term: "transsubstantiation",
    context_message:
      "Le concile de Trente enseigna que, dans l'Eucharistie, la substance du pain et du vin est changée au Corps et au Sang du Christ par la transsubstantiation.",
  },
} as const satisfies Record<string, ContextLookupRequest>;



if (import.meta.main) {
  const request = examples.dueDiligenceSvEn;
  const start = performance.now();
  const result = await generateContextLookup(request);
  const end = performance.now();
  console.log(JSON.stringify(result, null, 2));
  console.log(`Time taken in seconds: ${(end - start) / 1000}`);
}
