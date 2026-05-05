import { defineEventHandler, setHeader } from "h3";
import { generateOpenApiSpec } from "../lib/openapi/spec";

export default defineEventHandler((event) => {
  setHeader(event, "Content-Type", "application/json");
  setHeader(event, "Access-Control-Allow-Origin", "*");
  return generateOpenApiSpec();
});
