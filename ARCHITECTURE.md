# Architecture Notes

## User workflow

1. School enters timing details.
2. School adds common periods such as lunch, break, or assembly.
3. School adds classes.
4. School adds class-specific fixed periods only when needed.
5. School adds teachers.
6. School adds what each teacher handles.
7. School clicks Start generate.
8. System creates teacher and class timetables from one schedule.

## Internal generation idea

The app turns the entered school details into scheduling constraints:

- A class cell can contain only one item.
- A teacher cell can contain only one item.
- Locked periods cannot be used for teaching.
- Teacher daily and weekly limits are checked.
- Teacher unavailable periods are blocked.
- The same generated placement appears in both the class timetable and teacher timetable.

## Why this direction

A school user should not need to understand technical rules like hard constraints, soft constraints, JSON, solver data, or prompt formatting. The app should ask simple questions and handle scheduling logic internally.

## Future upgrades

- Login and school accounts
- Save/load timetable data
- Manual adjustment after generation
- Advanced solver with stronger optimization
- Teacher substitution view
- Export templates
- Admin approval flow
- Smart assistant to convert uploaded school data into setup entries
