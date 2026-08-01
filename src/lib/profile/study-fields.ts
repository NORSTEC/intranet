export const STUDY_FIELDS = [
  "Technology, Engineering and Architecture",
  "Mathematics and Natural Sciences",
  "Social Sciences and Psychology",
  "Information Technology and Informatics",
  "Economics, Management and Administration",
  "Media Studies and Communication",
  "Teacher Education and Pedagogy",
  "Humanities, Languages and Arts",
  "Health and Life Sciences",
  "Law",
  "Other",
] as const;

export function isStudyField(value: string) {
  return (STUDY_FIELDS as readonly string[]).includes(value);
}
