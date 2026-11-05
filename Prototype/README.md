# SedHub clickable prototype

Open **index.html** in a browser (double-click it; no server needed).

- 23 screens captured from the running app on 5 Nov 2026 with the sample data (projects ATLAS, NOVA, ORION), at 1440×900, plus the sign-in page on a phone (390×844).
- Click the highlighted areas to move between screens as in the app (top menu, project sidebar, tasks, Sign out); click anywhere else to flash them.
- Keys: ← / → previous and next screen, H to show all clickable areas.
- Screens are grouped: Sign-in, Admin and managers, Project space, Task, Member, Viewer. Each shows which roles see it and a one-line note.

Files:
- `index.html` – the viewer (the screen list and clickable areas are built in).
- `screens/` – the screenshots (PNG).
- `screens.json` – each screen's title, role, note and clickable areas, in screenshot pixels.

To refresh it after the app changes, ask Claude to regenerate the prototype.
