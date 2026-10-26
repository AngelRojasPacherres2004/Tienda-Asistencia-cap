export function createReportQueries({ readRows, dbError }) {
  async function fetchAllReportPages(request, pageSize = 1000) {
    try { return await readRows(request, pageSize); }
    catch (error) { throw dbError(error); }
  }

  async function readAllResult(request, orderColumn = "id") {
    return { data: await fetchAllReportPages(request.order(orderColumn)), error: null };
  }

  return { readAllResult, fetchAllReportPages };
}
