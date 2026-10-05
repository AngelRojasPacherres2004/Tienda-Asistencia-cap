import test from "node:test";
import assert from "node:assert/strict";
import { readRows } from "../netlify/lib/read-rows.js";

test("totals include more than 1000 records and the final partial page", async () => {
  const records = Array.from({ length: 2305 }, (_, id) => ({ id, cantidad: id >= 1000 ? 2 : 1 }));
  const ranges = [];
  const rows = await readRows({ range(from, to) { ranges.push([from, to]); return { data: records.slice(from, to + 1), error: null }; } });
  assert.deepEqual(ranges, [[0, 999], [1000, 1999], [2000, 2999]]);
  assert.equal(rows.length, 2305);
  assert.equal(rows.reduce((sum, row) => sum + row.cantidad, 0), 3610);
});
test("an error on a later page cannot be displayed as a partial total", async () => {
  const error = new Error("Page unavailable");
  await assert.rejects(readRows({ range(from) { return from === 0 ? { data: Array(1000).fill({}), error: null } : { data: null, error }; } }), /Page unavailable/);
});
