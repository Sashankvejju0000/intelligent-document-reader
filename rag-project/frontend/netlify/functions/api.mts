import type { Config } from "@netlify/functions";
import {
  DEFAULT_TOP_K,
  HttpError,
  addDocument,
  deleteDocument,
  generateAnswer,
  getDocuments,
  resetStore,
  retrieve,
  summarizeDocuments,
} from "../../lib/rag.js";

const fail = (status: number, detail: string) => Response.json({ detail }, { status });

async function route(req: Request): Promise<Response> {
  const endpoint = new URL(req.url).pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
  const method = req.method;

  if (endpoint === "" || endpoint === "health") {
    return Response.json({ status: "ok" });
  }

  if (endpoint === "documents" && method === "GET") {
    return Response.json({ documents: await getDocuments() });
  }

  if (endpoint === "upload" && method === "POST") {
    const file = (await req.formData()).get("file");
    if (!(file instanceof File)) return fail(400, "No file was uploaded.");
    if (!file.name.toLowerCase().endsWith(".pdf")) return fail(400, "Only PDF files are supported.");

    const res = await addDocument(new Uint8Array(await file.arrayBuffer()), file.name);
    return Response.json({
      status: "success",
      filename: file.name,
      pages: res.pages,
      chunks_indexed: res.chunks,
    });
  }

  if (endpoint === "ask" && method === "POST") {
    const { question, top_k } = await req.json();
    if (typeof question !== "string" || !question.trim()) return fail(400, "Question cannot be empty.");

    const k = Math.min(Math.max(Number(top_k) || DEFAULT_TOP_K, 1), 20);
    const retrieved = await retrieve(question, k);
    const answer = await generateAnswer(question, retrieved);
    return Response.json({
      answer,
      sources: retrieved.map((c) => ({
        document: c.source,
        page: c.page,
        confidence: c.confidence,
        chunk_text: c.text,
      })),
    });
  }

  if (endpoint === "summarize" && method === "GET") {
    return Response.json({ status: "success", summary: await summarizeDocuments() });
  }

  if (endpoint === "delete-doc" && (method === "POST" || method === "DELETE")) {
    const { filename } = await req.json();
    if (!filename) return fail(400, "Filename parameter is required.");
    await deleteDocument(filename);
    return Response.json({ status: "success", message: `Successfully deleted ${filename}` });
  }

  if (endpoint === "reset" && method === "POST") {
    await resetStore();
    return Response.json({ status: "cleared", message: "Document store successfully reset." });
  }

  return fail(404, "Not found.");
}

export default async (req: Request) => {
  try {
    return await route(req);
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message);
    console.error(err);
    return fail(500, err instanceof Error ? err.message : "Unexpected server error.");
  }
};

export const config: Config = {
  path: ["/api", "/api/*"],
};
