CREATE TABLE "chunks" (
	"id" serial PRIMARY KEY,
	"document_id" integer NOT NULL,
	"page" integer DEFAULT 1 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" serial PRIMARY KEY,
	"filename" text NOT NULL UNIQUE,
	"pages" integer DEFAULT 0 NOT NULL,
	"chunks" integer DEFAULT 0 NOT NULL,
	"words" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "chunks_document_id_idx" ON "chunks" ("document_id");--> statement-breakpoint
CREATE INDEX "chunks_text_fts_idx" ON "chunks" USING gin (to_tsvector('english', "text"));--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_document_id_documents_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE;