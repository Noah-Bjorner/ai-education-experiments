import type { SwedishCourseLookupResult } from "./schema.ts";

export interface SwedishCourseLookupEvalCase {
  id: string;
  prompt: string;
  reference: SwedishCourseLookupResult;
  judgeNotes?: string;
}

export const swedishCourseLookupEvalCases: SwedishCourseLookupEvalCase[] = [
  {
    id: "matte-2b-gy25",
    prompt: "matte 2b",
    reference: {
      title: "Matematik nivå 2b",
      subject: "Matematik",
      topics: [
        "Aritmetik, algebra och funktioner",
        "Statistik",
        "Logik och geometri",
        "Digitala verktyg",
        "Problemlösning och tillämpningsområden",
      ],
      grading_guidelines:
        "**E** Eleven kan med viss säkerhet använda begrepp, metoder och modeller för att lösa matematiska problem.\n\n**C** Eleven kan med god säkerhet använda begrepp, metoder och modeller för att lösa matematiska problem.\n\n**A** Eleven kan med mycket god säkerhet använda begrepp, metoder och modeller för att lösa matematiska problem.",
      language: "sv",
    },
    judgeNotes:
      "Must use current Gy25 'nivå 2b' naming (not older Gy11 'Matematik 2b'). Topics must be the exact official top-level central content headings from Skolverket, sometimes 'Digitala verktyg' is missing from the topics and that's okay. Grading guidelines should preserve E/C/A structure if present in the source.",
  },
  {
    id: "historia-1b-gy25",
    prompt: "historia 1b",
    reference: {
      title: "Historia nivå 1b",
      subject: "Historia",
      topics: [
        "Historiskt innehåll",
        "Historiska begrepp, källor och historiebruk",
      ],
      grading_guidelines:
        "### Betyget E\nEleven visar **godtagbara** kunskaper om förändringsprocesser, händelser och aktörer under olika tidsperioder utifrån olika tolkningar och perspektiv. Eleven ger exempel på och förklarar **översiktligt** samband mellan skeenden i det förflutna och förhållanden i nutiden.\n\nEleven för **enkla** resonemang om det historiska innehållet utifrån historiska begrepp och förklaringsmodeller.\n\nEleven formulerar frågor om det historiska innehållet och använder olika historiska källor för att undersöka historiska frågeställningar samt för **enkla** resonemang om källornas innehåll och användbarhet utifrån historisk metod.\n\nEleven för **enkla** resonemang om hur historia kan användas i olika sammanhang och för olika syften.\n\n### Betyget D\nElevens kunskaper bedöms sammantaget vara mellan C och E.\n\n### Betyget C\nEleven visar **goda** kunskaper om förändringsprocesser, händelser och aktörer under olika tidsperioder utifrån olika tolkningar och perspektiv. Eleven ger exempel på och förklarar **utförligt** samband mellan skeenden i det förflutna och förhållanden i nutiden.\n\nEleven för **utvecklade** resonemang om det historiska innehållet utifrån historiska begrepp och teorier.\n\nEleven formulerar **välgrundade** frågor om det historiska innehållet och använder olika historiska källor för att undersöka historiska frågeställningar samt för **välgrundade** resonemang om olika historiska källors innehåll och användbarhet utifrån historisk metod.\n\nEleven för **utvecklade** resonemang om hur historia kan användas i olika sammanhang och för olika syften.\n\n### Betyget B\nElevens kunskaper bedöms sammantaget vara mellan A och C.\n\n### Betyget A\nEleven visar **mycket goda** kunskaper om förändringsprocesser, händelser och aktörer under olika tidsperioder utifrån olika tolkningar och perspektiv. Eleven ger exempel på och förklarar **utförligt och nyanserat** samband mellan skeenden i det förflutna och förhållanden i nutiden.\n\nEleven för **utvecklade och nyanserade** resonemang om det historiska innehållet utifrån historiska begrepp och teorier.\n\nEleven formulerar **välgrundade och nyanserade** frågor om det historiska innehållet och använder olika historiska källor för att undersöka historiska frågeställningar samt för **välgrundade och nyanserade** resonemang om källornas innehåll och användbarhet utifrån historisk metod.\n\nEleven för **utvecklade och nyanserade** resonemang om hur historia kan användas i olika sammanhang och för olika syften.",
      language: "sv",
    },
    judgeNotes:
      "TODO manual review. Should map to Gy25 'Historia nivå 1b'. Verify the two top-level central content headings against the official Skolverket ämnesplan and that betygskriterier preserve E/D/C/B/A structure.",
  },
  {
    id: "engelska-6-gy25",
    prompt: "engelska 6",
    reference: {
      title: "Engelska nivå 2",
      subject: "Engelska",
      topics: [
        "Kommunikationens innehåll",
        "Reception",
        "Produktion och interaktion",
      ],
      grading_guidelines:
        "### Betyget E\nEleven lyssnar samt förstår och tolkar **huvudsakligt innehåll och tydliga detaljer** i talat språk i olika sammanhang. Eleven läser samt förstår och tolkar **huvudsakligt innehåll och tydliga detaljer** i texter av olika slag. Eleven väljer med källkritisk medvetenhet innehåll från muntliga och skriftliga källor av olika slag och använder på ett **relevant** sätt det valda materialet i sin egen produktion och interaktion.\n\nI muntliga framställningar av olika slag uttrycker sig eleven med **viss språklig säkerhet** och **till viss del anpassat** till syfte, mottagare och sammanhang. I skriftliga framställningar av olika slag uttrycker sig eleven med **viss språklig säkerhet** och **till viss del anpassat** till syfte, mottagare och sammanhang.\n\nI interaktion i olika sammanhang uttrycker sig eleven med **viss språklig säkerhet** och **till viss del anpassat** till syfte, mottagare och sammanhang. Eleven använder dessutom strategier som **i viss utsträckning underlättar och förbättrar** interaktionen.\n\nEleven diskuterar på ett **översiktligt** sätt, på engelska, förhållanden i olika sammanhang och områden där språket används, även utifrån egna erfarenheter eller kunskaper.\n\n### Betyget D\nElevens kunskaper bedöms sammantaget vara mellan C och E.\n\n### Betyget C\nEleven lyssnar samt förstår och tolkar **på ett välgrundat sätt huvudsakligt innehåll och väsentliga detaljer** i talat språk i olika sammanhang. Eleven läser samt förstår och tolkar **på ett välgrundat sätt huvudsakligt innehåll och väsentliga detaljer** i texter av olika slag. Eleven väljer med källkritisk medvetenhet innehåll från muntliga och skriftliga källor av olika slag och använder på ett **relevant och effektivt** sätt det valda materialet i sin egen produktion och interaktion.\n\nI muntliga framställningar av olika slag uttrycker sig eleven med **språklig säkerhet** och **i huvudsak anpassat** till syfte, mottagare och sammanhang. I skriftliga framställningar av olika slag uttrycker sig eleven med **språklig säkerhet** och **i huvudsak anpassat** till syfte, mottagare och sammanhang.\n\nI interaktion i olika sammanhang uttrycker sig eleven med **språklig säkerhet** och **i huvudsak anpassat** till syfte, mottagare och sammanhang. Eleven använder dessutom strategier som **underlättar och förbättrar** interaktionen.\n\nEleven diskuterar på ett **utvecklat** sätt, på engelska, förhållanden i olika sammanhang och områden där språket används, även utifrån egna erfarenheter eller kunskaper.\n\n### Betyget B\nElevens kunskaper bedöms sammantaget vara mellan A och C.\n\n### Betyget A\nEleven lyssnar samt förstår och tolkar **på ett välgrundat och nyanserat sätt såväl helhet som detaljer** i talat språk i olika sammanhang. Eleven läser samt förstår och tolkar **på ett välgrundat och nyanserat sätt såväl helhet som detaljer** i texter av olika slag. Eleven väljer med källkritisk medvetenhet innehåll från muntliga och skriftliga källor av olika slag och använder på ett **relevant, effektivt och problematiserande** sätt det valda materialet i sin egen produktion och interaktion.\n\nI muntliga framställningar av olika slag uttrycker sig eleven med **god språklig säkerhet** och **anpassat** till syfte, mottagare och sammanhang. I skriftliga framställningar av olika slag uttrycker sig eleven med **god språklig säkerhet** och **anpassat** till syfte, mottagare och sammanhang.\n\nI interaktion i olika sammanhang uttrycker sig eleven med **god språklig säkerhet** och **anpassat** till syfte, mottagare och sammanhang. Eleven använder dessutom strategier som **underlättar och förbättrar** interaktionen **och för den framåt på ett konstruktivt sätt**.\n\nEleven diskuterar på ett **välutvecklat** sätt, på engelska, förhållanden i olika sammanhang och områden där språket används, även utifrån egna erfarenheter eller kunskaper.",
        language: "sv",
    },
    judgeNotes:
      "TODO manual review. The agent mapped Gy11 'Engelska 6' to Gy25 'Engelska nivå 2' — verify this mapping is correct (or whether the title should remain 'Engelska 6'). Language 'sv' is correct (instruction language is Swedish even though the subject is English).",
  },
  {
    id: "biologi-1-gy25",
    prompt: "biologi 1",
    reference: {
      title: "Biologi nivå 1",
      subject: "Biologi",
      topics: [
        "Ekologi och evolution",
        "Cellbiologi och genetik",
        "Biologin i omvärlden",
        "Biologins arbetsmetoder",
      ],
      grading_guidelines:
        "## Betyget E\n\nEleven visar godtagbara kunskaper om biologins begrepp, modeller och teorier och ger enkla förklaringar av biologiska samband.\n\nEleven gör enkla analyser av biologiska frågeställningar och samband. Dessutom kommunicerar eleven i frågor som rör biologi med godtagbar naturvetenskaplig underbyggnad och med användning av ämnesspecifika begrepp och uttrycksformer.\n\nEleven planerar och genomför naturvetenskapliga undersökningar på ett riskmedvetet och i huvudsak systematiskt sätt. Eleven redovisar sina undersökningar och för enkla resonemang om metod och resultat.\n\nEleven för enkla resonemang om biologin som vetenskap och dess betydelse för människors levnadsvillkor och samhällsutvecklingen.\n\n## Betyget D\n\nElevens kunskaper bedöms sammantaget vara mellan C och E.\n\n## Betyget C\n\nEleven visar goda kunskaper om biologins begrepp, modeller och teorier och ger utvecklade förklaringar av biologiska samband.\n\nEleven gör utvecklade analyser av biologiska frågeställningar och samband. Dessutom kommunicerar eleven i frågor som rör biologi med god naturvetenskaplig underbyggnad och med användning av ämnesspecifika begrepp och uttrycksformer.\n\nEleven planerar och genomför naturvetenskapliga undersökningar på ett riskmedvetet och systematiskt sätt. Eleven redovisar sina undersökningar och för utvecklade resonemang om metod och resultat.\n\nEleven för utvecklade resonemang om biologin som vetenskap och dess betydelse för människors levnadsvillkor och samhällsutvecklingen.\n\n## Betyget B\n\nElevens kunskaper bedöms sammantaget vara mellan A och C.\n\n## Betyget A\n\nEleven visar mycket goda kunskaper om biologins begrepp, modeller och teorier och ger välutvecklade förklaringar av biologiska samband.\n\nEleven gör välutvecklade analyser av biologiska frågeställningar och samband. Dessutom kommunicerar eleven i frågor som rör biologi med mycket god naturvetenskaplig underbyggnad och med användning av ämnesspecifika begrepp och uttrycksformer.\n\nEleven planerar och genomför naturvetenskapliga undersökningar på ett riskmedvetet, systematiskt och ändamålsenligt sätt. Eleven redovisar sina undersökningar och för välutvecklade resonemang om metod och resultat.\n\nEleven för välutvecklade resonemang om biologin som vetenskap och dess betydelse för människors levnadsvillkor och samhällsutvecklingen.",
      language: "sv",
    },
    judgeNotes:
      "TODO manual review. Should map to Gy25 'Biologi nivå 1'. Verify topics against the official Skolverket Gy25 ämnesplan/nivå.",
  },
  {
    id: "svenska-ak-6",
    prompt: "svenska åk 6",
    reference: {
      title: "Svenska årskurs 6",
      subject: "Svenska",
      topics: [
        "Läsa och skriva",
        "Tala, lyssna och samtala",
        "Texter",
        "Språkbruk",
        "Informationssökning och källkritik",
      ],
      grading_guidelines:
        "### Betygskriterier för betyget E i slutet av årskurs 6\n\nEleven samtalar om bekanta ämnen på ett sätt som **till viss del** upprätthåller samtalen. Dessutom förbereder och genomför eleven muntliga framställningar med **i huvudsak fungerande** inledning, innehåll och avslutning och **viss** anpassning till syfte och mottagare.\n\nEleven skriver olika slags texter med **begripligt** innehåll, **i huvudsak fungerande** struktur och **viss** språklig variation. Eleven följer grundläggande regler för språkriktighet med **viss** säkerhet.\n\nEleven läser skönlitteratur och sakprosatexter för barn och ungdomar med **flyt** och visar **grundläggande** läsförståelse. Dessutom sammanfattar eleven olika texter med **viss** säkerhet. Eleven för också **enkla** resonemang om tydligt framträdande budskap i olika texter.\n\nEleven söker och väljer med **viss** säkerhet information från ett avgränsat urval av källor och presenterar informationen med egna formuleringar och ämnesspecifika ord och begrepp. Eleven för **enkla** resonemang om informationens användbarhet.\n\n### Betygskriterier för betyget D i slutet av årskurs 6\n\nElevens kunskaper bedöms sammantaget vara mellan C och E.\n\n### Betygskriterier för betyget C i slutet av årskurs 6\n\nEleven samtalar om bekanta ämnen på ett sätt som upprätthåller samtalen **relativt väl**. Dessutom förbereder och genomför eleven muntliga framställningar med **fungerande** inledning, innehåll och avslutning och **relativt god** anpassning till syfte och mottagare.\n\nEleven skriver olika slags texter med **relativt tydligt** innehåll, **fungerande** struktur och **relativt god** språklig variation. Eleven följer grundläggande regler för språkriktighet med **relativt god** säkerhet.\n\nEleven läser skönlitteratur och sakprosatexter för barn och ungdomar med **gott flyt** och visar **god** läsförståelse. Dessutom sammanfattar eleven olika texter med **relativt god** säkerhet. Eleven för också **utvecklade** resonemang om tydligt framträdande budskap i olika texter.\n\nEleven söker och väljer med **relativt god** säkerhet information från ett avgränsat urval av källor och presenterar informationen med egna formuleringar och ämnesspecifika ord och begrepp. Eleven för **utvecklade** resonemang om informationens användbarhet.\n\n### Betygskriterier för betyget B i slutet av årskurs 6\n\nElevens kunskaper bedöms sammantaget vara mellan A och C.\n\n### Betygskriterier för betyget A i slutet av årskurs 6\n\nEleven samtalar om bekanta ämnen på ett sätt som upprätthåller samtalen **väl**. Dessutom förbereder och genomför eleven muntliga framställningar med **väl fungerande** inledning, innehåll och avslutning och **god** anpassning till syfte och mottagare.\n\nEleven skriver olika slags texter med **tydligt** innehåll, **väl fungerande** struktur och **god** språklig variation. Eleven följer grundläggande regler för språkriktighet med **god** säkerhet.\n\nEleven läser skönlitteratur och sakprosatexter för barn och ungdomar med **mycket gott flyt** och visar **mycket god** läsförståelse. Dessutom sammanfattar eleven olika texter med **god** säkerhet. Eleven för också **välutvecklade** resonemang om tydligt framträdande budskap i olika texter.\n\nEleven söker och väljer med **god** säkerhet information från ett avgränsat urval av källor och presenterar informationen med egna formuleringar och ämnesspecifika ord och begrepp. Eleven för **välutvecklade** resonemang om informationens användbarhet.",
      language: "sv",
    },
    judgeNotes:
      "TODO manual review. Compulsory school: title keeps single-grade 'årskurs 6'. Topics should be the official kursplan central-content headings for the 4–6 range. Betygskriterier should be those that apply at the end of year 6.",
  },
  {
    id: "fysik-2-gy25",
    prompt: "fysik 2",
    reference: {
      title: "Fysik nivå 2",
      subject: "Fysik",
      topics: [
        "Krafter och rörelse",
        "Energi, energiresurser och elektromagnetism",
        "Universum, materien och strålning",
        "Fysiken i omvärlden",
        "Fysikens arbetsmetoder",
      ],
      grading_guidelines:
        "### Betyget E\n\nEleven visar **godtagbara** kunskaper om fysikens lagar, begrepp, modeller och teorier och ger **enkla** förklaringar av fysikaliska samband.\n\nEleven analyserar och löser **enkla** fysikaliska problem. Dessutom kommunicerar eleven i frågor som rör fysik med **godtagbar** naturvetenskaplig underbyggnad och med användning av ämnesspecifika begrepp och uttrycksformer.\n\nEleven planerar och genomför naturvetenskapliga undersökningar på ett riskmedvetet och **i huvudsak systematiskt** sätt. Eleven redovisar sina undersökningar och för **enkla** resonemang om metod och resultat.\n\nEleven för **enkla** resonemang om fysiken som vetenskap och dess betydelse för människors levnadsvillkor och samhällsutvecklingen.\n\n### Betyget D\n\nElevens kunskaper bedöms sammantaget vara mellan C och E.\n\n### Betyget C\n\nEleven visar **goda** kunskaper om fysikens lagar, begrepp, modeller och teorier och ger **utvecklade** förklaringar av fysikaliska samband.\n\nEleven analyserar och löser **relativt komplexa** fysikaliska problem. Dessutom kommunicerar eleven i frågor som rör fysik med **god** naturvetenskaplig underbyggnad och med användning av ämnesspecifika begrepp och uttrycksformer.\n\nEleven planerar och genomför naturvetenskapliga undersökningar på ett riskmedvetet och **systematiskt** sätt. Eleven redovisar sina undersökningar och för **utvecklade** resonemang om metod och resultat.\n\nEleven för **utvecklade** resonemang om fysiken som vetenskap och dess betydelse för människors levnadsvillkor och samhällsutvecklingen.\n\n### Betyget B\n\nElevens kunskaper bedöms sammantaget vara mellan A och C.\n\n### Betyget A\n\nEleven visar **mycket goda** kunskaper om fysikens lagar, begrepp, modeller och teorier och ger **välutvecklade** förklaringar av fysikaliska samband.\n\nEleven analyserar och löser **komplexa** fysikaliska problem. Dessutom kommunicerar eleven i frågor som rör fysik med **mycket god** naturvetenskaplig underbyggnad och med användning av ämnesspecifika begrepp och uttrycksformer.\n\nEleven planerar och genomför naturvetenskapliga undersökningar på ett riskmedvetet, **systematiskt och ändamålsenligt** sätt. Eleven redovisar sina undersökningar och för **välutvecklade** resonemang om metod och resultat.\n\nEleven för **välutvecklade** resonemang om fysiken som vetenskap och dess betydelse för människors levnadsvillkor och samhällsutvecklingen.",
      language: "sv",
    },
    judgeNotes:
      "TODO manual review. Should map to Gy25 'Fysik nivå 2'. Verify the five topic headings against the official Skolverket Gy25 ämnesplan.",
  },
  {
    id: "samhallskunskap-1a1-gy25",
    prompt: "samhällskunskap 1a1",
    reference: {
      title: "Samhällskunskap nivå 1a1",
      subject: "Samhällskunskap",
      topics: [
        "Inflytande och beslutsfattande",
        "Ekonomi och resursfördelning",
        "Individer, grupper och sociala strukturer",
        "Samhällsvetenskapliga perspektiv och arbetsmetoder",
      ],
      grading_guidelines:
        "### Betyget E\nEleven visar **godtagbara** kunskaper om samhällens organisation och institutioner, beslutsprocesser på olika nivåer samt om demokratiska värden och mänskliga rättigheter.\n\nEleven visar **godtagbara** kunskaper om politiska, ekonomiska och sociala frågor samt för **enkla** resonemang om hur sådana frågor påverkar och påverkas av individer, grupper och samhällsstrukturer.\n\nEleven analyserar och diskuterar samhällsfrågor med **godtagbar** samhällsvetenskaplig underbyggnad.\n\nEleven använder samhällsvetenskapliga metoder för att hantera information som rör samhällsfrågor och drar **enkla** slutsatser om olika källors trovärdighet och användbarhet.\n\n### Betyget D\nElevens kunskaper bedöms sammantaget vara mellan C och E.\n\n### Betyget C\nEleven visar **goda** kunskaper om samhällens organisation och institutioner, beslutsprocesser på olika nivåer samt om demokratiska värden och mänskliga rättigheter.\n\nEleven visar **goda** kunskaper om politiska, ekonomiska och sociala frågor samt för **utvecklade** resonemang om hur sådana frågor påverkar och påverkas av individer, grupper och samhällsstrukturer.\n\nEleven analyserar och diskuterar samhällsfrågor med **god** samhällsvetenskaplig underbyggnad.\n\nEleven använder samhällsvetenskapliga metoder för att hantera information som rör samhällsfrågor och drar **utvecklade** slutsatser om olika källors trovärdighet och användbarhet.\n\n### Betyget B\nElevens kunskaper bedöms sammantaget vara mellan A och C.\n\n### Betyget A\nEleven visar **mycket goda** kunskaper om samhällens organisation och institutioner, beslutsprocesser på olika nivåer samt om demokratiska värden och mänskliga rättigheter.\n\nEleven visar **mycket goda** kunskaper om politiska, ekonomiska och sociala frågor samt för **välutvecklade** resonemang om hur sådana frågor påverkar och påverkas av individer, grupper och samhällsstrukturer.\n\nEleven analyserar och diskuterar samhällsfrågor med **mycket god** samhällsvetenskaplig underbyggnad.\n\nEleven använder samhällsvetenskapliga metoder för att hantera information som rör samhällsfrågor och drar **välutvecklade** slutsatser om olika källors trovärdighet och användbarhet.",
      language: "sv",
    },
    judgeNotes:
      "TODO manual review. Should map to Gy25 'Samhällskunskap nivå 1a1' (the smaller half-course variant). Verify topics are scoped to the 1a1 level (not the broader 1a2/1b content).",
  },
  {
    id: "kemi-ak-9",
    prompt: "kemi åk 9",
    reference: {
      title: "Kemi årskurs 9",
      subject: "Kemi",
      topics: [
        "Kemin i naturen, i samhället och i människokroppen",
        "Systematiska undersökningar och granskning av information",
      ],
      grading_guidelines:
        "### Betygskriterier för slutet av årskurs 9\n\n#### Betygskriterier för betyget E i slutet av årskurs 9\nEleven visar **grundläggande** kunskaper om kemins begrepp och förklaringsmodeller. Med **viss** användning av begreppen och förklaringsmodellerna beskriver och förklarar eleven kemiska samband i naturen, i samhället och i människokroppen.\n\nI frågor som rör miljö och hälsa för eleven resonemang samt framför och bemöter argument med **viss** naturvetenskaplig underbyggnad. Eleven söker information som rör kemi och använder då olika källor och för **enkla** resonemang om informationens och källornas trovärdighet och relevans.\n\nEleven söker svar på frågor genom att planera och utföra systematiska undersökningar på ett säkert och **i huvudsak fungerande** sätt. Eleven värderar undersökningarna genom att föra **enkla** resonemang utifrån frågeställningarna.\n\n#### Betygskriterier för betyget D i slutet av årskurs 9\nElevens kunskaper bedöms sammantaget vara mellan C och E.\n\n#### Betygskriterier för betyget C i slutet av årskurs 9\nEleven visar **goda** kunskaper om kemins begrepp och förklaringsmodeller. Med **relativt god** användning av begreppen och förklaringsmodellerna beskriver och förklarar eleven kemiska samband i naturen, i samhället och i människokroppen.\n\nI frågor som rör miljö och hälsa för eleven resonemang samt framför och bemöter argument med **relativt god** naturvetenskaplig underbyggnad. Eleven söker information som rör kemi och använder då olika källor och för **utvecklade** resonemang om informationens och källornas trovärdighet och relevans.\n\nEleven söker svar på frågor genom att planera och utföra systematiska undersökningar på ett säkert och **fungerande** sätt. Eleven värderar undersökningarna genom att föra **utvecklade** resonemang utifrån frågeställningarna.\n\n#### Betygskriterier för betyget B i slutet av årskurs 9\nElevens kunskaper bedöms sammantaget vara mellan A och C.\n\n#### Betygskriterier för betyget A i slutet av årskurs 9\nEleven visar **mycket goda** kunskaper om kemins begrepp och förklaringsmodeller. Med **god** användning av begreppen och förklaringsmodellerna beskriver och förklarar eleven kemiska samband i naturen, i samhället och i människokroppen.\n\nI frågor som rör miljö och hälsa för eleven resonemang samt framför och bemöter argument med **god** naturvetenskaplig underbyggnad. Eleven söker information som rör kemi och använder då olika källor och för **välutvecklade** resonemang om informationens och källornas trovärdighet och relevans.\n\nEleven söker svar på frågor genom att planera och utföra systematiska undersökningar på ett säkert och **väl fungerande** sätt. Eleven värderar undersökningarna genom att föra **välutvecklade** resonemang utifrån frågeställningarna.",
      language: "sv",
    },
    judgeNotes:
      "TODO manual review. Compulsory school: keep single-grade 'årskurs 9' in title; central content should map to the official 7–9 kursplan range. Verify the two topic headings are the official top-level kursplan headings.",
  },
  {
    id: "religion-1-gy25",
    prompt: "religion 1",
    reference: {
      title: "Religionskunskap nivå 1",
      subject: "Religionskunskap",
      topics: [
        "Tolkningar och varierande praktiker inom kristendom samt islam, judendom, hinduism och buddhism, i Sverige och i omvärlden, med betoning på samtida förhållanden. Kännetecken för dessa religioner samt jämförande perspektiv inom och mellan religioner och andra livsåskådningar, till exempel på människosyn och gudsuppfattningar.",
        "Hur individers och gruppers identitet kan formas i förhållande till religion och livsåskådning. Rätten till religionsfrihet.",
        "Hur religion och livsåskådning kan påverka och påverkas av förhållanden och skeenden i samhället. Frågor om religion och vetenskap i förhållande till olika sätt att förstå världen samt frågor om religion i relation till kön och sexualitet.",
        "Analys av och reflektion över etiska och existentiella frågor utifrån religioner och andra livsåskådningar samt utifrån relevanta begrepp och modeller. Etiska och moraliska föreställningar om vad ett gott liv och ett gott samhälle kan vara.",
      ],
      grading_guidelines:
        "### Betyget E\nEleven visar **godtagbara** kunskaper om religioner och andra livsåskådningar. Eleven för **enkla** resonemang om varierande tolkningar och praktiker inom och mellan olika religioner och andra livsåskådningar.\n\nEleven för **enkla** resonemang om hur människors identitet kan formas i relation till religion och livsåskådning.\n\nEleven för **enkla** resonemang om frågor som rör relationen mellan religion och samhälle.\n\nEleven gör **enkla** analyser av och reflektioner över etiska och existentiella frågor.\n\n### Betyget C\nEleven visar **goda** kunskaper om religioner och andra livsåskådningar. Eleven för **utvecklade** resonemang om varierande tolkningar och praktiker inom och mellan olika religioner och andra livsåskådningar.\n\nEleven för **utvecklade** resonemang om hur människors identitet kan formas i relation till religion och livsåskådning.\n\nEleven för **utvecklade** resonemang om frågor som rör relationen mellan religion och samhälle.\n\nEleven gör **utvecklade** analyser av och reflektioner över etiska och existentiella frågor.\n\n### Betyget A\nEleven visar **mycket goda** kunskaper om religioner och andra livsåskådningar. Eleven för **utvecklade och nyanserade** resonemang om varierande tolkningar och praktiker inom och mellan olika religioner och andra livsåskådningar.\n\nEleven för **utvecklade och nyanserade** resonemang om hur människors identitet kan formas i relation till religion och livsåskådning.\n\nEleven för **utvecklade och nyanserade** resonemang om frågor som rör relationen mellan religion och samhälle.\n\nEleven gör **utvecklade och nyanserade** analyser av och reflektioner över etiska och existentiella frågor.",
      language: "sv",
    },
    judgeNotes:
      "TODO manual review. Topics here look like detailed bullets rather than top-level central-content headings — likely needs to be replaced with the actual heading wording from Skolverket's Gy25 Religionskunskap nivå 1 ämnesplan. Verify both title (Gy25 'Religionskunskap nivå 1') and topic granularity.",
  },
  {
    id: "matte-ak-3",
    prompt: "matte åk 3",
    reference: {
      title: "Matematik årskurs 3",
      subject: "Matematik",
      topics: [
        "Taluppfattning och tals användning",
        "Algebra",
        "Geometri",
        "Sannolikhet och statistik",
        "Samband och förändring",
        "Problemlösning",
      ],
      grading_guidelines:
        "### Kriterier för bedömning av godtagbara kunskaper i slutet av årskurs 3\n\nEleven visar grundläggande kunskaper om matematiska begrepp och använder dem med tillfredsställande säkerhet. Eleven ger även exempel på hur några begrepp relaterar till varandra. Eleven visar grundläggande kunskaper om naturliga tal och beskriver tals inbördes relation samt delar upp tal. Eleven visar grundläggande kunskaper om tal i bråkform och delar upp helheter i delar samt jämför och namnger delarna som enkla bråk. Eleven använder och beskriver geometriska mönster och mönster i talföljder. Dessutom använder eleven grundläggande geometriska begrepp och vanliga lägesord för att beskriva geometriska objekts egenskaper, läge och inbördes relationer. Eleven använder och ger exempel på enkla proportionella samband.\n\nEleven väljer och använder i huvudsak fungerande matematiska metoder för att göra enkla beräkningar med naturliga tal och lösa enkla rutinuppgifter med tillfredsställande säkerhet. Eleven använder huvudräkning för att genomföra beräkningar med de fyra räknesätten. Vid addition och subtraktion väljer och använder eleven skriftliga räknemetoder med tillfredsställande säkerhet. Eleven hanterar enkla matematiska likheter och använder då likhetstecknet på ett fungerande sätt. Eleven avbildar och, utifrån instruktioner, konstruerar enkla geometriska objekt. Eleven gör enkla mätningar, jämförelser och uppskattningar av längder, massor, volymer och tider och använder vanliga måttenheter. Vid olika undersökningar avläser och skapar eleven enkla tabeller och diagram för att sortera och redovisa resultat.\n\nEleven löser enkla problem genom att välja och använda någon strategi med viss anpassning till problemets karaktär. Eleven beskriver tillvägagångssätt och ger enkla omdömen om resultatens rimlighet.\n\nEleven för och följer matematiska resonemang genom att ställa och besvara frågor som i huvudsak hör till ämnet.\n\nEleven beskriver och samtalar om tillvägagångssätt på ett i huvudsak fungerande sätt och använder då konkret material, bilder, symboler och andra matematiska uttrycksformer.",
      language: "sv",
    },
    judgeNotes:
      "TODO manual review. Compulsory school year 3 has no E/C/A scale — only 'godtagbara kunskaper' kriterier. Verify topics match the official 1–3 kursplan central-content headings.",
  },
];
