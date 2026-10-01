import { sql } from "drizzle-orm";
import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";

export const documents = pgTable("documents", {
  id: serial().primaryKey(),
  filename: text().notNull().unique(),
  pages: integer().notNull().default(0),
  chunks: integer().notNull().default(0),
  words: integer().notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const chunks = pgTable(
  "chunks",
  {
    id: serial().primaryKey(),
    documentId: integer("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    page: integer().notNull().default(1),
    position: integer().notNull().default(0),
    text: text().notNull(),
  },
  (table) => [
    index("chunks_document_id_idx").on(table.documentId),
    index("chunks_text_fts_idx").using("gin", sql`to_tsvector('english', ${table.text})`),
  ],
);
