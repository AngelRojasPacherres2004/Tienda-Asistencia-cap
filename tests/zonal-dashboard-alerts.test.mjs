import assert from "node:assert/strict";
import test from "node:test";
import { createOperationsDomain } from "../netlify/domains/operations.js";

test("zonal dashboard alerts query only the assigned stores", async () => {
  const requests = [];
  const domain = createOperationsDomain({
    createSecurityDomain: () => ({}),
    zonalStoreIds: async id => {
      assert.equal(id, 42);
      return [7, 9];
    },
    activeStoreIds: async () => { throw new Error("Global scope requested"); },
    supabase: {
      from(table) {
        const query = {
          select() { return query; },
          in(column, ids) { requests.push({ table, column, ids }); return query; },
          order() { return query; },
        };
        return query;
      },
    },
    fetchAllReportPages: async () => [],
  });
  assert.deepEqual(await domain.executiveAlerts({ id: 42, rol: "jefe_zonal" }), {
    incidents: [], documents: [],
  });
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.column, "tienda_id");
    assert.deepEqual(request.ids, [7, 9]);
  }
});
