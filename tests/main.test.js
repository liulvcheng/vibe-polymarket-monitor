import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile } from "node:fs/promises";

import { runMonitor } from "../src/main.js";
import { buildAccountingSnapshotZip } from "./support/accountingSnapshot.js";

// End-to-end tests exercise the orchestration layer with a fully stubbed network.
const PROFILE_HTML = `
<!DOCTYPE html>
<html>
  <body>
    <script id="__NEXT_DATA__" type="application/json">
      {"props":{"pageProps":{"proxyAddress":"0xe48a00a7eaec1977fa9f72af4422c1628367dc27","username":"0utr1"}}}
    </script>
  </body>
</html>
`;

test("runMonitor performs a first run and stores one snapshot", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pm-monitor-"));
  const stateFilePath = path.join(tempDir, "state.json");
  const telegramMessages = [];

  const fetchImpl = async (url, options = {}) => {
    if (url.includes("/profile/")) {
      return new Response(PROFILE_HTML, { status: 200 });
    }

    if (url.includes("/v1/accounting/snapshot")) {
      return new Response(
        buildAccountingSnapshotZip({
          equityRows: [["25.000000", "150.000000", "175.000000", "2026-03-31T00:00:00Z"]],
        }),
        {
          status: 200,
          headers: { "content-type": "application/zip" },
        },
      );
    }

    if (url.includes("/positions?")) {
      return Response.json([
        {
          asset: "asset-1",
          conditionId: "condition-1",
          size: 100,
          avgPrice: 0.61,
          initialValue: 61,
          currentValue: 75,
          cashPnl: 14,
          percentPnl: 22.95,
          curPrice: 0.75,
          title: "Market A",
          outcome: "Yes",
          endDate: "2026-12-31",
          redeemable: false,
        },
      ]);
    }

    if (url.includes("/sendMessage")) {
      telegramMessages.push(JSON.parse(options.body).text);
      return Response.json({ ok: true, result: { message_id: 1 } });
    }

    throw new Error(`Unexpected URL: ${url}`);
  };

  const result = await runMonitor({
    config: {
      pmAddress: "0x304160997e2d06fbfc0f54a8a714dc4cdf7b9e5f",
      telegramBotToken: "token",
      telegramChatId: "chat",
      timezone: "Asia/Shanghai",
      stateFilePath,
    },
    fetchImpl,
  });

  assert.equal(result.messages.length, 1);
  assert.equal(telegramMessages.length, 1);
  assert.match(telegramMessages[0], /Polymarket Profile:\nhttps:\/\/polymarket\.com\/profile\//);
  assert.match(telegramMessages[0], /Open Positions Value: \$75\.00/);
  assert.match(telegramMessages[0], /Available Cash: \$25\.00/);
  assert.match(telegramMessages[0], /Total Equity: \$175\.00/);
  assert.match(telegramMessages[0], /Open Value Delta vs prev1: N\/A/);

  const savedState = JSON.parse(await readFile(stateFilePath, "utf8"));
  assert.equal(savedState.snapshots.length, 1);
  assert.equal(savedState.snapshots[0].positions[0].market, "Market A");
});

test("runMonitor keeps only the latest snapshot", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pm-monitor-"));
  const stateFilePath = path.join(tempDir, "state.json");
  let runNumber = 0;

  const fetchImpl = async (url, options = {}) => {
    if (url.includes("/profile/")) {
      return new Response(PROFILE_HTML, { status: 200 });
    }

    if (url.includes("/v1/accounting/snapshot")) {
      return new Response(
        buildAccountingSnapshotZip({
          equityRows: [[`${10 + runNumber}.000000`, `${100 + runNumber}.000000`, `${110 + runNumber}.000000`, "2026-03-31T00:00:00Z"]],
        }),
        {
          status: 200,
          headers: { "content-type": "application/zip" },
        },
      );
    }

    if (url.includes("/positions?")) {
      return Response.json([
        {
          asset: "asset-1",
          conditionId: "condition-1",
          size: 100 + runNumber,
          avgPrice: 0.61,
          initialValue: 61,
          currentValue: 70 + runNumber,
          cashPnl: 9 + runNumber,
          percentPnl: 22.95,
          curPrice: 0.7,
          title: "Market A",
          outcome: "Yes",
          redeemable: false,
        },
      ]);
    }

    if (url.includes("/sendMessage")) {
      return Response.json({ ok: true, result: { message_id: 1 } });
    }

    throw new Error(`Unexpected URL: ${url}`);
  };

  for (runNumber = 0; runNumber < 4; runNumber += 1) {
    await runMonitor({
      config: {
        pmAddress: "0x304160997e2d06fbfc0f54a8a714dc4cdf7b9e5f",
        telegramBotToken: "token",
        telegramChatId: "chat",
        timezone: "Asia/Shanghai",
        stateFilePath,
      },
      fetchImpl,
    });
  }

  const savedState = JSON.parse(await readFile(stateFilePath, "utf8"));
  assert.equal(savedState.snapshots.length, 1);
  assert.equal(savedState.snapshots[0].totalEquity, 113);
});

test("runMonitor does not persist state when Telegram send fails", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pm-monitor-"));
  const stateFilePath = path.join(tempDir, "state.json");

  const fetchImpl = async (url) => {
    if (url.includes("/profile/")) {
      return new Response(PROFILE_HTML, { status: 200 });
    }

    if (url.includes("/v1/accounting/snapshot")) {
      return new Response(
        buildAccountingSnapshotZip({
          equityRows: [["25.000000", "150.000000", "175.000000", "2026-03-31T00:00:00Z"]],
        }),
        {
          status: 200,
          headers: { "content-type": "application/zip" },
        },
      );
    }

    if (url.includes("/positions?")) {
      return Response.json([]);
    }

    if (url.includes("/sendMessage")) {
      return new Response(JSON.stringify({ ok: false, description: "chat not found" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    throw new Error(`Unexpected URL: ${url}`);
  };

  await assert.rejects(
    () =>
      runMonitor({
        config: {
          pmAddress: "0x304160997e2d06fbfc0f54a8a714dc4cdf7b9e5f",
          telegramBotToken: "token",
          telegramChatId: "chat",
          timezone: "Asia/Shanghai",
          stateFilePath,
        },
        fetchImpl,
      }),
    /Telegram send failed with HTTP 400: chat not found/,
  );

  await assert.rejects(() => readFile(stateFilePath, "utf8"), /ENOENT/);
});
