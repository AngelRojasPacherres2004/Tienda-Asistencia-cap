import http from "node:http";
import { handler } from "../netlify/functions/api.js";

const server = http.createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const url = new URL(request.url, "http://127.0.0.1:8788");
  const result = await handler({
    httpMethod: request.method,
    path: url.pathname,
    headers: request.headers,
    queryStringParameters: Object.fromEntries(url.searchParams),
    body: chunks.length ? Buffer.concat(chunks).toString("utf8") : null,
  });
  response.statusCode = result.statusCode;
  for (const [key, value] of Object.entries(result.headers || {})) response.setHeader(key, value);
  const responseBody = result.isBase64Encoded
    ? Buffer.from(result.body || "", "base64")
    : result.body || "";
  response.end(responseBody);
});

server.listen(8788, "127.0.0.1", () => {
  console.log("API local disponible en http://127.0.0.1:8788");
});
