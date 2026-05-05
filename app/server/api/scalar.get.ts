import { defineEventHandler, setHeader } from "h3";

// Serves Scalar API Reference UI loaded from CDN.
// Spec is fetched client-side from /api/openapi.json.
export default defineEventHandler((event) => {
  setHeader(event, "Content-Type", "text/html; charset=utf-8");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>RelayHQ API Reference</title>
</head>
<body>
  <script id="api-reference" data-url="/api/openapi.json"></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`;
});
