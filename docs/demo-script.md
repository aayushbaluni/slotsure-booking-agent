# Demo video script (2–3 minutes)

Build spec §13.

1. 0:00 — Agent page, demo banner visible. "I want to talk about building a booking app, tomorrow evening."
2. 0:15 — Agent collects project type + a two-sentence brief; asks for no contact details.
3. 0:30 — Slots offered; the dashboard beside it shows the same free times.
4. 0:45 — Pick one, review card, "yes" → reference + code; booking appears in the dashboard.
5. 1:00 — Second browser: try the same slot → "nothing was booked" + alternatives.
6. 1:15 — Dashboard "Run the race": 1 created, 9 rejected.
7. 1:30 — Fault fail_after_commit, book: "I couldn't verify…", one automatic re-check with the same request, the one booking reported; dashboard still shows one row.
8. 1:55 — Fault error_503: "That didn't go through — nothing was booked."
9. 2:10 — Cancel with reference + code; the slot reappears.
10. 2:30 — Test run in the terminal, all green. End.
