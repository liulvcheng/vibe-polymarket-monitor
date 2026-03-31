import test from "node:test";
import assert from "node:assert/strict";

import {
  extractProfileMetadataFromHtml,
  fetchPolymarketAccountData,
} from "../src/fetchPm.js";
import { buildAccountingSnapshotZip } from "./support/accountingSnapshot.js";

// Use a minimal profile shell because the parser only needs the embedded NEXT_DATA payload.
const PROFILE_HTML = `
<!DOCTYPE html>
<html>
  <body>
    <script id="__NEXT_DATA__" type="application/json">
      {
        "props": {
          "pageProps": {
            "proxyAddress": "0xe48a00a7eaec1977fa9f72af4422c1628367dc27",
            "username": "0utr1"
          }
        }
      }
    </script>
  </body>
</html>
`;

test("extractProfileMetadataFromHtml returns proxy address and username", () => {
  const metadata = extractProfileMetadataFromHtml(PROFILE_HTML);

  assert.deepEqual(metadata, {
    proxyAddress: "0xe48a00a7eaec1977fa9f72af4422c1628367dc27",
    username: "0utr1",
  });
});

test("extractProfileMetadataFromHtml throws when proxy address is missing", () => {
  assert.throws(
    () => extractProfileMetadataFromHtml("<html></html>"),
    /Unable to resolve proxyAddress from Polymarket profile HTML/,
  );
});

test("fetchPolymarketAccountData resolves profile metadata and account payloads", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);

    if (url.includes("/profile/")) {
      return new Response(PROFILE_HTML, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }

    if (url.includes("/v1/accounting/snapshot")) {
      return new Response(
        buildAccountingSnapshotZip({
          equityRows: [
            ["125.500000", "701.375733", "826.875733", "2026-03-31T00:00:00Z"],
          ],
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
          proxyWallet: "0xe48a00a7eaec1977fa9f72af4422c1628367dc27",
          asset: "asset-1",
          conditionId: "condition-1",
          size: 333,
          avgPrice: 0.749038,
          initialValue: 249.429654,
          currentValue: 313.02,
          cashPnl: 63.590346,
          percentPnl: 25.49,
          totalBought: 333,
          realizedPnl: 0,
          curPrice: 0.94,
          title: "EdgeX FDV above $1B one day after launch?",
          slug: "edgex-fdv-above-1b",
          eventSlug: "edgex-fdv",
          icon: "https://example.com/icon.png",
          outcome: "No",
          outcomeIndex: 1,
          endDate: "2027-01-01",
          redeemable: false,
          negativeRisk: false,
        },
      ]);
    }

    throw new Error(`Unexpected URL: ${url}`);
  };

  const result = await fetchPolymarketAccountData({
    address: "0x304160997e2d06fbfc0f54a8a714dc4cdf7b9e5f",
    fetchImpl,
  });

  assert.equal(result.address, "0x304160997e2d06fbfc0f54a8a714dc4cdf7b9e5f");
  assert.equal(result.proxyAddress, "0xe48a00a7eaec1977fa9f72af4422c1628367dc27");
  assert.equal(result.username, "0utr1");
  assert.equal(result.cashBalance, 125.5);
  assert.equal(result.positionsValue, 701.38);
  assert.equal(result.totalEquity, 826.88);
  assert.equal(result.positions.length, 1);
  assert.match(calls[0], /\/profile\/0x304160997e2d06fbfc0f54a8a714dc4cdf7b9e5f$/);
  assert.match(calls[1], /\/v1\/accounting\/snapshot\?user=0xe48a00a7eaec1977fa9f72af4422c1628367dc27$/);
  assert.match(
    calls[2],
    /\/positions\?user=0xe48a00a7eaec1977fa9f72af4422c1628367dc27&sortBy=CURRENT&sortDirection=DESC&sizeThreshold=0&limit=500&offset=0$/,
  );
});

test("fetchPolymarketAccountData paginates positions until exhaustion", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);

    if (url.includes("/profile/")) {
      return new Response(PROFILE_HTML, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }

    if (url.includes("/v1/accounting/snapshot")) {
      return new Response(
        buildAccountingSnapshotZip({
          equityRows: [["10.000000", "123.000000", "133.000000", "2026-03-31T00:00:00Z"]],
        }),
        {
          status: 200,
          headers: { "content-type": "application/zip" },
        },
      );
    }

    if (url.includes("/positions?") && url.includes("offset=0")) {
      return Response.json(
        Array.from({ length: 500 }, (_, index) => ({
          asset: `asset-${index}`,
          conditionId: `condition-${index}`,
          size: 1,
          avgPrice: 0.1,
          currentValue: 1,
          curPrice: 0.1,
          title: `Market ${index}`,
          outcome: "Yes",
        })),
      );
    }

    if (url.includes("/positions?") && url.includes("offset=500")) {
      return Response.json([
        {
          asset: "asset-final",
          conditionId: "condition-final",
          size: 2,
          avgPrice: 0.2,
          currentValue: 2,
          curPrice: 0.2,
          title: "Market Final",
          outcome: "No",
        },
      ]);
    }

    throw new Error(`Unexpected URL: ${url}`);
  };

  const result = await fetchPolymarketAccountData({
    address: "0x304160997e2d06fbfc0f54a8a714dc4cdf7b9e5f",
    fetchImpl,
  });

  assert.equal(result.positions.length, 501);
  assert.ok(calls.some((url) => url.includes("offset=500")));
});

test("fetchPolymarketAccountData retries once on transient fetch failures", async () => {
  let attempts = 0;
  const fetchImpl = async (url) => {
    attempts += 1;

    if (url.includes("/profile/")) {
      if (attempts === 1) {
        throw new Error("temporary network issue");
      }

      return new Response(PROFILE_HTML, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }

    if (url.includes("/v1/accounting/snapshot")) {
      return new Response(
        buildAccountingSnapshotZip({
          equityRows: [["10.000000", "100.000000", "110.000000", "2026-03-31T00:00:00Z"]],
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

    throw new Error(`Unexpected URL: ${url}`);
  };

  const result = await fetchPolymarketAccountData({
    address: "0x304160997e2d06fbfc0f54a8a714dc4cdf7b9e5f",
    fetchImpl,
    retryCount: 1,
    retryDelayMs: 0,
  });

  assert.equal(result.totalEquity, 110);
  assert.equal(attempts, 4);
});

test("fetchPolymarketAccountData throws on empty accounting payloads", async () => {
  const fetchImpl = async (url) => {
    if (url.includes("/profile/")) {
      return new Response(PROFILE_HTML, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }

    if (url.includes("/v1/accounting/snapshot")) {
      return new Response(
        buildAccountingSnapshotZip({
          equityRows: [],
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

    throw new Error(`Unexpected URL: ${url}`);
  };

  await assert.rejects(
    () =>
      fetchPolymarketAccountData({
        address: "0x304160997e2d06fbfc0f54a8a714dc4cdf7b9e5f",
        fetchImpl,
      }),
    /Polymarket accounting snapshot must contain at least one equity row/,
  );
});
