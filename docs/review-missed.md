# Reviewing Missed Questions

This app tracks lightweight, client‑side progress to help you focus on weak spots without server round‑trips.

## How it works

- Metrics are stored in `localStorage` under `scxmcl-question-metrics` with `{ seen, correct, incorrect }` per question.
- The Home screen offers “Practice missed questions” composed of questions with at least `N` incorrect attempts (configurable). You can clear only the incorrect counters using “Reset missed counters”.
- The Results screen provides a “Retry Incorrect (N)” action to immediately launch a new session with only the items you missed in that session.

## Multi‑select results clarity

- All correct options are marked green.
- Wrong selections are marked red as “Your answer”.
- Correct options you did not select show a subtle “(not selected)” indicator.

## Tips

- Increase the threshold to focus on repeatedly troublesome questions.
- Use “Reset missed counters” periodically to refresh your study backlog without losing seen/correct history.

## Manual verification

1. Complete a quiz with several wrong answers, including multi‑select.
2. On Results, verify correct/selected/missed‑correct indicators and click “Retry Incorrect (N)”.
3. Confirm a new session starts with only those N questions.
4. From the Home screen, set threshold to 2+ and confirm the missed count updates.
5. Click “Reset missed counters” and confirm the missed count drops to 0 while seen/correct remain.

