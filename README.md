# vibe-polymarket-monitor

Minimal bootstrap for a Polymarket position monitor that will later run on GitHub Actions and push updates to Telegram.

## What is here

- `docs/` contains the design and implementation plan already written for this project.
- `src/` is reserved for the monitor implementation.
- `tests/` is reserved for automated tests.

## Setup

No external runtime dependencies are added yet on purpose. The planned implementation uses Node.js built-ins first and will only add packages if a real gap appears during feature work.

Planned environment variables:

- `PM_ADDRESS`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

## Next step

Implement the monitor logic described in `docs/superpowers/specs/2026-03-31-polymarket-position-monitor-design.md`.

The implementation plan is saved at `docs/superpowers/plans/2026-03-31-polymarket-position-monitor.md`.
