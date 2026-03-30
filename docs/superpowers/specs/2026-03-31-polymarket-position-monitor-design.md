# Polymarket Position Monitor Design

> Note: the current implementation has been simplified from this initial design. It now compares only against `prev1`, stores only the latest successful snapshot, and formats each position as a single semicolon-delimited line. See `docs/technical-architecture.zh-CN.md` for the latest behavior.

## Goal

Build a small JavaScript-based monitor that runs on GitHub Actions every 3 hours, reads the user's public Polymarket positions, and pushes a clear Telegram summary of:

- The current portfolio total value
- Every active position's current details
- Each position's change versus the previous 2 pushed snapshots

The system should stay simple, avoid browser automation, and persist only the minimum state needed for the next push.

## Scope

### Included

- Fetch current Polymarket account positions from the public data API
- Push a Telegram message at each scheduled run
- Show all active positions in the message
- Show snapshot-to-snapshot deltas versus `prev1` and `prev2`
- Persist only the most recent 3 pushed snapshots
- Use GitHub Actions as the scheduler and execution runtime
- Store state in a dedicated git branch named `monitor-state`

### Excluded

- Intraday or real-time monitoring
- Pushing only on change
- Historical charts or long-term analytics
- Database storage
- Browser scraping of the Polymarket profile page
- Wallet access, signing, or private API usage

## Constraints And Assumptions

- Primary language is JavaScript.
- The current directory is empty and not yet a git repository.
- The monitor should run at every 3-hour boundary in Beijing time.
- GitHub Actions scheduled jobs may be delayed; the design accepts a delay of up to 15 minutes.
- Telegram messages must remain readable even if the account has many positions.
- Only active positions are included in the main portfolio section.

## Recommended Architecture

Use one GitHub Actions workflow and one Node.js entry script.

### Runtime flow

1. GitHub Actions starts on schedule.
2. Workflow checks out the default branch.
3. Workflow attempts to read `state/state.json` from `monitor-state`.
4. Node script fetches the latest Polymarket account data.
5. Node script normalizes positions into a stable snapshot shape.
6. Node script compares the current snapshot against the previous 2 pushed snapshots.
7. Node script formats one or more Telegram messages.
8. Node script sends the messages via Telegram Bot API.
9. If the send succeeds, the workflow updates `state/state.json` and pushes it to `monitor-state`.

### Why this architecture

- It avoids DOM parsing and uses a more stable public API source.
- It keeps application code separate from git branch persistence logic.
- It stores only the minimal state required for the next comparison.
- It keeps the implementation small enough to debug from Actions logs alone.

## File Layout

The implementation should stay focused and low-complexity.

- `package.json`
  - Node runtime metadata and scripts
- `.gitignore`
  - Ignore local state and logs
- `.github/workflows/polymarket-monitor.yml`
  - Scheduled workflow, state-branch load/save, and execution steps
- `src/main.js`
  - Entry point and top-level orchestration
- `src/config.js`
  - Read and validate environment variables
- `src/fetchPm.js`
  - Request and validate Polymarket public API responses
- `src/buildSnapshot.js`
  - Normalize API data into the internal snapshot shape
- `src/buildDiff.js`
  - Compare current snapshot against `prev1` and `prev2`
- `src/formatMessage.js`
  - Render Telegram-ready text and split long output
- `src/sendTelegram.js`
  - Send one or more Telegram messages
- `tests/*.test.js`
  - Unit tests for normalization, diffs, and message formatting
- `state/state.json`
  - Local state file materialized during the workflow and committed to `monitor-state`

## Data Source

Use Polymarket public data endpoints rather than the profile page.

### Required data

- Account total position value
- Active positions
- Position value
- Outcome side, such as `Yes` or `No`
- Average entry price
- Current price
- Shares size
- PnL if the API provides it, otherwise derive where safe

### API usage strategy

- Prefer direct JSON requests to Polymarket's public data API.
- Treat network calls as timeout-prone and retry once with a short backoff.
- Fail the run if the data cannot be fetched cleanly.
- Do not partially update state when fetch or send fails.

## Snapshot Model

Persist a single state file containing up to the most recent 3 successful pushed snapshots.

```json
{
  "address": "0x304160997e2d06fbfc0f54a8a714dc4cdf7b9e5f",
  "snapshots": [
    {
      "sentAt": "2026-03-31T00:00:07.000Z",
      "totalValue": 701.29,
      "positions": [
        {
          "id": "stable-position-id",
          "market": "EdgeX FDV above $1B one day after launch?",
          "outcome": "No",
          "shares": 333,
          "avgPrice": 0.749,
          "currentPrice": 0.945,
          "value": 314.69,
          "costBasis": 249.42,
          "pnl": 65.27
        }
      ]
    }
  ]
}
```

### Position identity

Each position must be matched across snapshots by a stable key. Prefer the public API position identifier. If the API shape does not provide a stable single field, build the key from:

- market or condition identifier
- outcome identifier or label

Do not match positions by display title alone if a stronger identifier exists.

## Fields Included In Pushes

Each active position should include these current fields:

- Market title
- Side: `Yes` or `No`
- Shares
- Average price
- Current price
- Current value
- Cost basis
- Unrealized PnL

Each active position should also include these comparison fields:

