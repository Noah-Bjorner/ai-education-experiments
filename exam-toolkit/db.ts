import { sql } from "../lib/neon.ts";


export interface CourseRecord {
  id: number;
  title: string;
  grading_guidelines: string;
  topics: string[];
  subject: string;
  language: string;
  created_at: string;
}

interface SaveCourseInput {
  title: string;
  grading_guidelines: string;
  topics: string[];
  subject: string;
  language: string;
}

export async function saveCourse(input: SaveCourseInput): Promise<CourseRecord> {
  const existingCourse = await findCourseByTitle(input.title);

  if (existingCourse) {
    const updatedRows = await sql`
      UPDATE courses
      SET
        grading_guidelines = ${input.grading_guidelines},
        topics = ${serializeTopics(input.topics)},
        subject = ${input.subject},
        language = ${input.language}
      WHERE id = ${existingCourse.id}
      RETURNING
        id,
        title,
        grading_guidelines,
        topics,
        subject,
        language,
        created_at
    `;

    return mapCourseRow(updatedRows[0]);
  }

  const insertedRows = await sql`
    INSERT INTO courses (
      title,
      grading_guidelines,
      topics,
      subject,
      language
    )
    VALUES (
      ${input.title},
      ${input.grading_guidelines},
      ${serializeTopics(input.topics)},
      ${input.subject},
      ${input.language}
    )
    RETURNING
      id,
      title,
      grading_guidelines,
      topics,
      subject,
      language,
      created_at
  `;

  return mapCourseRow(insertedRows[0]);
}

async function findCourseByTitle(title: string): Promise<CourseRecord | null> {
  const rows = await sql`
    SELECT
      id,
      title,
      grading_guidelines,
      topics,
      subject,
      language,
      created_at
    FROM courses
    WHERE title = ${title}
    LIMIT 1
  `;

  if (rows.length === 0) {
    return null;
  }

  return mapCourseRow(rows[0]);
}

function mapCourseRow(row: Record<string, unknown>): CourseRecord {
  return {
    id: Number(row.id),
    title: String(row.title),
    grading_guidelines: String(row.grading_guidelines),
    topics: parseTopics(row.topics),
    subject: String(row.subject),
    language: String(row.language),
    created_at: String(row.created_at),
  };
}

function serializeTopics(topics: string[]): string {
  return JSON.stringify(topics);
}

function parseTopics(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((topic) => String(topic));
  }

  if (typeof value !== "string") {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((topic) => String(topic));
    }
  } catch {
    return value
      .split("\n")
      .map((topic) => topic.trim())
      .filter(Boolean);
  }

  return [];
}
