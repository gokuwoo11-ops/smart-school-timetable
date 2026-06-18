# Smart School Timetable Generator

This is a user-friendly starter version for a school timetable product.

The app does not contain fixed school assumptions. The user enters:

- Working days
- Periods per day
- Common periods such as lunch, break, or assembly
- Classes and class-specific fixed periods
- Teachers
- Teacher daily/weekly workload
- Teacher free-period requirement
- Teacher unavailable periods
- Subjects/classes handled by each teacher

Then the user clicks **Start generate**.

The system creates:

- Teacher timetable
- Class timetable
- Generation report with clear issues

## Important product direction

This version avoids asking the user to create complex timetable rules. The user only enters normal school details. The hidden generator checks:

- One teacher cannot teach two classes at the same time
- One class cannot have two subjects at the same time
- Lunch/break/reserved periods are not used for teaching
- Teacher daily workload is respected
- Teacher weekly workload is respected when entered
- Teacher free-period requirement is respected
- Teacher unavailable periods are respected
- A teacher can handle multiple classes and subjects
- PT and ECA can be handled as teacher duties

## Run locally

```bash
npm install
npm run dev
```

Open the local address shown in the terminal.

## Current status

This is a starter generation app. It is built for improving the workflow and UI direction before adding accounts, database saving, advanced solver logic, and school admin permissions.
