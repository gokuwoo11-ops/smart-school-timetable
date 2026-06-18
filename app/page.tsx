"use client";

import { useMemo, useState } from "react";
import { generateTimetable, getClassNamesFromTeachers } from "@/lib/generator";
import type { FixedPeriod, FixedPeriodScope, GeneratedTimetable, SetupData, SlotKind, SplitMode, SubjectFrequency, Teacher, TeacherAssignment } from "@/lib/types";

const fixedTypes: Array<{ value: SlotKind; label: string }> = [
  { value: "lunch", label: "Lunch" },
  { value: "break", label: "Break" },
  { value: "assembly", label: "Assembly" },
  { value: "test", label: "Test / Unit Test" },
  { value: "eca", label: "ECA" },
  { value: "pt", label: "PT" },
  { value: "free", label: "Free / Library" },
  { value: "other", label: "Other" }
];

const workTypes: Array<{ value: SlotKind; label: string }> = [
  { value: "teaching", label: "Normal subject" },
  { value: "pt", label: "PT" },
  { value: "eca", label: "ECA" },
  { value: "test", label: "Test / Unit Test" },
  { value: "other", label: "Other handled period" }
];

const dayChoices = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function getDaysFromRange(startDay: string, endDay: string) {
  const startIndex = dayChoices.indexOf(startDay);
  const endIndex = dayChoices.indexOf(endDay);
  if (startIndex === -1 || endIndex === -1) return [];
  if (startIndex <= endIndex) return dayChoices.slice(startIndex, endIndex + 1);
  return [...dayChoices.slice(startIndex), ...dayChoices.slice(0, endIndex + 1)];
}


const emptySetup: SetupData = {
  timing: {
    schoolName: "",
    workingDays: [],
    periodsPerDay: 0
  },
  fixedPeriods: [],
  teachers: []
};

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function splitValues(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, arr) => arr.indexOf(item) === index);
}

function numberValue(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : 0;
}

function periodOptions(periodsPerDay: number) {
  return Array.from({ length: Math.max(0, periodsPerDay) }, (_, index) => index + 1);
}

function clean(value: string) {
  return value.trim();
}

