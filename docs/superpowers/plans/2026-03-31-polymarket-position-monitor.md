# Polymarket Position Monitor Implementation Plan

> Note: the shipped implementation has since been simplified. It now compares only against `prev1`, stores only the latest successful snapshot, and uses numbered multi-line position rendering in Telegram with up to four semicolon-delimited fields per line. See `docs/technical-architecture.zh-CN.md` for the latest behavior.

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a JavaScript GitHub Actions monitor that fetches public Polymarket positions every 3 hours, sends a full Telegram portfolio summary, and stores only the latest 3 snapshots on a dedicated state branch.

**Architecture:** A scheduled GitHub Actions workflow runs a small Node.js program. The workflow materializes the latest state file from `monitor-state`, the program fetches and normalizes current positions, computes deltas versus the previous 2 successful pushes, formats readable Telegram messages, sends them, and the workflow commits the updated `state/state.json` back to `monitor-state` only after a successful send.

**Tech Stack:** JavaScript, Node.js built-in `fetch`, Node test runner (`node:test`), GitHub Actions, Telegram Bot API, Polymarket public data API, git state branch persistence.

---

## Chunk 1: Bootstrap Repository And Runtime

### Task 1: Initialize repository basics

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `state/.gitkeep`

- [ ] **Step 1: Initialize git and npm metadata**

Run:

```bash
git init
npm init -y
```

Expected:

- `.git/` exists
- `package.json` exists

- [ ] **Step 2: Write the base `package.json` scripts**

Add scripts:

```json
{
  "type": "module",
  "scripts": {
    "start": "node src/main.js",
    "test": "node --test"
  }
}
```

Expected:

- `npm test` will use the built-in Node test runner

- [ ] **Step 3: Add `.gitignore`**

Add:

```gitignore
node_modules/
.env
.DS_Store
state/state.json
```

Expected:

- Local state file is ignored on the default branch

- [ ] **Step 4: Add `state/.gitkeep`**

Expected:

- The `state/` directory exists in the working tree

- [ ] **Step 5: Verify the bootstrap files**

Run:

```bash
ls -la
cat package.json
cat .gitignore
```

Expected:

- Repository metadata and ignore rules are present

- [ ] **Step 6: Commit bootstrap**

Run:

```bash
git add package.json .gitignore state/.gitkeep
git commit -m "chore: bootstrap repository"
```

Expected:

- Initial commit succeeds

## Chunk 2: Add Core Fetch And Snapshot Logic

### Task 2: Add configuration and Polymarket fetch tests

**Files:**
- Create: `src/config.js`
- Create: `src/fetchPm.js`
- Create: `tests/config.test.js`
- Create: `tests/fetchPm.test.js`

- [ ] **Step 1: Write failing config tests**

Add tests for:

- required env vars exist
- address normalization is stable
- missing secrets throw clear errors

Run:

```bash
npm test -- tests/config.test.js
```

Expected:

- FAIL because config module does not exist yet

- [ ] **Step 2: Write failing Polymarket fetch tests**

Add tests for:

- valid HTTP response is parsed
- timeout or non-200 response throws
- malformed JSON throws

Run:

```bash
npm test -- tests/fetchPm.test.js
```

Expected:

- FAIL because fetch module does not exist yet

- [ ] **Step 3: Implement `src/config.js`**

Implement:

- `loadConfig(env = process.env)`
- required keys: `PM_ADDRESS`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
- optional key: `TZ`, default `Asia/Shanghai`

- [ ] **Step 4: Implement `src/fetchPm.js`**

Implement:

