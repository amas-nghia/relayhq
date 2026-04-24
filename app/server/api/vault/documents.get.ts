import { defineEventHandler } from "h3";
import { crawlGenericDocuments } from "../../services/vault/crawl";

export default defineEventHandler(async (event) => {
  try {
    const docs = await crawlGenericDocuments();
    return docs;
  } catch (error) {
    return [];
  }
});