function normalizeClassName(value: string) {
  return clean(value)
    .replace(/[–—]/g, "-")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function formatGroup(group?: string) {
  const cleaned = clean(group || "");
  return cleaned ? ` (${cleaned})` : "";
}

function teacherName(teachers: Teacher[], teacherId?: string) {
  return teachers.find((item) => item.id === teacherId)?.name || "Teacher removed";
}

export default function Home() {
  const [setup, setSetup] = useState<SetupData>(emptySetup);
  const [activeStep, setActiveStep] = useState<"school" | "teachers" | "generate">("school");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<GeneratedTimetable | null>(null);


  const [schoolForm, setSchoolForm] = useState({ schoolName: "", startDay: "", endDay: "", periodsPerDay: "" });
  const [fixedForm, setFixedForm] = useState({ label: "", kind: "lunch" as SlotKind, day: "all", period: "", scope: "whole_school" as FixedPeriodScope, classes: "" });
  const [teacherForm, setTeacherForm] = useState({ name: "", maxPeriodsPerDay: "" });
  const [workForm, setWorkForm] = useState({
    teacherId: "",
    subject: "",
    classes: "",
    weeklyPeriods: "",
    frequency: "normal" as SubjectFrequency,
    kind: "teaching" as SlotKind,
    splitMode: "whole_class" as SplitMode,
    studentGroup: "",
    parallelGroup: ""
  });

  const classNames = useMemo(() => getClassNamesFromTeachers(setup), [setup]);
  const schoolReady = setup.timing.workingDays.length > 0 && setup.timing.periodsPerDay > 0;
  const teacherReady = setup.teachers.length > 0 && setup.teachers.some((teacher) => teacher.assignments.length > 0);
  const canGenerate = schoolReady && teacherReady;

  const classCellsByClass = useMemo(() => {
    if (!result) return [];
    return classNames.map((className) => ({ className, cells: result.classCells.filter((cell) => cell.className === className) }));
  }, [result, classNames]);

  const teacherCellsByTeacher = useMemo(() => {
    if (!result) return [];
    return setup.teachers.map((teacher) => ({ teacher, cells: result.teacherCells.filter((cell) => cell.teacherId === teacher.id) }));
  }, [result, setup.teachers]);

  function showMessage(text: string) {
    setMessage(text);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function clearResult() {
    setResult(null);
    setMessage("");
  }

  function saveSchoolDetails() {
    const workingDays = getDaysFromRange(schoolForm.startDay, schoolForm.endDay);
    const periodsPerDay = numberValue(schoolForm.periodsPerDay);

    if (!workingDays.length) {
      showMessage("Choose the working days using From day and To day.");
      return;
    }

    if (periodsPerDay <= 0) {
      showMessage("Enter the total number of periods per day.");
      return;
    }

    setSetup((current) => ({
      ...current,
      timing: {
        schoolName: clean(schoolForm.schoolName),
        workingDays,
        periodsPerDay
      },
      fixedPeriods: current.fixedPeriods.filter((period) => period.period <= periodsPerDay)
    }));
    setActiveStep("teachers");
    clearResult();
  }

  function addFixedPeriod() {
    if (!schoolReady) {
      showMessage("Save school details first. Then add lunch, break, assembly, or any fixed period.");
      return;
    }

    const period = numberValue(fixedForm.period);
    const selectedClassNames = splitValues(fixedForm.classes).map(normalizeClassName).filter(Boolean);

    if (!clean(fixedForm.label)) {
      showMessage("Enter the fixed period name. Example: Lunch, Break, Assembly, Unit Test");
      return;
    }

    if (period <= 0 || period > setup.timing.periodsPerDay) {
      showMessage("Choose a valid period number from the school timing.");
      return;
    }

    if (fixedForm.scope === "selected_classes" && !selectedClassNames.length) {
      showMessage("Enter which classes should have this fixed period. Example: 11-A, 12-B");
      return;
    }

    const fixedPeriod: FixedPeriod = {
      id: uid("fixed"),
      label: clean(fixedForm.label),
      kind: fixedForm.kind,
      day: fixedForm.day,
      period,
      blocksTeaching: true,
      scope: fixedForm.scope,
      classNames: fixedForm.scope === "selected_classes" ? selectedClassNames : []
    };

    setSetup((current) => ({ ...current, fixedPeriods: [...current.fixedPeriods, fixedPeriod] }));
    setFixedForm({ label: "", kind: "lunch", day: "all", period: "", scope: "whole_school", classes: "" });
    clearResult();
  }

  function removeFixedPeriod(periodId: string) {
    setSetup((current) => ({ ...current, fixedPeriods: current.fixedPeriods.filter((period) => period.id !== periodId) }));
    clearResult();
  }

  function addTeacher() {
    const maxPeriodsPerDay = numberValue(teacherForm.maxPeriodsPerDay);

    if (!clean(teacherForm.name)) {
      showMessage("Enter the teacher name.");
      return;
    }

    if (maxPeriodsPerDay <= 0) {
      showMessage("Enter maximum periods per day for this teacher.");
      return;
    }

    const teacher: Teacher = {
      id: uid("teacher"),
      name: clean(teacherForm.name),
      maxPeriodsPerDay,
      assignments: []
    };

    setSetup((current) => ({ ...current, teachers: [...current.teachers, teacher] }));
    setTeacherForm({ name: "", maxPeriodsPerDay: "" });
    clearResult();
  }

  function removeTeacher(teacherId: string) {
    setSetup((current) => ({ ...current, teachers: current.teachers.filter((teacher) => teacher.id !== teacherId) }));
    clearResult();
  }

  function addTeacherWork() {
    const teacherId = workForm.teacherId || setup.teachers[0]?.id || "";
    const classList = Array.from(new Set(splitValues(workForm.classes).map(normalizeClassName).filter(Boolean)));
    const frequency = workForm.frequency;
    const weeklyPeriods = frequency === "must_every_working_day" ? setup.timing.workingDays.length : numberValue(workForm.weeklyPeriods);

    if (!teacherId) {
      showMessage("Add a teacher first.");
      return;
    }

    if (!clean(workForm.subject)) {
      showMessage("Enter the subject or work name. Example: Maths, Science, PT, ECA");
      return;
    }

    if (!classList.length) {
      showMessage("Enter the classes handled by this teacher. Example: 8-A, 9-A, 10-A");
      return;
    }

    if (frequency === "must_every_working_day" && !setup.timing.workingDays.length) {
      showMessage("Save the school working days first. Then choose Must come every working day.");
      return;
    }

    if (frequency === "normal" && weeklyPeriods <= 0) {
      showMessage("Enter how many periods per week this subject/work should come for each class.");
      return;
    }

    const splitMode = workForm.splitMode;
    const studentGroup = clean(workForm.studentGroup);
    const parallelGroup = clean(workForm.parallelGroup);

    if (splitMode === "specific_students" && !studentGroup) {
      showMessage("Enter who attends this subject. Example: CS students or Bio students.");
      return;
    }

    if (splitMode === "specific_students" && !parallelGroup) {
      showMessage("Enter a sharing set name. Use the same name for subjects that must come in the same class box, like CS and Biology.");
      return;
    }

    const assignments: TeacherAssignment[] = classList.map((className) => ({
      id: uid("work"),
      className,
      subject: clean(workForm.subject),
      weeklyPeriods,
      kind: workForm.kind,
      frequency,
      splitMode,
      studentGroup: splitMode === "specific_students" ? studentGroup : "",
      parallelGroup: splitMode === "specific_students" ? parallelGroup : ""
    }));

    setSetup((current) => ({
      ...current,
      teachers: current.teachers.map((teacher) =>
        teacher.id === teacherId ? { ...teacher, assignments: [...teacher.assignments, ...assignments] } : teacher
      )
    }));
    setWorkForm({ teacherId: "", subject: "", classes: "", weeklyPeriods: "", frequency: "normal", kind: "teaching", splitMode: "whole_class", studentGroup: "", parallelGroup: "" });
    clearResult();
  }

  function removeTeacherWork(teacherId: string, workId: string) {
    setSetup((current) => ({
      ...current,
      teachers: current.teachers.map((teacher) =>
        teacher.id === teacherId ? { ...teacher, assignments: teacher.assignments.filter((work) => work.id !== workId) } : teacher
      )
    }));
    clearResult();
  }

  function startGenerate() {
    const generated = generateTimetable(setup);
    setResult(generated);
    setActiveStep("generate");
    setMessage("");
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }


  function csvValue(value: unknown) {
    const text = String(value ?? "").replace(/\r?\n|\r/g, " ").trim();
    if (/[",]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
    const csvText = rows.map((row) => row.map(csvValue).join(",")).join("\n");
    const blob = new Blob(["\ufeff", csvText], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function safeFileName(value: string) {
    return (value || "school-timetable").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "school-timetable";
  }

  function exportTeacherCsv() {
    if (!result) return;

    const rows: Array<Array<string | number>> = [["School", "Teacher", "Day", "Period", "Entry", "Class", "Subject", "Student group"]];

    for (const teacher of setup.teachers) {
      for (const day of setup.timing.workingDays) {
        for (const period of periodOptions(setup.timing.periodsPerDay)) {
          const cell = result.teacherCells.find((item) => item.teacherId === teacher.id && item.day === day && item.period === period);
          rows.push([
            setup.timing.schoolName || "School",
            teacher.name,
            day,
            `P${period}`,
            cell?.label || "Free",
            cell?.className || "",
            cell?.subject || "",
            cell?.studentGroup || ""
          ]);
        }
      }
    }

    downloadCsv(`${safeFileName(setup.timing.schoolName)}-teacher-timetable.csv`, rows);
  }

  function exportClassCsv() {
    if (!result) return;

    const rows: Array<Array<string | number>> = [["School", "Class", "Day", "Period", "Entry", "Teacher", "Student group"]];

    for (const className of classNames) {
      for (const day of setup.timing.workingDays) {
        for (const period of periodOptions(setup.timing.periodsPerDay)) {
          const cell = result.classCells.find((item) => item.className === className && item.day === day && item.period === period);
          const teacherText = cell?.entries?.length
            ? cell.entries.map((entry) => teacherName(setup.teachers, entry.teacherId)).join(" / ")
            : cell?.teacherId
              ? teacherName(setup.teachers, cell.teacherId)
              : "";
          const studentGroupText = cell?.entries?.length
            ? cell.entries.map((entry) => entry.studentGroup || "Whole class").join(" / ")
            : "";

          rows.push([
            setup.timing.schoolName || "School",
            className,
            day,
            `P${period}`,
            cell?.label || "Free",
            teacherText,
            studentGroupText
          ]);
        }
      }
    }

    downloadCsv(`${safeFileName(setup.timing.schoolName)}-class-timetable.csv`, rows);
  }

  function resetAll() {
    setSetup(emptySetup);
    setSchoolForm({ schoolName: "", startDay: "", endDay: "", periodsPerDay: "" });
    setFixedForm({ label: "", kind: "lunch", day: "all", period: "", scope: "whole_school", classes: "" });
    setTeacherForm({ name: "", maxPeriodsPerDay: "" });
    setWorkForm({ teacherId: "", subject: "", classes: "", weeklyPeriods: "", frequency: "normal", kind: "teaching", splitMode: "whole_class", studentGroup: "", parallelGroup: "" });
    setResult(null);
    setMessage("");
    setActiveStep("school");
  }

  return (
    <main>
      <nav className="topNav" aria-label="Main navigation">
        <div className="brandMark">
          <span>ST</span>
          <strong>Smart Timetable</strong>
        </div>
        <div className="navLinks">
          <button onClick={() => setActiveStep("school")}>School setup</button>
          <button onClick={() => setActiveStep("teachers")}>Teachers</button>
          <button onClick={() => setActiveStep("generate")}>Generate</button>
        </div>
      </nav>

      <section className="hero">
        <div className="heroCopy">
          <p className="eyebrow">Smart school timetable</p>
          <h1>Build calm school timetables without confusion.</h1>
          <p className="heroText">
            Enter the school timing and teacher details. The system arranges teacher-wise and class-wise timetables together, while protecting breaks, lunch, free periods, fixed class periods, and split student groups.
          </p>
          <div className="heroPills">
            <span>School setup</span>
            <span>Teacher workload</span>
            <span>Class timetable</span>
          </div>
        </div>
        <div className="heroCard">
          <div className="heroCardTop">
            <span>Simple flow</span>
            <strong>Details → Generate → Review</strong>
          </div>
          <div className="miniBoard" aria-hidden="true">
            <div className="miniCell accent">Lunch</div>
            <div className="miniCell">Maths</div>
            <div className="miniCell soft">CS / Bio</div>
            <div className="miniCell">Free</div>
            <div className="miniCell soft">PT</div>
            <div className="miniCell accent">Break</div>
          </div>
          <p>One free period per teacher per day is protected in the background. Subjects are spread across days as much as possible.</p>
        </div>
      </section>

      {message ? <div className="messageBox">{message}</div> : null}

      <section className="statusBar" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <button className={activeStep === "school" ? "step active" : "step"} onClick={() => setActiveStep("school")}>1. School details</button>
        <button className={activeStep === "teachers" ? "step active" : "step"} onClick={() => setActiveStep("teachers")}>2. Teacher details</button>
        <button className={activeStep === "generate" ? "step active" : "step"} onClick={() => setActiveStep("generate")}>3. Generate</button>
      </section>

      <section className="readiness" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className={schoolReady ? "readyItem done" : "readyItem"}><strong>{schoolReady ? "Done" : "Pending"}</strong><span>School details</span></div>
        <div className={teacherReady ? "readyItem done" : "readyItem"}><strong>{setup.teachers.length}</strong><span>Teachers</span></div>
        <div className={canGenerate ? "readyItem done" : "readyItem"}><strong>{canGenerate ? "Ready" : "Wait"}</strong><span>Generate</span></div>
      </section>

      {activeStep === "school" ? (
        <section className="panel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">Step 1</p>
              <h2>School details</h2>
            </div>
            <span className="badge">Start here</span>
          </div>

          <div className="formGrid four">
            <label>
              School name
              <input value={schoolForm.schoolName} onChange={(event) => setSchoolForm({ ...schoolForm, schoolName: event.target.value })} placeholder="Type school name" />
            </label>
            <label>
              Working days from
              <select value={schoolForm.startDay} onChange={(event) => setSchoolForm({ ...schoolForm, startDay: event.target.value })}>
                <option value="">Choose day</option>
                {dayChoices.map((day) => <option key={day} value={day}>{day}</option>)}
              </select>
            </label>
            <label>
              Working days to
              <select value={schoolForm.endDay} onChange={(event) => setSchoolForm({ ...schoolForm, endDay: event.target.value })}>
                <option value="">Choose day</option>
                {dayChoices.map((day) => <option key={day} value={day}>{day}</option>)}
              </select>
            </label>
            <label>
              Periods per day
              <input value={schoolForm.periodsPerDay} onChange={(event) => setSchoolForm({ ...schoolForm, periodsPerDay: event.target.value })} inputMode="numeric" placeholder="Example: 8" />
            </label>
          </div>

          <button className="primary" onClick={saveSchoolDetails}>Save school details</button>

          <div className="summaryGrid">
            <div><span>School</span><strong>{setup.timing.schoolName || "Not entered"}</strong></div>
            <div><span>Days</span><strong>{setup.timing.workingDays.length ? setup.timing.workingDays.join(", ") : "Not entered"}</strong></div>
            <div><span>Periods</span><strong>{setup.timing.periodsPerDay || "Not entered"}</strong></div>
          </div>

          <div className="subPanel">
            <div className="panelHeader compact">
              <div>
                <h3>Fixed periods</h3>
                <p>Add whole-school periods like lunch/break/assembly, or class-only fixed periods like PT, ECA, library, or unit test for selected classes.</p>
              </div>
            </div>

            <div className="formGrid five">
              <label>
                Period name
                <input value={fixedForm.label} onChange={(event) => setFixedForm({ ...fixedForm, label: event.target.value })} placeholder="Lunch, Break, PT, ECA" />
              </label>
              <label>
                Type
                <select value={fixedForm.kind} onChange={(event) => setFixedForm({ ...fixedForm, kind: event.target.value as SlotKind })}>
                  {fixedTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </label>
              <label>
                Applies to
                <select value={fixedForm.scope} onChange={(event) => setFixedForm({ ...fixedForm, scope: event.target.value as FixedPeriodScope, classes: "" })}>
                  <option value="whole_school">Whole school</option>
                  <option value="selected_classes">Selected classes only</option>
                </select>
              </label>
              <label>
                Day
                <select value={fixedForm.day} onChange={(event) => setFixedForm({ ...fixedForm, day: event.target.value })}>
                  <option value="all">All working days</option>
                  {setup.timing.workingDays.map((day) => <option key={day} value={day}>{day}</option>)}
                </select>
              </label>
              <label>
                Period
                <select value={fixedForm.period} onChange={(event) => setFixedForm({ ...fixedForm, period: event.target.value })}>
                  <option value="">Choose period</option>
                  {periodOptions(setup.timing.periodsPerDay).map((period) => <option key={period} value={period}>Period {period}</option>)}
                </select>
              </label>
              {fixedForm.scope === "selected_classes" ? (
                <label>
                  Classes for this period
                  <input value={fixedForm.classes} onChange={(event) => setFixedForm({ ...fixedForm, classes: event.target.value })} placeholder="Example: 11-A, 12-B" />
                </label>
              ) : null}
            </div>

            <button className="secondary" onClick={addFixedPeriod}>Add fixed period</button>

            <div className="chips">
              {setup.fixedPeriods.length ? setup.fixedPeriods.map((period) => (
                <button key={period.id} className="chip removable" onClick={() => removeFixedPeriod(period.id)}>
                  {period.label} · {period.scope === "selected_classes" ? (period.classNames || []).join(", ") : "Whole school"} · {period.day === "all" ? "All days" : period.day} · P{period.period} ×
                </button>
              )) : <span className="emptyText">No fixed periods added yet.</span>}
            </div>
          </div>
        </section>
      ) : null}

      {activeStep === "teachers" ? (
        <section className="panel">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">Step 2</p>
              <h2>Teacher details</h2>
            </div>
            <span className="badge">Main details</span>
          </div>

          <div className="formGrid two">
            <label>
              Teacher name
              <input value={teacherForm.name} onChange={(event) => setTeacherForm({ ...teacherForm, name: event.target.value })} placeholder="Teacher name" />
            </label>
            <label>
              Maximum periods per day
              <input value={teacherForm.maxPeriodsPerDay} onChange={(event) => setTeacherForm({ ...teacherForm, maxPeriodsPerDay: event.target.value })} inputMode="numeric" placeholder="Example: 5" />
            </label>
          </div>
          <p className="helperText">Every teacher will automatically get at least one free period per day.</p>
          <button className="primary" onClick={addTeacher}>Add teacher</button>

          <div className="subPanel">
            <div className="panelHeader compact">
              <div>
                <h3>What does the teacher handle?</h3>
                <p>Enter subject/work and the classes handled by that teacher. Periods per week means how many times that subject should come in the week; the app spreads them across different days automatically.</p>
              </div>
            </div>

            <div className="formGrid five">
              <label>
                Teacher
                <select value={workForm.teacherId || setup.teachers[0]?.id || ""} onChange={(event) => setWorkForm({ ...workForm, teacherId: event.target.value })}>
                  {setup.teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)}
                </select>
              </label>
              <label>
                Subject / Work
                <input value={workForm.subject} onChange={(event) => setWorkForm({ ...workForm, subject: event.target.value })} placeholder="Maths, Biology, CS, PT" />
              </label>
              <label>
                Classes handled
                <input value={workForm.classes} onChange={(event) => setWorkForm({ ...workForm, classes: event.target.value })} placeholder="11-A, 12-A" />
              </label>
              <label>
                Who attends?
                <select value={workForm.splitMode} onChange={(event) => setWorkForm({ ...workForm, splitMode: event.target.value as SplitMode, studentGroup: "", parallelGroup: "" })}>
                  <option value="whole_class">Whole class</option>
                  <option value="specific_students">Specific students only</option>
                </select>
              </label>
              <label>
                Must rule
                <select value={workForm.frequency} onChange={(event) => setWorkForm({ ...workForm, frequency: event.target.value as SubjectFrequency, weeklyPeriods: event.target.value === "must_every_working_day" ? "" : workForm.weeklyPeriods })}>
                  <option value="normal">Use periods per week</option>
                  <option value="must_every_working_day">Must come every working day</option>
                </select>
              </label>
              <label>
                Periods per week
                <input
                  value={workForm.frequency === "must_every_working_day" ? String(setup.timing.workingDays.length || "") : workForm.weeklyPeriods}
                  onChange={(event) => setWorkForm({ ...workForm, weeklyPeriods: event.target.value })}
                  inputMode="numeric"
                  placeholder="Example: 5"
                  disabled={workForm.frequency === "must_every_working_day"}
                />
              </label>
              <label>
                Type
                <select value={workForm.kind} onChange={(event) => setWorkForm({ ...workForm, kind: event.target.value as SlotKind })}>
                  {workTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </label>
              {workForm.splitMode === "specific_students" ? (
                <>
                  <label>
                    Students set name
                    <input value={workForm.studentGroup} onChange={(event) => setWorkForm({ ...workForm, studentGroup: event.target.value })} placeholder="CS students / Bio students" />
                  </label>
                  <label>
                    Sharing set name
                    <input value={workForm.parallelGroup} onChange={(event) => setWorkForm({ ...workForm, parallelGroup: event.target.value })} placeholder="12-A elective period" />
                  </label>
                </>
              ) : null}
            </div>
            <p className="helperText">For regular subjects like Physics/Chemistry that must appear daily, choose “Must come every working day”. For subjects like Tamil/English that come only some days, choose “Use periods per week”.</p>

            <button className="secondary" onClick={addTeacherWork}>Add handled work</button>
          </div>

          <div className="summaryGrid">
            <div><span>Classes found</span><strong>{classNames.length || "None"}</strong></div>
            <div><span>Teachers</span><strong>{setup.teachers.length}</strong></div>
            <div><span>Handled entries</span><strong>{setup.teachers.reduce((sum, teacher) => sum + teacher.assignments.length, 0)}</strong></div>
          </div>

          <div className="listCards">
            {setup.teachers.length ? setup.teachers.map((teacher) => (
              <article className="listCard teacherCard" key={teacher.id}>
                <div>
                  <h3>{teacher.name}</h3>
                  <p>Maximum {teacher.maxPeriodsPerDay} periods/day · one free period/day protected automatically</p>
                  <div className="tableMini">
                    {teacher.assignments.length ? teacher.assignments.map((work) => (
                      <div key={work.id}>
                        <span>{work.className}</span>
                        <strong>{work.subject}{formatGroup(work.studentGroup)} · {work.frequency === "must_every_working_day" ? "must daily" : `${work.weeklyPeriods}/week`}{work.splitMode === "specific_students" && work.parallelGroup ? ` · shares: ${work.parallelGroup}` : ""}</strong>
                        <button onClick={() => removeTeacherWork(teacher.id, work.id)}>Remove</button>
                      </div>
                    )) : <p className="emptyText">No handled work added for this teacher.</p>}
                  </div>
                </div>
                <button onClick={() => removeTeacher(teacher.id)}>Remove teacher</button>
              </article>
            )) : <p className="emptyText">Add teachers first.</p>}
          </div>
        </section>
      ) : null}

      {activeStep === "generate" ? (
        <section className="panel actionPanel">
          <div>
            <p className="eyebrow">Step 3</p>
            <h2>Generate timetable</h2>
            <p>The same generated schedule will be shown in two ways: teacher timetable and class timetable.</p>
          </div>
          <div className="actionButtons">
            <button className="primary big" onClick={startGenerate} disabled={!canGenerate}>Start generate</button>
            <button onClick={() => window.print()} disabled={!result}>Print / Save</button>
            <button onClick={exportTeacherCsv} disabled={!result}>Export teacher CSV</button>
            <button onClick={exportClassCsv} disabled={!result}>Export class CSV</button>
            <button onClick={resetAll}>Reset</button>
          </div>
          {!canGenerate ? <p className="helperText">Complete school details and teacher handled work first.</p> : null}
        </section>
      ) : null}

      {result ? (
        <section className="results">
          <div className="stats">
            <div><strong>{result.summary.teacherCount}</strong><span>Teachers</span></div>
            <div><strong>{result.summary.classCount}</strong><span>Classes</span></div>
            <div><strong>{result.summary.teachingPeriodsPlaced}</strong><span>Placed</span></div>
            <div><strong>{result.summary.teachingPeriodsNotPlaced}</strong><span>Not placed</span></div>
          </div>

          <section className="panel">
            <div className="panelHeader">
              <div>
                <p className="eyebrow">Review</p>
                <h2>Generation report</h2>
              </div>
            </div>
            <div className="issueList">
              {result.issues.map((issue, index) => (
                <article key={`${issue.title}-${index}`} className={`issue ${issue.type}`}>
                  <strong>{issue.title}</strong>
                  <p>{issue.message}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panelHeader">
              <div>
                <p className="eyebrow">Timetable</p>
                <h2>Teacher timetable</h2>
              </div>
            </div>

            {teacherCellsByTeacher.map(({ teacher, cells }) => (
              <article className="timetableBlock" key={teacher.id}>
                <h3>{teacher.name}</h3>
                <div className="tableWrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Day</th>
                        {periodOptions(setup.timing.periodsPerDay).map((period) => <th key={period}>P{period}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {setup.timing.workingDays.map((day) => (
                        <tr key={day}>
                          <td className="dayCell">{day}</td>
                          {periodOptions(setup.timing.periodsPerDay).map((period) => {
                            const cell = cells.find((item) => item.day === day && item.period === period);
                            return (
                              <td key={period} className={`${cell?.kind || "free"} ${cell?.locked ? "locked" : ""}`}>
                                <strong>{cell?.label || "Free"}</strong>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}
          </section>

          <section className="panel">
            <div className="panelHeader">
              <div>
                <p className="eyebrow">Students</p>
                <h2>Class timetable</h2>
              </div>
            </div>

            {classCellsByClass.map(({ className, cells }) => (
              <article className="timetableBlock" key={className}>
                <h3>{className}</h3>
                <div className="tableWrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Day</th>
                        {periodOptions(setup.timing.periodsPerDay).map((period) => <th key={period}>P{period}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {setup.timing.workingDays.map((day) => (
                        <tr key={day}>
                          <td className="dayCell">{day}</td>
                          {periodOptions(setup.timing.periodsPerDay).map((period) => {
                            const cell = cells.find((item) => item.day === day && item.period === period);
                            return (
                              <td key={period} className={`${cell?.kind || "free"} ${cell?.locked ? "locked" : ""}`}>
                                <strong>{cell?.label || "Free"}</strong>
                                {cell?.entries?.length ? (
                                  <span>
                                    {cell.entries.map((entry) => `${teacherName(setup.teachers, entry.teacherId)}${formatGroup(entry.studentGroup)}`).join(" / ")}
                                  </span>
                                ) : cell?.teacherId ? <span>{teacherName(setup.teachers, cell.teacherId)}</span> : null}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}
          </section>
        </section>
      ) : null}
    </main>
  );
}