- Value delta versus `prev1`
- Value delta versus `prev2`
- Current price delta versus `prev1`
- Current price delta versus `prev2`
- Shares delta versus `prev1`
- Shares delta versus `prev2`

`avgPrice` usually stays constant, but it can change after adds or partial exits. When it changes, include the current value and reflect the effect through cost basis and PnL rather than a dedicated delta line to keep the message readable.

## Diff Logic

`prev1` means the immediately previous successful pushed snapshot. `prev2` means the snapshot before that.

### Per-position rules

- If the same position exists in current and prior snapshot:
  - Compute deltas on `value`, `currentPrice`, and `shares`
- If the position exists now but not in prior snapshot:
  - Mark as `NEW`
- If the position existed before but is missing now:
  - List it in a separate `Closed or missing since prev1` section

### Portfolio summary rules

Compute:

- Current total value
- Total value delta versus `prev1`
- Total value delta versus `prev2`
- Number of active positions

If `prev1` or `prev2` is not available, display `N/A`.

## Telegram Message Design

The message should optimize for fast scanning on mobile.

### Summary block

- Monitor name
- Account address in short form
- Push time in Beijing time
- Current total value
- Delta versus `prev1`
- Delta versus `prev2`
- Active position count

### Position block

For each active position, sorted by current value descending:

- Market title
- Side
- Shares
- Avg price
- Current price
- Value
- Cost basis
- PnL
- dValue vs `prev1` and `prev2`
- dPrice vs `prev1` and `prev2`
- dShares vs `prev1` and `prev2`

### Closed block

If any positions disappeared since `prev1`, include a short section showing:

- Market title
- Side
- Last known value
- Marked as `CLOSED / NOT ACTIVE`

### Message splitting

Telegram has a message size limit, so formatter logic should split output into multiple ordered messages when needed.

Rules:

- Keep the summary block in the first message
- Split only between position blocks
- Prefix continuation parts with `Part 2/N`, `Part 3/N`, and so on

## State Persistence

Store only the latest 3 pushed snapshots in `state/state.json` on the `monitor-state` branch.

### Why only 3 snapshots

- Satisfies the current comparison requirement
- Keeps state extremely small
- Avoids unnecessary repo history growth
- Keeps failure recovery simple

### Workflow persistence strategy

Before running the Node script:

- Fetch `monitor-state` if it exists
- Read `state/state.json` into the workspace
- If it does not exist, create an empty initial state

After a successful send:

- Replace `state/state.json` with the updated 3-snapshot state
- Commit only that file to `monitor-state`
- Push the branch back to origin

Do not push state updates if fetch, formatting, or Telegram send fails.

## Scheduling

The desired schedule is every 3 hours at minute `0` in Beijing time.

GitHub Actions cron uses UTC, so the workflow should run at:

```yaml
schedule:
  - cron: '0 1,4,7,10,13,16,19,22 * * *'
```

This corresponds to Beijing time:

- `00:00`
- `03:00`
- `06:00`
- `09:00`
- `12:00`
- `15:00`
- `18:00`
- `21:00`

Operational note:

- GitHub Actions scheduled jobs are not guaranteed to start exactly on time.
- The design accepts up to 15 minutes of delay.
- No extra guard loop is needed because the user explicitly wants `:00` schedule behavior rather than a compensating poll window.

## Error Handling

### Polymarket fetch failure

- Retry once
- If still failing, send a short Telegram alert if possible
- Exit with failure
- Keep old state unchanged

### Telegram send failure

- Exit with failure
- Keep old state unchanged

### Invalid or partial API payload

- Treat as failure
- Log enough detail to debug in Actions
- Do not write a new snapshot

### Missing previous snapshots

- First successful run:
  - Push full current snapshot
  - Show `N/A` for `prev1` and `prev2`
- Second successful run:
  - Show `prev1`
  - Show `N/A` for `prev2`

## Security And Secrets

Use GitHub Actions secrets for:

- `PM_ADDRESS`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

Optional repository variable:

- `TZ=Asia/Shanghai`

Do not store secrets in the repo, logs, or state file.

## Testing Strategy

Keep tests focused on logic, not infrastructure.

### Unit tests

- Snapshot normalization from raw API payloads
- Stable position key generation
- Diff calculations for unchanged, changed, new, and closed positions
- Message rendering and splitting logic

### Lightweight integration checks

- Run the main script against fixture data without network calls
- Validate that first-run and second-run message shapes are correct

### Manual verification

- Trigger the workflow manually once with real secrets
- Confirm Telegram output formatting on mobile
- Confirm `monitor-state` receives exactly one updated `state/state.json`

## Operational Notes

- Because the current directory is not yet a git repository, implementation should start by initializing git and creating the default branch before GitHub Actions setup.
- The state branch should be created lazily on the first successful push if it does not already exist.
- The message formatter should prefer clarity over compactness. Showing all active positions is more important than forcing a single-message output.

## Success Criteria

The design is successful when:

- A scheduled GitHub Actions run executes every 3 hours
- The workflow reads the public Polymarket account positions without browser automation
- Telegram receives a readable summary containing every active position
- Each position shows the requested current fields plus deltas versus the previous 2 pushes
- The repository stores only the latest 3 snapshots in `monitor-state`
- Failures do not overwrite the last good state