- public API request helpers
- one retry with short backoff
- timeout using `AbortController`
- shape validation for required fields

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm test -- tests/config.test.js tests/fetchPm.test.js
```

Expected:

- PASS

- [ ] **Step 6: Commit core fetch logic**

Run:

```bash
git add src/config.js src/fetchPm.js tests/config.test.js tests/fetchPm.test.js
git commit -m "feat: add config and polymarket fetch logic"
```

Expected:

- Commit succeeds

### Task 3: Add snapshot normalization tests and implementation

**Files:**
- Create: `src/buildSnapshot.js`
- Create: `tests/buildSnapshot.test.js`

- [ ] **Step 1: Write failing snapshot tests**

Cover:

- active positions are normalized into the internal model
- total value is parsed
- cost basis and pnl are preserved or derived safely
- stable position keys are built consistently
- snapshots sort positions by value descending

Run:

```bash
npm test -- tests/buildSnapshot.test.js
```

Expected:

- FAIL because snapshot builder does not exist yet

- [ ] **Step 2: Implement `src/buildSnapshot.js`**

Implement:

- `buildSnapshot({ address, fetchedAt, totalValue, positions })`
- `buildPositionKey(rawPosition)`
- current position fields:
  - `id`
  - `market`
  - `outcome`
  - `shares`
  - `avgPrice`
  - `currentPrice`
  - `value`
  - `costBasis`
  - `pnl`

- [ ] **Step 3: Run snapshot tests**

Run:

```bash
npm test -- tests/buildSnapshot.test.js
```

Expected:

- PASS

- [ ] **Step 4: Commit snapshot logic**

Run:

```bash
git add src/buildSnapshot.js tests/buildSnapshot.test.js
git commit -m "feat: add snapshot normalization"
```

Expected:

- Commit succeeds

## Chunk 3: Add Diffing And Formatting

### Task 4: Add diff calculation tests and implementation

**Files:**
- Create: `src/buildDiff.js`
- Create: `tests/buildDiff.test.js`

- [ ] **Step 1: Write failing diff tests**

Cover:

- first run with no previous snapshots
- second run with only `prev1`
- third run with both `prev1` and `prev2`
- unchanged positions
- changed positions
- new positions
- closed positions

Run:

```bash
npm test -- tests/buildDiff.test.js
```

Expected:

- FAIL because diff builder does not exist yet

- [ ] **Step 2: Implement `src/buildDiff.js`**

Implement:

- portfolio summary deltas
- per-position deltas for:
  - `value`
  - `currentPrice`
  - `shares`
- `NEW` markers
- `closedSincePrev1` list

- [ ] **Step 3: Run diff tests**

Run:

```bash
npm test -- tests/buildDiff.test.js
```

Expected:

- PASS

- [ ] **Step 4: Commit diff logic**

Run:

```bash
git add src/buildDiff.js tests/buildDiff.test.js
git commit -m "feat: add snapshot diff logic"
```

Expected:

- Commit succeeds

### Task 5: Add Telegram message formatting tests and implementation

**Files:**
- Create: `src/formatMessage.js`
- Create: `tests/formatMessage.test.js`

- [ ] **Step 1: Write failing formatter tests**

Cover:

- summary block rendering
- per-position block rendering
- `prev1` and `prev2` deltas
- `NEW` and `N/A` markers
- closed positions block
- multi-message split before Telegram length limit

Run:

```bash
npm test -- tests/formatMessage.test.js
```

Expected:

- FAIL because formatter does not exist yet

- [ ] **Step 2: Implement `src/formatMessage.js`**

Implement:

- money and cents formatting helpers
- Beijing time rendering
- message chunking with ordered headers
- stable position sort by current value descending

- [ ] **Step 3: Run formatter tests**

Run:

```bash
npm test -- tests/formatMessage.test.js
```

Expected:

- PASS

- [ ] **Step 4: Commit formatter logic**

Run:

```bash
git add src/formatMessage.js tests/formatMessage.test.js
git commit -m "feat: add telegram message formatting"
```

Expected:

- Commit succeeds

## Chunk 4: Add Send Flow And Main Orchestration

### Task 6: Add Telegram sender tests and implementation

**Files:**
- Create: `src/sendTelegram.js`
- Create: `tests/sendTelegram.test.js`

- [ ] **Step 1: Write failing sender tests**

Cover:

- sends one message successfully
- sends multiple message parts in order
- throws on Telegram API failure

Run:

```bash
npm test -- tests/sendTelegram.test.js
```

Expected:

- FAIL because sender module does not exist yet

- [ ] **Step 2: Implement `src/sendTelegram.js`**

Implement:

- `sendTelegramMessages({ token, chatId, messages, fetchImpl })`
- strict API response checking
- clear error message with HTTP status and Telegram response summary

- [ ] **Step 3: Run sender tests**

Run:

```bash
npm test -- tests/sendTelegram.test.js
```

Expected:

- PASS

- [ ] **Step 4: Commit Telegram sender**

Run:

```bash
git add src/sendTelegram.js tests/sendTelegram.test.js
git commit -m "feat: add telegram sender"
```

Expected:

- Commit succeeds

### Task 7: Add main workflow integration tests and implementation

**Files:**
- Create: `src/main.js`
- Create: `tests/main.test.js`

- [ ] **Step 1: Write failing orchestration tests**

Cover:

- first run with empty state
- run with `prev1` and `prev2`
- send failure does not return updated state
- fetch failure bubbles up and preserves state

Run:

```bash
npm test -- tests/main.test.js
```

Expected:

- FAIL because main orchestrator does not exist yet

- [ ] **Step 2: Implement `src/main.js`**

Implement:

- read local `state/state.json` if present
- load config
- fetch public data
- build current snapshot
- compute diffs
- format messages
- send Telegram messages
- emit updated 3-snapshot state
- write `state/state.json` only after send succeeds

- [ ] **Step 3: Run orchestration tests**

Run:

```bash
npm test -- tests/main.test.js
```

Expected:

- PASS

- [ ] **Step 4: Run all tests**

Run:

```bash
npm test
```

Expected:

- PASS

- [ ] **Step 5: Commit orchestration**

Run:

```bash
git add src/main.js tests/main.test.js state/.gitkeep
git commit -m "feat: add monitor orchestration"
```

Expected:

- Commit succeeds

## Chunk 5: Add GitHub Actions Scheduling And State Branch Persistence

### Task 8: Add scheduled workflow

**Files:**
- Create: `.github/workflows/polymarket-monitor.yml`

- [ ] **Step 1: Write the workflow file**

Include:

- `workflow_dispatch`
- `schedule` with:

```yaml
- cron: '0 1,4,7,10,13,16,19,22 * * *'
```

- Node setup
- dependency install
- default-branch checkout
- `monitor-state` fetch and restore logic
- monitor script execution
- `monitor-state` commit and push logic

- [ ] **Step 2: Add state restore shell steps**

Implement shell steps that:

- fetch `origin/monitor-state` if it exists
- restore `state/state.json` from that branch into the workspace
- create an empty state file if the branch or file is missing

Suggested commands:

```bash
mkdir -p state
git fetch origin monitor-state:monitor-state || true
git show monitor-state:state/state.json > state/state.json || echo '{"address":"","snapshots":[]}' > state/state.json
```

- [ ] **Step 3: Add state save shell steps**

Implement shell steps that:

- switch to a temporary local branch based on `monitor-state`
- commit only `state/state.json`
- push to `origin monitor-state`

Suggested commands:

```bash
git fetch origin monitor-state:monitor-state || true
git switch --create monitor-state-work monitor-state 2>/dev/null || git switch --orphan monitor-state-work
mkdir -p state
cp "$GITHUB_WORKSPACE/state/state.json" state/state.json
git add state/state.json
git commit -m "chore: update monitor state" || true
git push origin HEAD:monitor-state --force-with-lease
```

- [ ] **Step 4: Validate workflow syntax locally**

Run:

```bash
sed -n '1,240p' .github/workflows/polymarket-monitor.yml
```

Expected:

- The workflow contains the intended schedule and state persistence steps

- [ ] **Step 5: Commit workflow**

Run:

```bash
git add .github/workflows/polymarket-monitor.yml
git commit -m "ci: add scheduled polymarket monitor workflow"
```

Expected:

- Commit succeeds

### Task 9: Add execution notes

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write concise setup instructions**

Document:

- required secrets
- how to trigger `workflow_dispatch`
- what `monitor-state` stores
- expected Telegram output

- [ ] **Step 2: Verify README accuracy**

Run:

```bash
sed -n '1,240p' README.md
```

Expected:

- Setup instructions match the implemented workflow

- [ ] **Step 3: Commit docs**

Run:

```bash
git add README.md
git commit -m "docs: add monitor setup instructions"
```

Expected:

- Commit succeeds

## Chunk 6: Verification

### Task 10: Manual end-to-end verification

**Files:**
- Verify: `.github/workflows/polymarket-monitor.yml`
- Verify: `state/state.json`

- [ ] **Step 1: Add repository secrets**

Configure:

- `PM_ADDRESS`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

Expected:

- Workflow has the required runtime secrets

- [ ] **Step 2: Trigger the workflow manually**

Run:

```bash
gh workflow run polymarket-monitor.yml
```

Expected:

- A workflow run starts successfully

- [ ] **Step 3: Inspect run logs**

Check:

- Polymarket fetch succeeded
- Telegram send succeeded
- state update step ran only after successful send

- [ ] **Step 4: Verify Telegram output**

Expected:

- Summary block is readable on mobile
- Every active position appears
- Each position includes current fields and `prev1` / `prev2` delta fields

- [ ] **Step 5: Verify state branch output**

Run:

```bash
git fetch origin monitor-state:monitor-state
git show monitor-state:state/state.json
```

Expected:

- `state/state.json` contains at most 3 snapshots
- The latest snapshot matches the just-sent Telegram output

- [ ] **Step 6: Final commit if needed**

Run:

```bash
git status
```

Expected:

- Working tree is clean or only contains intentional follow-up edits
