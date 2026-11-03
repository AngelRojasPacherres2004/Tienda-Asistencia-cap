import http from "node:http";
import { gzipSync } from "node:zlib";

// This entry point is local-only; inherited Netlify context must not hide local report files.
process.env.CONTEXT = "dev";
const { handler } = await import("../netlify/functions/api.js");
const apiPort = Number(process.env.DASHBOARD_DEV_API_PORT || 8788);

const server = http.createServer(async (request, response) => {
  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const url = new URL(request.url, `http://127.0.0.1:${apiPort}`);
    const result = await handler({
      httpMethod: request.method,
      path: url.pathname,
      headers: request.headers,
      queryStringParameters: Object.fromEntries(url.searchParams),
      body: chunks.length ? Buffer.concat(chunks).toString("utf8") : null,
    });
    response.statusCode = result.statusCode;
    for (const [key, value] of Object.entries(result.headers || {})) {
      if (!["connection", "content-length", "keep-alive", "transfer-encoding"].includes(key.toLowerCase())) response.setHeader(key, value);
    }
    let responseBody = result.isBase64Encoded
      ? Buffer.from(result.body || "", "base64")
      : Buffer.from(result.body || "", "utf8");
    const acceptsGzip = String(request.headers["accept-encoding"] || "").includes("gzip");
    if (acceptsGzip && responseBody.byteLength >= 32 * 1024 && !response.hasHeader("Content-Encoding")) {
      responseBody = gzipSync(responseBody, { level: 6 });
      response.setHeader("Content-Encoding", "gzip");
      response.setHeader("Vary", "Accept-Encoding");
    }
    // Vite's proxy needs an exact byte length. Leaving this implicit caused some
    // larger JSON responses to remain open until the browser aborted the request.
    response.setHeader("Content-Length", responseBody.byteLength);
    response.setHeader("Connection", "close");
    response.end(responseBody);
  } catch (error) {
    if (response.headersSent) return response.destroy(error);
    const body = Buffer.from(JSON.stringify({ error: "No se pudo completar la consulta local." }), "utf8");
    response.writeHead(500, { "Content-Type": "application/json; charset=utf-8", "Content-Length": body.byteLength, "Connection": "close" });
    response.end(body);
    console.error("Error en API local:", error);
  }
});

server.listen(apiPort, "127.0.0.1", () => {
  console.log(`API local disponible en http://127.0.0.1:${apiPort}`);
});
