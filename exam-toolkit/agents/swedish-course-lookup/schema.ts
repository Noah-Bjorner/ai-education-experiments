import { z } from "@zod";

export const SWEDISH_COURSE_SUBJECTS = [
  "Matematik",
  "Svenska",
  "Engelska",
  "Historia",
  "Naturkunskap",
  "Religionskunskap",
  "Samhällskunskap",
  "Biologi",
  "Fysik",
  "Kemi",
  "Psykologi",
  "Filosofi",
  "Geografi",
  "Franska",
  "Spanska",
  "Tyska",
  "Idrott och hälsa",
  "Teknik",
  "Bild",
  "Musik",
  "Slöjd",
  "Hem- och konsumentkunskap",
  "Ekonomi",
  "Juridik",
  "Företagsekonomi",
  "Programmering",
  "Medieproduktion",
  "Kommunikation",
] as const;

export const swedishCourseLookupResultSchema = z.object({
  title: z.string().trim().min(2).describe(
    "Canonical course title, for example 'Matematik nivå 2b' or 'Matematik årskurs 9'.",
  ),
  subject: z.enum(SWEDISH_COURSE_SUBJECTS).describe(
    "The canonical school subject the course belongs to.",
  ),
  topics: z.array(z.string().trim().min(1)).describe(
    "Official top-level central content headings from the current Gy25 ämnesplan/nivå or grundskola kursplan, or an empty array when no formal headings are available.",
  ),
  grading_guidelines: z.string().trim().min(1).describe(
    "Official grading criteria/betygskriterier for the course or grade level, formatted as markdown.",
  ),
  language: z.string().trim().length(2).toLowerCase().describe(
    "ISO 639-1 code for the primary language of instruction, for example 'sv' or 'en'.",
  ),
});

export type SwedishCourseLookupResult = z.infer<
  typeof swedishCourseLookupResultSchema
>;
