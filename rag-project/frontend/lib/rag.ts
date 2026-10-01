/**
 * Core RAG (Retrieval-Augmented Generation) logic, running on Netlify Functions.
 *
 *  - PDF text extraction per page (unpdf / PDF.js)
 *  - Overlapping word chunks with page tracking, persisted in Netlify Database
 *  - Hybrid retrieval: Postgres full-text ranking + stemmed keyword coverage
 *  - Grounded answers and summaries via Groq, falling back to Netlify AI Gateway
 */
import OpenAI from "openai";
import { extractText, getDocumentProxy } from "unpdf";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { chunks, documents } from "../db/schema.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const CHUNK_SIZE_WORDS = 220;
const CHUNK_OVERLAP_WORDS = 40;
export const DEFAULT_TOP_K = 8;
const INSERT_BATCH_SIZE = 500;

const GROQ_MODEL = "openai/gpt-oss-20b";
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const GATEWAY_MODEL = "gpt-4.1-mini";

const OUT_OF_PDF = "⚠️ OUT OF PDF: The requested information is not mentioned in the uploaded PDF.";

const PROMPT_TEMPLATE = (context: string, question: string) => `You are a friendly, intelligent Document Q&A assistant. Answer the user's question in a clear, simple, and user-friendly format using ONLY the provided PDF document context.

Formatting Guidelines:
1. Provide a direct, easy-to-understand answer using expressive emojis (e.g. 📌, 🚀, 💡, 🔹, 📊, 📄, ✨, 🎯) for key points.
2. DO NOT use double asterisks \`**\` anywhere in your output. Never wrap text in \`**\`. Use clean text with emojis instead.
3. Ensure the language is simple, clean, and accessible.
4. At the VERY END of your response, ALWAYS add a section titled:
"💡 Related Questions You Might Ask:"
followed by 3 short, relevant follow-up questions directly answerable from the document context.
5. Only if the provided context contains zero information or relevance to the question, respond with:
"${OUT_OF_PDF}"

Context:
${context}

Question: ${question}

Answer:`;

const STOP_WORDS = new Set([
  "what", "are", "the", "is", "of", "in", "for", "to", "a", "an", "and", "or", "how", "why",
  "can", "you", "tell", "me", "about", "which", "with",
]);

