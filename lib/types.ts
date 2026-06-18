export type DayName = string;
export type SlotKind = "teaching" | "break" | "lunch" | "free" | "eca" | "pt" | "assembly" | "test" | "other";
export type SplitMode = "whole_class" | "specific_students";
export type FixedPeriodScope = "whole_school" | "selected_classes";
export type SubjectFrequency = "normal" | "must_every_working_day";

export interface SchoolTiming {
  schoolName: string;
  workingDays: DayName[];
  periodsPerDay: number;
}

export interface FixedPeriod {
  id: string;
  label: string;
  kind: SlotKind;
  day: DayName | "all";
  period: number;
  blocksTeaching: boolean;
  /** whole_school = lunch/break/assembly for every class. selected_classes = PT/ECA/test/etc only for chosen classes. */
  scope?: FixedPeriodScope;
  /** Used only when scope is selected_classes. Example: ["11-A", "12-B"]. */
  classNames?: string[];
}

export interface TeacherAssignment {
  id: string;
  className: string;
  subject: string;
  weeklyPeriods: number;
  kind: SlotKind;
  /** normal = use periods per week. must_every_working_day = this subject must appear once on every working day. */
  frequency?: SubjectFrequency;
  /**
   * whole_class = normal subject for every student in that class.
   * specific_students = only a student set attends this subject, so another student set can use the same period.
   */
  splitMode?: SplitMode;
  /** Example: "CS students" or "Bio students". Used only when splitMode is specific_students. */
  studentGroup?: string;
  /**
   * Same-name sharing key. Example: CS and Biology entries both use "12-A elective".
   * Only entries with the same class and same parallelGroup can share one class period.
   */
  parallelGroup?: string;
}

export interface Teacher {
  id: string;
  name: string;
  maxPeriodsPerDay: number;
  assignments: TeacherAssignment[];
}

export interface SetupData {
  timing: SchoolTiming;
  fixedPeriods: FixedPeriod[];
  teachers: Teacher[];
}

export interface ClassCellEntry {
  teacherId: string;
  subject: string;
  kind: SlotKind;
  splitMode?: SplitMode;
  studentGroup?: string;
  parallelGroup?: string;
}

export interface TimetableCell {
  className: string;
  day: DayName;
  period: number;
  label: string;
  kind: SlotKind;
  teacherId?: string;
  subject?: string;
  entries?: ClassCellEntry[];
  locked: boolean;
  note?: string;
}

export interface TeacherCell {
  teacherId: string;
  day: DayName;
  period: number;
  label: string;
  className?: string;
  subject?: string;
  kind: SlotKind;
  locked: boolean;
  splitMode?: SplitMode;
  studentGroup?: string;
  parallelGroup?: string;
}

export interface GenerationIssue {
  type: "error" | "warning" | "success";
  title: string;
  message: string;
}

export interface GeneratedTimetable {
  classCells: TimetableCell[];
  teacherCells: TeacherCell[];
  issues: GenerationIssue[];
  summary: {
    classCount: number;
    teacherCount: number;
    teachingPeriodsPlaced: number;
    teachingPeriodsNotPlaced: number;
    totalOpenClassPeriods: number;
  };
}
