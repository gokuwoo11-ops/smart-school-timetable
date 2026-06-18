import type {
  ClassCellEntry,
  DayName,
  FixedPeriod,
  GeneratedTimetable,
  GenerationIssue,
  SetupData,
  SlotKind,
  Teacher,
  TeacherCell,
  TimetableCell
} from "./types";

function cleanText(value?: string) {
  return (value || "").trim();
}

function normalizeKey(value?: string) {
  return cleanText(value).toLowerCase();
}

function normalizeClassName(value?: string) {
  return cleanText(value)
    .replace(/[–—]/g, "-")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function periodNumbers(periodsPerDay: number) {
  return Array.from({ length: Math.max(0, periodsPerDay) }, (_, index) => index + 1);
}

function appliesToDay(slot: FixedPeriod, day: DayName) {
  return slot.day === "all" || slot.day === day;
}

function fixedAppliesToClass(slot: FixedPeriod, className: string) {
  if ((slot.scope || "whole_school") === "whole_school") return true;
  const targetClasses = (slot.classNames || []).map(normalizeClassName).filter(Boolean);
  return targetClasses.includes(normalizeClassName(className));
}

function isWholeSchoolFixed(slot: FixedPeriod) {
  return (slot.scope || "whole_school") === "whole_school";
}

function addIssue(issues: GenerationIssue[], type: GenerationIssue["type"], title: string, message: string) {
  if (issues.some((issue) => issue.type === type && issue.title === title && issue.message === message)) return;
  issues.push({ type, title, message });
}

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function getClassNamesFromTeachers(setup: SetupData) {
  const classNames = new Set<string>();

  for (const teacher of setup.teachers) {
    for (const assignment of teacher.assignments) {
      const name = normalizeClassName(assignment.className);
      if (name) classNames.add(name);
    }
  }

  for (const fixed of setup.fixedPeriods || []) {
    if ((fixed.scope || "whole_school") !== "selected_classes") continue;
    for (const className of fixed.classNames || []) {
      const name = normalizeClassName(className);
      if (name) classNames.add(name);
    }
  }

  return Array.from(classNames).sort((a, b) => a.localeCompare(b));
}

function formatGroup(group?: string) {
  const cleaned = cleanText(group);
  return cleaned ? ` (${cleaned})` : "";
}

function isSplitEntry(entry: Pick<ClassCellEntry, "splitMode" | "studentGroup" | "parallelGroup">) {
  return entry.splitMode === "specific_students" && Boolean(cleanText(entry.studentGroup)) && Boolean(cleanText(entry.parallelGroup));
}

function isSplitTask(task: Pick<Task, "splitMode" | "studentGroup" | "parallelGroup">) {
  return task.splitMode === "specific_students" && Boolean(cleanText(task.studentGroup)) && Boolean(cleanText(task.parallelGroup));
}

function classEntryLabel(entry: ClassCellEntry) {
  return `${entry.subject}${formatGroup(entry.studentGroup)}`;
}

function refreshClassCellLabel(cell: TimetableCell) {
  if (cell.locked) return;
  const entries = cell.entries || [];
  if (!entries.length) {
    cell.label = "Free";
    cell.subject = undefined;
    cell.teacherId = undefined;
    cell.kind = "free";
    return;
  }

  cell.label = entries.map(classEntryLabel).join(" / ");
  cell.subject = entries.map((entry) => entry.subject).join(" / ");
  cell.teacherId = entries.length === 1 ? entries[0].teacherId : undefined;
  cell.kind = entries.length === 1 ? entries[0].kind : "teaching";
}

function createBlankClassCells(setup: SetupData, classNames: string[], issues: GenerationIssue[]) {
  const cells: TimetableCell[] = [];

  for (const className of classNames) {
    for (const day of setup.timing.workingDays) {
      for (const period of periodNumbers(setup.timing.periodsPerDay)) {
        cells.push({
          className,
          day,
          period,
          label: "Free",
          kind: "free",
          locked: false,
          entries: []
        });
      }
    }
  }

  for (const fixed of setup.fixedPeriods) {
    if (fixed.period > setup.timing.periodsPerDay || fixed.period <= 0) {
      addIssue(
        issues,
        "warning",
        "Fixed period skipped",
        `${fixed.label} uses period ${fixed.period}, but the school timing has only ${setup.timing.periodsPerDay} periods.`
      );
      continue;
    }

    for (const className of classNames) {
      if (!fixedAppliesToClass(fixed, className)) continue;
      for (const day of setup.timing.workingDays) {
        if (!appliesToDay(fixed, day)) continue;
        const cell = cells.find((item) => item.className === className && item.day === day && item.period === fixed.period);
        if (!cell) continue;

        if (cell.locked && cell.label !== fixed.label) {
          addIssue(
            issues,
            "warning",
            "Two fixed periods overlap",
            `${cell.label} and ${fixed.label} are both set for ${day}, period ${fixed.period}. The first one was kept.`
          );
          continue;
        }

        cell.label = fixed.label;
        cell.kind = fixed.kind;
        cell.entries = [];
        cell.subject = undefined;
        cell.teacherId = undefined;
        cell.locked = fixed.blocksTeaching;
        cell.note = fixed.blocksTeaching ? "This period is already fixed by the school." : undefined;
      }
    }
  }

  return cells;
}

function createBlankTeacherCells(setup: SetupData) {
  const cells: TeacherCell[] = [];

  for (const teacher of setup.teachers) {
    for (const day of setup.timing.workingDays) {
      for (const period of periodNumbers(setup.timing.periodsPerDay)) {
        cells.push({
          teacherId: teacher.id,
          day,
          period,
          label: "Free",
          kind: "free",
          locked: false
        });
      }
    }

    for (const fixed of setup.fixedPeriods) {
      if (!fixed.blocksTeaching || !isWholeSchoolFixed(fixed)) continue;
      for (const day of setup.timing.workingDays) {
        if (!appliesToDay(fixed, day)) continue;
        const cell = cells.find((item) => item.teacherId === teacher.id && item.day === day && item.period === fixed.period);
        if (!cell) continue;
        cell.label = fixed.label;
        cell.kind = fixed.kind;
        cell.locked = true;
      }
    }
  }

  return cells;
}

function validateSetup(setup: SetupData, classNames: string[], issues: GenerationIssue[]) {
  if (!cleanText(setup.timing.schoolName)) {
    addIssue(issues, "warning", "School name missing", "You can still generate, but adding the school name makes the timetable clearer.");
  }

  if (!setup.timing.workingDays.length) {
    addIssue(issues, "error", "Working days missing", "Enter the school working days first.");
  }

  if (!Number.isInteger(setup.timing.periodsPerDay) || setup.timing.periodsPerDay <= 0) {
    addIssue(issues, "error", "Periods per day missing", "Enter how many periods the school has per day.");
  }

  if (!setup.teachers.length) {
    addIssue(issues, "error", "Teacher details missing", "Add at least one teacher and what they handle.");
  }

  if (!classNames.length) {
    addIssue(issues, "error", "Handled classes missing", "Add the classes handled by teachers. The class timetable will be created from those entries.");
  }

  for (const fixed of setup.fixedPeriods) {
    if (!cleanText(fixed.label)) {
      addIssue(issues, "error", "Fixed period name missing", "Every fixed period needs a name like Lunch, Break, Assembly, or Unit Test.");
    }
    if (!Number.isInteger(fixed.period) || fixed.period <= 0 || fixed.period > setup.timing.periodsPerDay) {
      addIssue(issues, "error", "Fixed period number wrong", `${fixed.label || "A fixed period"} has an invalid period number.`);
    }

    if ((fixed.scope || "whole_school") === "selected_classes" && !(fixed.classNames || []).map(normalizeClassName).filter(Boolean).length) {
      addIssue(
        issues,
        "error",
        "Class fixed period missing classes",
        `${fixed.label || "A class fixed period"} is selected for only some classes, so enter at least one class like 11-A or 12-B.`
      );
    }
  }

  for (const teacher of setup.teachers) {
    if (!cleanText(teacher.name)) {
      addIssue(issues, "error", "Teacher name missing", "Every teacher needs a name.");
    }

    if (!Number.isInteger(teacher.maxPeriodsPerDay) || teacher.maxPeriodsPerDay <= 0) {
      addIssue(issues, "error", "Teacher daily limit missing", `Enter maximum periods per day for ${teacher.name || "a teacher"}.`);
    }

    if (!teacher.assignments.length) {
      addIssue(issues, "error", "Teacher work missing", `${teacher.name || "A teacher"} has no subject/class work added.`);
    }

    const seenWork = new Set<string>();
    for (const assignment of teacher.assignments) {
      const className = normalizeClassName(assignment.className);
      const subject = cleanText(assignment.subject);
      const splitMode = assignment.splitMode || "whole_class";
      const group = cleanText(assignment.studentGroup);
      const parallelGroup = cleanText(assignment.parallelGroup);

      if (!className) {
        addIssue(issues, "error", "Class name missing", `${teacher.name || "A teacher"} has a work entry without class name.`);
      }
      if (!subject) {
        addIssue(issues, "error", "Subject missing", `${teacher.name || "A teacher"} has a work entry without subject name.`);
      }
      const frequency = assignment.frequency || "normal";
      if (frequency === "normal" && (!Number.isInteger(assignment.weeklyPeriods) || assignment.weeklyPeriods <= 0)) {
        addIssue(issues, "error", "Weekly count missing", `${teacher.name || "A teacher"}'s ${subject || "subject"} needs periods per week.`);
      }

      if (frequency === "must_every_working_day" && !setup.timing.workingDays.length) {
        addIssue(issues, "error", "Working days needed", `${teacher.name || "A teacher"}'s ${subject || "subject"} is marked as must come every working day, so school working days are required.`);
      }

      if (splitMode === "specific_students" && !group) {
        addIssue(issues, "error", "Student set missing", `${teacher.name || "A teacher"}'s ${subject || "subject"} for ${className || "a class"} is marked for specific students, so enter who attends it. Example: CS students.`);
      }

      if (splitMode === "specific_students" && !parallelGroup) {
        addIssue(issues, "error", "Sharing set missing", `${teacher.name || "A teacher"}'s ${subject || "subject"} for ${className || "a class"} needs a sharing set name. Use the same sharing set for subjects that should come in the same box, like CS and Biology.`);
      }

      const workKey = `${className}|${normalizeKey(subject)}|${normalizeKey(frequency)}|${normalizeKey(splitMode)}|${normalizeKey(group)}|${normalizeKey(parallelGroup)}`;
      if (seenWork.has(workKey)) {
        addIssue(
          issues,
          "warning",
          "Duplicate handled work found",
          `${teacher.name}'s ${subject} for ${className}${formatGroup(group)} is added more than once. The generator will treat it as extra periods.`
        );
      }
      seenWork.add(workKey);
    }
  }
}

type Task = {
  id: string;
  teacherId: string;
  className: string;
  subject: string;
  weeklyOrder: number;
  assignmentWeeklyPeriods: number;
  kind: SlotKind;
  frequency?: "normal" | "must_every_working_day";
  preferredDay?: DayName;
  splitMode?: "whole_class" | "specific_students";
  studentGroup?: string;
  parallelGroup?: string;
};

function createTasks(setup: SetupData) {
  const tasks: Task[] = [];
  for (const teacher of setup.teachers) {
    for (const assignment of teacher.assignments) {
      const frequency = assignment.frequency || "normal";

      if (frequency === "must_every_working_day") {
        // Hard rule: create one task for every selected working day.
        // Example: Chemistry must come daily in a Monday-Saturday school => 6 tasks,
        // each task is allowed only on its own day.
        setup.timing.workingDays.forEach((day, index) => {
          tasks.push({
            id: `${teacher.id}-${assignment.id}-daily-${index}`,
            teacherId: teacher.id,
            className: normalizeClassName(assignment.className),
            subject: cleanText(assignment.subject),
            weeklyOrder: index,
            assignmentWeeklyPeriods: setup.timing.workingDays.length,
            kind: assignment.kind || "teaching",
            frequency,
            preferredDay: day,
            splitMode: assignment.splitMode || "whole_class",
            studentGroup: cleanText(assignment.studentGroup),
            parallelGroup: cleanText(assignment.parallelGroup)
          });
        });
        continue;
      }

      for (let index = 0; index < assignment.weeklyPeriods; index++) {
        tasks.push({
          id: `${teacher.id}-${assignment.id}-${index}`,
          teacherId: teacher.id,
          className: normalizeClassName(assignment.className),
          subject: cleanText(assignment.subject),
          weeklyOrder: index,
          assignmentWeeklyPeriods: Number(assignment.weeklyPeriods || 0),
          kind: assignment.kind || "teaching",
          frequency,
          splitMode: assignment.splitMode || "whole_class",
          studentGroup: cleanText(assignment.studentGroup),
          parallelGroup: cleanText(assignment.parallelGroup)
        });
      }
    }
  }
  return tasks;
}

function classCellAt(cells: TimetableCell[], className: string, day: DayName, period: number) {
  return cells.find((cell) => cell.className === className && cell.day === day && cell.period === period);
}

function teacherCellAt(cells: TeacherCell[], teacherId: string, day: DayName, period: number) {
  return cells.find((cell) => cell.teacherId === teacherId && cell.day === day && cell.period === period);
}

function teacherTeachingCountOnDay(cells: TeacherCell[], teacherId: string, day: DayName) {
  return cells.filter((cell) => cell.teacherId === teacherId && cell.day === day && cell.subject).length;
}

function classTeachingCountOnDay(cells: TimetableCell[], className: string, day: DayName) {
  return cells.filter((cell) => cell.className === className && cell.day === day && (cell.entries?.length || cell.subject)).length;
}

function subjectCountOnDay(cells: TimetableCell[], className: string, subject: string, day: DayName, studentGroup?: string, parallelGroup?: string) {
  const subjectKey = normalizeKey(subject);
  const groupKey = normalizeKey(studentGroup);
  const parallelKey = normalizeKey(parallelGroup);
  return cells.filter((cell) => {
    if (cell.className !== className || cell.day !== day) return false;
    const entries = cell.entries || [];
    return entries.some(
      (entry) =>
        normalizeKey(entry.subject) === subjectKey &&
        normalizeKey(entry.studentGroup) === groupKey &&
        normalizeKey(entry.parallelGroup) === parallelKey
    );
  }).length;
}

function sameSubjectSamePeriodAcrossDays(cells: TimetableCell[], className: string, subject: string, period: number, studentGroup?: string, parallelGroup?: string) {
  const subjectKey = normalizeKey(subject);
  const groupKey = normalizeKey(studentGroup);
  const parallelKey = normalizeKey(parallelGroup);
  return cells.filter((cell) => {
    if (cell.className !== className || cell.period !== period) return false;
    const entries = cell.entries || [];
    return entries.some(
      (entry) =>
        normalizeKey(entry.subject) === subjectKey &&
        normalizeKey(entry.studentGroup) === groupKey &&
        normalizeKey(entry.parallelGroup) === parallelKey
    );
  }).length;
}

function teacherSamePeriodAcrossDays(cells: TeacherCell[], teacherId: string, period: number) {
  return cells.filter((cell) => cell.teacherId === teacherId && cell.period === period && cell.subject).length;
}

function hasSameSubjectNear(cells: TimetableCell[], className: string, subject: string, day: DayName, period: number, studentGroup?: string, parallelGroup?: string) {
  const subjectKey = normalizeKey(subject);
  const groupKey = normalizeKey(studentGroup);
  const parallelKey = normalizeKey(parallelGroup);
  const near = [classCellAt(cells, className, day, period - 1), classCellAt(cells, className, day, period + 1)];
  return near.some((cell) =>
    (cell?.entries || []).some(
      (entry) =>
        normalizeKey(entry.subject) === subjectKey &&
        normalizeKey(entry.studentGroup) === groupKey &&
        normalizeKey(entry.parallelGroup) === parallelKey
    )
  );
}

function hasTeacherNear(cells: TeacherCell[], teacherId: string, day: DayName, period: number) {
  const before = teacherCellAt(cells, teacherId, day, period - 1);
  const after = teacherCellAt(cells, teacherId, day, period + 1);
  return Boolean(before?.subject || after?.subject);
}

function openClassSlots(cells: TimetableCell[], className: string) {
  return cells.filter((cell) => cell.className === className && !cell.locked).length;
}

function effectiveMaxPeriodsPerDay(teacher: Teacher, periodsPerDay: number) {
  const strictFreePeriodLimit = Math.max(0, periodsPerDay - 1);
  return Math.min(teacher.maxPeriodsPerDay, strictFreePeriodLimit);
}

function classSlotCanAcceptTask(cell: TimetableCell, task: Task) {
  if (cell.locked) return false;
  const entries = cell.entries || [];

  if (!isSplitTask(task)) {
    // Whole-class subjects need the full class, so they cannot share a period.
    return entries.length === 0 && !cell.subject;
  }

  // Specific-student subjects can share only with the same class and same sharing set.
  // Example: CS students + Bio students can share only when both entries use the same "parallel group" name.
  if (!entries.length) return true;
  if (entries.some((entry) => !isSplitEntry(entry))) return false;
  if (entries.some((entry) => normalizeKey(entry.parallelGroup) !== normalizeKey(task.parallelGroup))) return false;
  if (entries.some((entry) => normalizeKey(entry.studentGroup) === normalizeKey(task.studentGroup))) return false;

  return true;
}

function canPlaceTask(params: {
  task: Task;
  teacher: Teacher;
  day: DayName;
  period: number;
  setup: SetupData;
  classCells: TimetableCell[];
  teacherCells: TeacherCell[];
}) {
  const { task, teacher, day, period, setup, classCells, teacherCells } = params;
  const classCell = classCellAt(classCells, task.className, day, period);
  const teacherCell = teacherCellAt(teacherCells, teacher.id, day, period);
  if (!classCell || !teacherCell) return false;
  if (!classSlotCanAcceptTask(classCell, task)) return false;
  if (teacherCell.locked || teacherCell.subject) return false;

  const dailyLimit = effectiveMaxPeriodsPerDay(teacher, setup.timing.periodsPerDay);
  if (teacherTeachingCountOnDay(teacherCells, teacher.id, day) >= dailyLimit) return false;

  return true;
}

function scoreCandidate(params: {
  task: Task;
  teacher: Teacher;
  day: DayName;
  period: number;
  setup: SetupData;
  classCells: TimetableCell[];
  teacherCells: TeacherCell[];
}) {
  const { task, teacher, day, period, setup, classCells, teacherCells } = params;
  let score = 0;

  const dayIndex = setup.timing.workingDays.indexOf(day);
  const seed = stableHash(`${task.teacherId}|${task.className}|${task.subject}|${task.studentGroup || "all"}`);
  const rotatedTargetPeriod = ((seed + dayIndex * 2 + task.weeklyOrder) % Math.max(1, setup.timing.periodsPerDay)) + 1;
  const classCell = classCellAt(classCells, task.className, day, period);
  const currentClassEntries = classCell?.entries || [];

  if (task.preferredDay && task.preferredDay === day) score -= 250;

  // For split batches like CS/Biology, strongly prefer the same class period,
  // but only when the sharing-set name matches.
  if (
    isSplitTask(task) &&
    currentClassEntries.length > 0 &&
    currentClassEntries.every((entry) => isSplitEntry(entry) && normalizeKey(entry.parallelGroup) === normalizeKey(task.parallelGroup))
  ) {
    score -= 90;
  }

  score += teacherTeachingCountOnDay(teacherCells, teacher.id, day) * 8;
  score += classTeachingCountOnDay(classCells, task.className, day) * 4;

  const subjectAlreadyToday = subjectCountOnDay(classCells, task.className, task.subject, day, task.studentGroup, task.parallelGroup);
  const idealSubjectPerDay = Math.max(1, Math.ceil(task.assignmentWeeklyPeriods / Math.max(1, setup.timing.workingDays.length)));

  // Spread subjects across different days first.
  // Example: English 3/week should prefer 3 different days, not 3 periods on one day.
  // Example: Maths 6/week in a 6-day school should prefer one Maths period every day.
  if (subjectAlreadyToday >= idealSubjectPerDay) score += 180;
  else score += subjectAlreadyToday * 45;

  // These two penalties stop Monday/Tuesday/Wednesday from becoming the same pattern.
  score += sameSubjectSamePeriodAcrossDays(classCells, task.className, task.subject, period, task.studentGroup, task.parallelGroup) * 35;
  score += teacherSamePeriodAcrossDays(teacherCells, teacher.id, period) * 18;

  if (hasSameSubjectNear(classCells, task.className, task.subject, day, period, task.studentGroup, task.parallelGroup)) score += 30;
  if (hasTeacherNear(teacherCells, teacher.id, day, period)) score += 10;

  const middle = Math.ceil(setup.timing.periodsPerDay / 2);
  if (task.kind === "pt" || task.kind === "eca") {
    score += Math.max(0, middle - period) * 4;
  } else {
    score += Math.max(0, period - middle);
  }

  score += Math.abs(period - rotatedTargetPeriod) * 2;
  score += ((seed + dayIndex + period) % 7) * 0.1;

  return score;
}

function placeTask(params: {
  task: Task;
  teacher: Teacher;
  day: DayName;
  period: number;
  classCells: TimetableCell[];
  teacherCells: TeacherCell[];
}) {
  const { task, teacher, day, period, classCells, teacherCells } = params;
  const classCell = classCellAt(classCells, task.className, day, period);
  const teacherCell = teacherCellAt(teacherCells, teacher.id, day, period);
  if (!classCell || !teacherCell) return;

  const entry: ClassCellEntry = {
    teacherId: teacher.id,
    subject: task.subject,
    kind: task.kind,
    splitMode: task.splitMode || "whole_class",
    studentGroup: cleanText(task.studentGroup),
    parallelGroup: cleanText(task.parallelGroup)
  };

  classCell.entries = [...(classCell.entries || []), entry];
  refreshClassCellLabel(classCell);

  teacherCell.label = `${task.subject}${formatGroup(task.studentGroup)} — ${task.className}`;
  teacherCell.subject = task.subject;
  teacherCell.className = task.className;
  teacherCell.kind = task.kind;
  teacherCell.locked = false;
  teacherCell.splitMode = task.splitMode || "whole_class";
  teacherCell.studentGroup = cleanText(task.studentGroup);
  teacherCell.parallelGroup = cleanText(task.parallelGroup);
}

function sortTasks(tasks: Task[], classCells: TimetableCell[]) {
  return [...tasks].sort((a, b) => {
    const aOpen = openClassSlots(classCells, a.className);
    const bOpen = openClassSlots(classCells, b.className);
    const aTeacherTasks = tasks.filter((task) => task.teacherId === a.teacherId).length;
    const bTeacherTasks = tasks.filter((task) => task.teacherId === b.teacherId).length;
    const aGrouped = isSplitTask(a) ? 1 : 0;
    const bGrouped = isSplitTask(b) ? 1 : 0;

    if (aOpen !== bOpen) return aOpen - bOpen;
    if (aTeacherTasks !== bTeacherTasks) return bTeacherTasks - aTeacherTasks;
    if (aGrouped !== bGrouped) return bGrouped - aGrouped;
    return stableHash(a.id) - stableHash(b.id);
  });
}


type TaskBundle = {
  id: string;
  className: string;
  parallelGroup?: string;
  tasks: Task[];
};

function createTaskBundles(tasks: Task[], classCells: TimetableCell[]) {
  const bundles: TaskBundle[] = [];
  const splitBuckets = new Map<string, Task[]>();

  for (const task of sortTasks(tasks, classCells)) {
    if (!isSplitTask(task)) {
      bundles.push({ id: task.id, className: task.className, tasks: [task] });
      continue;
    }

    // CS/Biology-style entries with the same class, same sharing group,
    // and same weekly order must be treated as one combined timetable box.
    const key = `${task.className}|${normalizeKey(task.parallelGroup)}|${task.weeklyOrder}`;
    if (!splitBuckets.has(key)) splitBuckets.set(key, []);
    splitBuckets.get(key)!.push(task);
  }

  for (const [key, bucketTasks] of splitBuckets.entries()) {
    const [className, parallelGroup] = key.split("|");
    bundles.push({
      id: `bundle-${key}`,
      className,
      parallelGroup,
      tasks: [...bucketTasks].sort((a, b) => normalizeKey(a.studentGroup).localeCompare(normalizeKey(b.studentGroup)))
    });
  }

  return bundles.sort((a, b) => {
    const aIsParallel = a.tasks.length > 1 ? 1 : 0;
    const bIsParallel = b.tasks.length > 1 ? 1 : 0;
    const aOpen = openClassSlots(classCells, a.className);
    const bOpen = openClassSlots(classCells, b.className);

    // Put parallel boxes first. Otherwise one subject can occupy a box alone
    // and the matching subject will be forced to another day/period.
    if (aIsParallel !== bIsParallel) return bIsParallel - aIsParallel;
    if (aOpen !== bOpen) return aOpen - bOpen;
    return stableHash(a.id) - stableHash(b.id);
  });
}

function classSlotCanAcceptBundle(cell: TimetableCell, bundle: TaskBundle) {
  const virtualEntries = [...(cell.entries || [])];
  let virtualSubject = cell.subject;

  for (const task of bundle.tasks) {
    const virtualCell: TimetableCell = {
      ...cell,
      entries: [...virtualEntries],
      subject: virtualSubject
    };

    if (!classSlotCanAcceptTask(virtualCell, task)) return false;

    virtualEntries.push({
      teacherId: task.teacherId,
      subject: task.subject,
      kind: task.kind,
      splitMode: task.splitMode || "whole_class",
      studentGroup: cleanText(task.studentGroup),
      parallelGroup: cleanText(task.parallelGroup)
    });
    virtualSubject = virtualEntries.map((entry) => entry.subject).join(" / ");
  }

  return true;
}

function canPlaceBundle(params: {
  bundle: TaskBundle;
  teachers: Teacher[];
  day: DayName;
  period: number;
  setup: SetupData;
  classCells: TimetableCell[];
  teacherCells: TeacherCell[];
}) {
  const { bundle, teachers, day, period, setup, classCells, teacherCells } = params;
  const classCell = classCellAt(classCells, bundle.className, day, period);
  if (!classCell) return false;
  if (bundle.tasks.some((task) => task.preferredDay && task.preferredDay !== day)) return false;
  if (!classSlotCanAcceptBundle(classCell, bundle)) return false;

  const teachersUsedInThisBox = new Set<string>();

  for (const task of bundle.tasks) {
    const teacher = teachers.find((item) => item.id === task.teacherId);
    const teacherCell = teacherCellAt(teacherCells, task.teacherId, day, period);

    if (!teacher || !teacherCell) return false;
    if (teachersUsedInThisBox.has(task.teacherId)) return false;
    if (teacherCell.locked || teacherCell.subject) return false;

    const dailyLimit = effectiveMaxPeriodsPerDay(teacher, setup.timing.periodsPerDay);
    if (teacherTeachingCountOnDay(teacherCells, teacher.id, day) >= dailyLimit) return false;

    teachersUsedInThisBox.add(task.teacherId);
  }

  return true;
}

function scoreBundle(params: {
  bundle: TaskBundle;
  teachers: Teacher[];
  day: DayName;
  period: number;
  setup: SetupData;
  classCells: TimetableCell[];
  teacherCells: TeacherCell[];
}) {
  const { bundle, teachers, day, period, setup, classCells, teacherCells } = params;
  const classCell = classCellAt(classCells, bundle.className, day, period);
  let score = 0;

  for (const task of bundle.tasks) {
    const teacher = teachers.find((item) => item.id === task.teacherId);
    if (!teacher) continue;
    score += scoreCandidate({ task, teacher, day, period, setup, classCells, teacherCells });
  }

  // If this is a parallel group, prefer keeping the matching student groups
  // together in an empty box instead of leaving one subject alone somewhere else.
  if (bundle.tasks.length > 1 && !(classCell?.entries || []).length) {
    score -= 120;
  }

  return score / Math.max(1, bundle.tasks.length);
}

function placeBundle(params: {
  bundle: TaskBundle;
  teachers: Teacher[];
  day: DayName;
  period: number;
  classCells: TimetableCell[];
  teacherCells: TeacherCell[];
}) {
  const { bundle, teachers, day, period, classCells, teacherCells } = params;

  for (const task of bundle.tasks) {
    const teacher = teachers.find((item) => item.id === task.teacherId);
    if (!teacher) continue;
    placeTask({ task, teacher, day, period, classCells, teacherCells });
  }
}

function bundleLabel(bundle: TaskBundle) {
  return bundle.tasks.map((task) => `${task.subject}${formatGroup(task.studentGroup)}`).join(" / ");
}


function addSplitGroupWarnings(tasks: Task[], issues: GenerationIssue[]) {
  const byClassAndSet = new Map<string, Map<string, number>>();

  for (const task of tasks.filter(isSplitTask)) {
    const key = `${task.className}|${normalizeKey(task.parallelGroup)}`;
    if (!byClassAndSet.has(key)) byClassAndSet.set(key, new Map());
    const groupCounts = byClassAndSet.get(key)!;
    const studentKey = cleanText(task.studentGroup);
    groupCounts.set(studentKey, (groupCounts.get(studentKey) || 0) + 1);
  }

  for (const [key, groupCounts] of byClassAndSet.entries()) {
    const [className, parallelGroupKey] = key.split("|");
    const groups = Array.from(groupCounts.entries());

    if (groups.length < 2) {
      addIssue(
        issues,
        "warning",
        "Specific-student sharing set has only one subject",
        `${className}'s sharing set "${parallelGroupKey}" has only one student set added. Add the matching subject also, like Biology for Bio students, if it should share the same box.`
      );
      continue;
    }

    const counts = new Set(groups.map(([, count]) => count));
    if (counts.size > 1) {
      addIssue(
        issues,
        "warning",
        "Specific-student weekly counts differ",
        `${className}'s sharing set "${parallelGroupKey}" has different weekly counts. Common periods will share boxes, but extra periods may be placed alone.`
      );
    }
  }
}

function requiredClassSlotsForClass(tasks: Task[], className: string) {
  const wholeClassCount = tasks.filter((task) => task.className === className && !isSplitTask(task)).length;
  const splitTasks = tasks.filter((task) => task.className === className && isSplitTask(task));
  const byParallelGroup = new Map<string, Map<string, number>>();

  for (const task of splitTasks) {
    const parallelKey = normalizeKey(task.parallelGroup);
    const studentKey = normalizeKey(task.studentGroup);
    if (!byParallelGroup.has(parallelKey)) byParallelGroup.set(parallelKey, new Map());
    const groupCounts = byParallelGroup.get(parallelKey)!;
    groupCounts.set(studentKey, (groupCounts.get(studentKey) || 0) + 1);
  }

  let splitSlotCount = 0;
  for (const groupCounts of byParallelGroup.values()) {
    splitSlotCount += Math.max(...Array.from(groupCounts.values()));
  }

  return wholeClassCount + splitSlotCount;
}

export function generateTimetable(setup: SetupData): GeneratedTimetable {
  const issues: GenerationIssue[] = [];
  const safeSetup: SetupData = {
    timing: {
      schoolName: cleanText(setup.timing.schoolName),
      workingDays: setup.timing.workingDays.map(cleanText).filter(Boolean),
      periodsPerDay: Number(setup.timing.periodsPerDay || 0)
    },
    fixedPeriods: setup.fixedPeriods.map((period) => ({
      ...period,
      label: cleanText(period.label),
      period: Number(period.period || 0),
      blocksTeaching: true,
      scope: period.scope || "whole_school",
      classNames: (period.classNames || []).map(normalizeClassName).filter(Boolean)
    })),
    teachers: setup.teachers.map((teacher) => ({
      ...teacher,
      name: cleanText(teacher.name),
      maxPeriodsPerDay: Number(teacher.maxPeriodsPerDay || 0),
      assignments: teacher.assignments.map((assignment) => ({
        ...assignment,
        className: normalizeClassName(assignment.className),
        subject: cleanText(assignment.subject),
        weeklyPeriods: Number(assignment.weeklyPeriods || 0),
        kind: assignment.kind || "teaching",
        frequency: assignment.frequency || "normal",
        splitMode: assignment.splitMode || "whole_class",
        studentGroup: cleanText(assignment.studentGroup),
        parallelGroup: cleanText(assignment.parallelGroup)
      }))
    }))
  };

  const classNames = getClassNamesFromTeachers(safeSetup);
  validateSetup(safeSetup, classNames, issues);

  if (issues.some((issue) => issue.type === "error")) {
    return {
      classCells: [],
      teacherCells: [],
      issues,
      summary: {
        classCount: classNames.length,
        teacherCount: safeSetup.teachers.length,
        teachingPeriodsPlaced: 0,
        teachingPeriodsNotPlaced: 0,
        totalOpenClassPeriods: 0
      }
    };
  }

  const classCells = createBlankClassCells(safeSetup, classNames, issues);
  const teacherCells = createBlankTeacherCells(safeSetup);
  const tasks = createTasks(safeSetup);
  addSplitGroupWarnings(tasks, issues);

  if (tasks.some((task) => task.frequency === "must_every_working_day")) {
    addIssue(
      issues,
      "success",
      "Must daily subjects enabled",
      "Subjects marked as must come every working day are forced to appear once on each working day when there is enough space."
    );
  }

  for (const className of classNames) {
    const requiredSlots = requiredClassSlotsForClass(tasks, className);
    const rawPeriodCount = tasks.filter((task) => task.className === className).length;
    const open = openClassSlots(classCells, className);

    if (requiredSlots > open) {
      addIssue(
        issues,
        "error",
        "Not enough periods for a class",
        `${className} needs ${requiredSlots} timetable boxes, but only ${open} open boxes are available after fixed periods. Specific-student subjects can share the same box only when their sharing-set name matches.`
      );
    }

    // rawPeriodCount can be higher than requiredSlots when selected-student
    // subjects run in parallel. That is expected, so it is not shown as a warning.
    void rawPeriodCount;
  }

  for (const teacher of safeSetup.teachers) {
    const effectiveDailyLimit = effectiveMaxPeriodsPerDay(teacher, safeSetup.timing.periodsPerDay);
    const weeklyCapacity = effectiveDailyLimit * safeSetup.timing.workingDays.length;
    const required = tasks.filter((task) => task.teacherId === teacher.id).length;

    if (teacher.maxPeriodsPerDay > effectiveDailyLimit) {
      addIssue(
        issues,
        "warning",
        "One free period protected",
        `${teacher.name}'s daily limit was internally kept to ${effectiveDailyLimit} because every teacher must have at least one free period per day.`
      );
    }

    if (required > weeklyCapacity) {
      addIssue(
        issues,
        "error",
        "Teacher workload too high",
        `${teacher.name} needs ${required} periods this week, but only ${weeklyCapacity} can be placed while keeping one free period per day.`
      );
    }
  }

  if (issues.some((issue) => issue.type === "error")) {
    return {
      classCells,
      teacherCells,
      issues,
      summary: {
        classCount: classNames.length,
        teacherCount: safeSetup.teachers.length,
        teachingPeriodsPlaced: 0,
        teachingPeriodsNotPlaced: tasks.length,
        totalOpenClassPeriods: classNames.reduce((sum, className) => sum + openClassSlots(classCells, className), 0)
      }
    };
  }

  let notPlaced = 0;
  const bundles = createTaskBundles(tasks, classCells);

  for (const bundle of bundles) {
    const candidates: Array<{ day: DayName; period: number; score: number }> = [];

    for (const day of safeSetup.timing.workingDays) {
      for (const period of periodNumbers(safeSetup.timing.periodsPerDay)) {
        if (!canPlaceBundle({ bundle, teachers: safeSetup.teachers, day, period, setup: safeSetup, classCells, teacherCells })) continue;
        candidates.push({
          day,
          period,
          score: scoreBundle({ bundle, teachers: safeSetup.teachers, day, period, setup: safeSetup, classCells, teacherCells })
        });
      }
    }

    candidates.sort(
      (a, b) =>
        a.score - b.score ||
        stableHash(`${bundle.id}|${a.day}|${a.period}`) - stableHash(`${bundle.id}|${b.day}|${b.period}`)
    );

    const best = candidates[0];
    if (!best) {
      notPlaced += bundle.tasks.length;
      addIssue(
        issues,
        "warning",
        "Some periods could not be placed",
        `${bundleLabel(bundle)} for ${bundle.className} could not be fitted without creating a teacher/class clash.`
      );
      continue;
    }

    placeBundle({ bundle, teachers: safeSetup.teachers, day: best.day, period: best.period, classCells, teacherCells });
  }

  const placed = tasks.length - notPlaced;

  if (notPlaced === 0) {
    addIssue(
      issues,
      "success",
      "Timetable generated",
      "Teacher timetable and class timetable were created from the same schedule. Selected-student subjects in the same group are placed inside one class box."
    );
  }

  return {
    classCells,
    teacherCells,
    issues,
    summary: {
      classCount: classNames.length,
      teacherCount: safeSetup.teachers.length,
      teachingPeriodsPlaced: placed,
      teachingPeriodsNotPlaced: notPlaced,
      totalOpenClassPeriods: classNames.reduce((sum, className) => sum + openClassSlots(classCells, className), 0)
    }
  };
}