const PUNCTUATION = /["'`“”«»?!.,:;()[\]{}\-_/\\]/g;
const QUOTES = /["'`“”«»]/g;

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------
function cleanText(text: string): string {
  if (!text) return "";
  return text
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Strips quotes/punctuation and generates stemmed keyword terms. */
function extractQueryTerms(question: string): Set<string> {
  const terms = new Set<string>();
  for (const word of question.replace(PUNCTUATION, " ").split(/\s+/)) {
    const w = word.toLowerCase().trim();
    if (w.length < 2 || STOP_WORDS.has(w)) continue;
    terms.add(w);
    if (w.endsWith("s") && w.length > 3) terms.add(w.slice(0, -1));
    if (w.endsWith("es") && w.length > 4) terms.add(w.slice(0, -2));
    if (w.endsWith("ing") && w.length > 5) terms.add(w.slice(0, -3));
  }
  return terms;
}

function keywordScore(queryTerms: Set<string>, text: string): number {
  if (queryTerms.size === 0 || !text) return 0;
  const words = new Set(text.toLowerCase().replace(PUNCTUATION, " ").split(/\s+/));
  let matches = 0;
  for (const qt of queryTerms) {
    if (words.has(qt) || [...words].some((tw) => tw.includes(qt))) matches++;
  }
  return matches / queryTerms.size;
}

// ---------------------------------------------------------------------------
// Step 1 + 2: Extract pages and chunk with overlap
// ---------------------------------------------------------------------------
async function extractPages(data: Uint8Array) {
  const pdf = await getDocumentProxy(data);
  const { text } = await extractText(pdf, { mergePages: false });
  return text
    .map((raw, i) => ({ page: i + 1, text: cleanText(raw) }))
    .filter((p) => p.text.length > 5);
}

function chunkPages(pages: { page: number; text: string }[]) {
  const out: { page: number; text: string }[] = [];
  for (const p of pages) {
    const words = p.text.split(/\s+/).filter(Boolean);
    let start = 0;
    while (start < words.length) {
      const end = start + CHUNK_SIZE_WORDS;
      const chunk = words.slice(start, end).join(" ");
      if (chunk.trim().length > 15) out.push({ page: p.page, text: chunk });
      if (end >= words.length) break;
      start = end - CHUNK_OVERLAP_WORDS;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Step 3: Persist document + chunks
// ---------------------------------------------------------------------------
export async function addDocument(data: Uint8Array, filename: string) {
  const pages = await extractPages(data);
  const pieces = chunkPages(pages);
  if (pieces.length === 0) {
    throw new HttpError(422, "No extractable text found in this PDF (it may be scanned or image-only).");
  }
  const words = pieces.reduce((n, c) => n + c.text.split(/\s+/).length, 0);

  // Re-uploading a file with the same name replaces its previous index.
  await db.delete(documents).where(eq(documents.filename, filename));
  const [doc] = await db
    .insert(documents)
    .values({ filename, pages: pages.length, chunks: pieces.length, words })
    .returning();

  for (let i = 0; i < pieces.length; i += INSERT_BATCH_SIZE) {
    await db.insert(chunks).values(
      pieces.slice(i, i + INSERT_BATCH_SIZE).map((c, j) => ({
        documentId: doc.id,
        page: c.page,
        position: i + j,
        text: c.text,
      })),
    );
  }

  return { pages: pages.length, chunks: pieces.length, words };
}

export async function getDocuments() {
  return db
    .select({
      filename: documents.filename,
      pages: documents.pages,
      chunks: documents.chunks,
      words: documents.words,
    })
    .from(documents)
    .orderBy(asc(documents.id));
}

export async function deleteDocument(filename: string) {
  await db.delete(documents).where(eq(documents.filename, filename));
}

export async function resetStore() {
  await db.delete(documents);
}

// ---------------------------------------------------------------------------
// Step 4: Hybrid search (Postgres full-text rank + keyword coverage)
// ---------------------------------------------------------------------------
type Retrieved = { text: string; source: string; page: number; confidence: number };

export async function retrieve(question: string, k = DEFAULT_TOP_K): Promise<Retrieved[]> {
  const queryTerms = extractQueryTerms(question);
  const lexemes = [...queryTerms].map((t) => t.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean);

  if (lexemes.length > 0) {
    const tsQuery = sql`to_tsquery('english', ${lexemes.join(" | ")})`;
    const tsVector = sql`to_tsvector('english', ${chunks.text})`;
    const rank = sql<number>`ts_rank_cd(${tsVector}, ${tsQuery}, 32)`;

    const candidates = await db
      .select({ text: chunks.text, page: chunks.page, source: documents.filename, rank })
      .from(chunks)
      .innerJoin(documents, eq(chunks.documentId, documents.id))
      .where(sql`${tsVector} @@ ${tsQuery}`)
      .orderBy(desc(rank))
      .limit(Math.max(k * 4, 30));

    if (candidates.length > 0) {
      return candidates
        .map((c) => {
          const score = Number(c.rank) * 0.35 + keywordScore(queryTerms, c.text) * 0.65;
          return {
            text: c.text,
            page: c.page,
            source: c.source,
            score,
            confidence: Math.max(15, Math.min(99, Math.round(score * 100))),
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, k)
        .map(({ score, ...rest }) => rest);
    }
  }

  // No lexical match (e.g. vague questions): hand the model the opening chunks
  // and let it decide whether the question is answerable from the PDF.
  const fallback = await db
    .select({ text: chunks.text, page: chunks.page, source: documents.filename })
    .from(chunks)
    .innerJoin(documents, eq(chunks.documentId, documents.id))
    .orderBy(asc(documents.id), asc(chunks.position))
    .limit(k);
  return fallback.map((c) => ({ ...c, confidence: 15 }));
}

// ---------------------------------------------------------------------------
// Step 5: Grounded generation
// ---------------------------------------------------------------------------
async function complete(prompt: string, temperature: number, maxTokens: number) {
  const messages = [{ role: "user" as const, content: prompt }];
  const groqKey = process.env.GROQ_API_KEY;

  if (groqKey) {
    try {
      const groq = new OpenAI({ apiKey: groqKey, baseURL: GROQ_BASE_URL });
      const response = await groq.chat.completions.create({
        model: GROQ_MODEL,
        messages,
        temperature,
        max_tokens: maxTokens,
        // gpt-oss is a reasoning model; keep reasoning short so the answer fits the token budget.
        reasoning_effort: "low",
      });
      const text = response.choices[0]?.message?.content;
      if (text) return text;
    } catch (err) {
      // Without AI Gateway there is nothing to fall back to.
      if (!process.env.OPENAI_API_KEY) throw err;
      console.error("Groq request failed, falling back to AI Gateway:", err);
    }
  }

  // Netlify AI Gateway injects OPENAI_API_KEY / OPENAI_BASE_URL at runtime.
  const response = await new OpenAI().chat.completions.create({
    model: GATEWAY_MODEL,
    messages,
    temperature,
    max_tokens: maxTokens,
  });
  return response.choices[0]?.message?.content ?? "";
}

export async function generateAnswer(question: string, retrieved: Retrieved[]) {
  if (retrieved.length === 0) return OUT_OF_PDF;
  const context = retrieved
    .map((c) => `[Source: ${c.source}${c.page ? ` (Page ${c.page})` : ""}]\n${c.text}`)
    .join("\n\n---\n\n");
  return complete(PROMPT_TEMPLATE(context, question.replace(QUOTES, "").trim()), 0.1, 900);
}

export async function summarizeDocuments() {
  const all = await db
    .select({ text: chunks.text, page: chunks.page })
    .from(chunks)
    .innerJoin(documents, eq(chunks.documentId, documents.id))
    .orderBy(asc(documents.id), asc(chunks.position));
  if (all.length === 0) return "No documents uploaded yet to summarize.";

  const step = Math.max(1, Math.floor(all.length / 10));
  const sampled = all.filter((_, i) => i % step === 0).slice(0, 12);
  const context = sampled.map((c) => `[Page ${c.page}]: ${c.text}`).join("\n\n---\n\n");

  const prompt = `You are an expert document summarizer. Create a clear, high-level executive summary of the uploaded document based on the following excerpts.

Instructions:
1. Provide an Overview paragraph.
2. List 4-6 Key Bullet Points summarizing main topics or findings.
3. Keep the summary professional, structured, and easy to read.

Excerpts:
${context}

Summary:`;
  return complete(prompt, 0.3, 800);
}
