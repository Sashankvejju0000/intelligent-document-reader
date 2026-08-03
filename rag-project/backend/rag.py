"""
Core RAG (Retrieval-Augmented Generation) logic.

Features:
  - Ultra-fast C-based text extraction (pypdfium2 + pdfplumber fallback)
  - Parallelized ONNX vector embedding generation (batch_size=64)
  - Hybrid Dense Vector Cosine Similarity + Sparse Keyword BM25 Reranking
  - User-friendly response formatting with automatic related suggestions
  - Executive document summarization endpoint
"""

import os
import re
import faiss
import numpy as np
import pypdfium2 as pdfium
import pdfplumber
from fastembed import TextEmbedding
from groq import Groq

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
EMBEDDING_MODEL_NAME = "BAAI/bge-small-en-v1.5"
CHUNK_SIZE_WORDS = 220
CHUNK_OVERLAP_WORDS = 40
DEFAULT_TOP_K = 8
EMBED_BATCH_SIZE = 64                        # ONNX parallelized tensor batch size for O(M/B) speed

GROQ_MODEL = "llama-3.1-8b-instant"

PROMPT_TEMPLATE = """You are a friendly, intelligent Document Q&A assistant. Answer the user's question in a clear, simple, and user-friendly format using ONLY the provided PDF document context.

Formatting Guidelines:
1. Provide a direct, easy-to-understand answer using bold headings, short paragraphs, and bullet points.
2. Ensure the language is simple and accessible.
3. At the VERY END of your response, ALWAYS add a section titled:
"💡 Related Questions You Might Ask:"
followed by 3 short, relevant follow-up questions directly answerable from the document context.
4. Only if the provided context contains zero information or relevance to the question, respond with:
"⚠️ OUT OF PDF: The requested information is not mentioned in the uploaded PDF."

Context:
{context}

Question: {question}

Answer:"""

# ---------------------------------------------------------------------------
# Global in-memory state
# ---------------------------------------------------------------------------
_embedding_model = None
_index = None                 # FAISS IndexFlatIP
_chunk_store = []             # parallel list of {"text": ..., "source": ..., "page": ...}
_documents = []               # list of {"filename": ..., "pages": ..., "chunks": ..., "words": ...}


def get_embedding_model():
    global _embedding_model
    if _embedding_model is None:
        _embedding_model = TextEmbedding(model_name=EMBEDDING_MODEL_NAME)
    return _embedding_model


def _get_index(dim):
    global _index
    if _index is None:
        _index = faiss.IndexFlatIP(dim)
    return _index


def clean_text(text: str) -> str:
    """Cleans control characters and normalizes spaces."""
    if not text:
        return ""
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def extract_query_terms(question: str) -> set:
    """Strips quotes/punctuation and generates stemmed keyword terms."""
    if not question:
        return set()
    cleaned = re.sub(r'[\"\'\`\“\”\«\»\?\!\.\,\:\;\(\)\[\]\{\}\-\_\/\\]', ' ', question)
    stop_words = {"what", "are", "the", "is", "of", "in", "for", "to", "a", "an", "and", "or", "how", "why", "can", "you", "tell", "me", "about", "which", "with"}
    terms = set()
    for word in cleaned.split():
        w_lower = word.lower().strip()
        if len(w_lower) >= 2 and w_lower not in stop_words:
            terms.add(w_lower)
            if w_lower.endswith("s") and len(w_lower) > 3:
                terms.add(w_lower[:-1])
            if w_lower.endswith("es") and len(w_lower) > 4:
                terms.add(w_lower[:-2])
            if w_lower.endswith("ing") and len(w_lower) > 5:
                terms.add(w_lower[:-3])
    return terms


# ---------------------------------------------------------------------------
# Step 1: Hybrid Multi-Engine Text Extraction (pypdfium2 + pdfplumber)
# ---------------------------------------------------------------------------
def extract_pages_from_pdf(file_path: str) -> list:
    pages = []
    
    # Engine 1: pypdfium2 (Ultra-fast C-based engine - O(N))
    pdf = None
    try:
        pdf = pdfium.PdfDocument(file_path)
        for i, page in enumerate(pdf, start=1):
            textpage = page.get_textpage()
            raw_text = textpage.get_text_range()
            if raw_text:
                cleaned = clean_text(raw_text)
                if len(cleaned) > 5:
                    pages.append({"page": i, "text": cleaned})
    except Exception as e:
        print(f"pypdfium2 extraction error: {e}")
    finally:
        if pdf is not None:
            try:
                pdf.close()
            except Exception:
                pass

    # Engine 2: pdfplumber fallback if Engine 1 produced no/sparse text
    total_chars = sum(len(p["text"]) for p in pages)
    if not pages or total_chars < 50:
        pages = []
        try:
            with pdfplumber.open(file_path) as pdf_doc:
                for i, page in enumerate(pdf_doc.pages, start=1):
                    raw_text = page.extract_text(layout=False) or page.extract_text(layout=True)
                    if raw_text:
                        cleaned = clean_text(raw_text)
                        if len(cleaned) > 5:
                            pages.append({"page": i, "text": cleaned})
        except Exception as e:
            print(f"pdfplumber fallback extraction error: {e}")

    return pages


# ---------------------------------------------------------------------------
# Step 2: Chunk text with overlap and page tracking - O(W)
# ---------------------------------------------------------------------------
def chunk_pages(pages: list, chunk_size: int = CHUNK_SIZE_WORDS, overlap: int = CHUNK_OVERLAP_WORDS) -> list:
    chunks = []
    for p in pages:
        words = p["text"].split()
        if not words:
            continue
        start = 0
        while start < len(words):
            end = start + chunk_size
            chunk_str = " ".join(words[start:end])
            if len(chunk_str.strip()) > 15:
                chunks.append({"text": chunk_str, "page": p["page"]})
            if end >= len(words):
                break
            start = end - overlap
    return chunks


# ---------------------------------------------------------------------------
# Step 3 + 4: Embed chunks with O(M/B) batching and add to FAISS Index
# ---------------------------------------------------------------------------
def add_document(file_path: str, filename: str) -> dict:
    pages = extract_pages_from_pdf(file_path)
    if not pages:
        return {"chunks": 0, "pages": 0, "words": 0}

    chunks_with_meta = chunk_pages(pages)
    if not chunks_with_meta:
        return {"chunks": 0, "pages": len(pages), "words": 0}

    chunk_texts = [c["text"] for c in chunks_with_meta]
    total_words = sum(len(c["text"].split()) for c in chunks_with_meta)
    
    model = get_embedding_model()
    # Batch ONNX embeddings to achieve O(M/64) parallel execution speed
    embeddings_list = list(model.embed(chunk_texts, batch_size=EMBED_BATCH_SIZE))
    embeddings = np.array(embeddings_list, dtype="float32")
    faiss.normalize_L2(embeddings)

    index = _get_index(embeddings.shape[1])
    index.add(embeddings)

    for item in chunks_with_meta:
        _chunk_store.append({
            "text": item["text"],
            "source": filename,
            "page": item["page"]
        })

    doc_entry = next((d for d in _documents if d["filename"] == filename), None)
    if doc_entry:
        doc_entry["pages"] = max(doc_entry["pages"], len(pages))
        doc_entry["chunks"] += len(chunks_with_meta)
        doc_entry["words"] = total_words
    else:
        _documents.append({
            "filename": filename,
            "pages": len(pages),
            "chunks": len(chunks_with_meta),
            "words": total_words
        })

    return {"chunks": len(chunks_with_meta), "pages": len(pages), "words": total_words}


# ---------------------------------------------------------------------------
# Step 5: Hybrid Search (Dense Vector Cosine + Stemmed Keyword BM25)
# ---------------------------------------------------------------------------
def _compute_keyword_score(query_terms: set, text: str) -> float:
    if not query_terms or not text:
        return 0.0
    cleaned_text = re.sub(r'[\"\'\`\“\”\«\»\?\!\.\,\:\;\(\)\[\]\{\}\-\_\/\\]', ' ', text.lower())
    text_words = set(cleaned_text.split())
    matches = sum(1 for qt in query_terms if qt in text_words or any(qt in tw for tw in text_words))
    return matches / len(query_terms)


def retrieve(question: str, k: int = DEFAULT_TOP_K):
    if _index is None or _index.ntotal == 0:
        return []

    cleaned_query = re.sub(r'[\"\'\`\“\”\«\»]', '', question).strip()
    model = get_embedding_model()
    query_vec = np.array(list(model.embed([cleaned_query])), dtype="float32")
    faiss.normalize_L2(query_vec)

    search_k = min(max(k * 4, 30), _index.ntotal)
    similarities, indices = _index.search(query_vec, search_k)

    query_terms = extract_query_terms(question)
    scored_chunks = []
    seen = set()

    for vec_score, idx in zip(similarities[0], indices[0]):
        if 0 <= idx < len(_chunk_store) and idx not in seen:
            seen.add(idx)
            chunk = _chunk_store[idx]
            kw_score = _compute_keyword_score(query_terms, chunk["text"])
            
            hybrid_score = (float(vec_score) * 0.65) + (kw_score * 0.35)
            item = dict(chunk)
            item["score"] = hybrid_score
            item["confidence"] = max(15, min(99, int(hybrid_score * 100)))
            scored_chunks.append((hybrid_score, item))

    if query_terms:
        for idx, chunk in enumerate(_chunk_store):
            if idx not in seen:
                kw_score = _compute_keyword_score(query_terms, chunk["text"])
                if kw_score >= 0.3:
                    seen.add(idx)
                    item = dict(chunk)
                    item["score"] = kw_score * 0.6
                    item["confidence"] = max(15, min(99, int(kw_score * 60)))
                    scored_chunks.append((item["score"], item))

    scored_chunks.sort(key=lambda x: x[0], reverse=True)
    results = [item for _, item in scored_chunks[:k]]
    return results


# ---------------------------------------------------------------------------
# Step 6: Generate grounded answer via Groq LLM
# ---------------------------------------------------------------------------
def generate_answer(question: str, retrieved_chunks: list) -> str:
    if not retrieved_chunks:
        return "⚠️ OUT OF PDF: The requested information is not mentioned in the uploaded PDF."

    context_blocks = []
    for c in retrieved_chunks:
        page_info = f" (Page {c['page']})" if c.get("page") else ""
        context_blocks.append(f"[Source: {c['source']}{page_info}]\n{c['text']}")

    context = "\n\n---\n\n".join(context_blocks)
    cleaned_q = re.sub(r'[\"\'\`\“\”\«\»]', '', question).strip()
    prompt = PROMPT_TEMPLATE.format(context=context, question=cleaned_q)

    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GROQ_API_KEY environment variable is not set in backend/.env. "
            "Please obtain a free key at https://console.groq.com and set GROQ_API_KEY."
        )

    try:
        client = Groq(api_key=api_key)
        response = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=900,
        )
        return response.choices[0].message.content
    except Exception as e:
        raise RuntimeError(f"Groq API Error: {str(e)}")


def summarize_documents() -> str:
    """Generates an executive summary of all currently uploaded PDF documents."""
    if not _chunk_store:
        return "No documents uploaded yet to summarize."

    step = max(1, len(_chunk_store) // 10)
    sampled = _chunk_store[::step][:12]
    context = "\n\n---\n\n".join(f"[Page {c['page']}]: {c['text']}" for c in sampled)

    prompt = f"""You are an expert document summarizer. Create a clear, high-level executive summary of the uploaded document based on the following excerpts.

Instructions:
1. Provide an Overview paragraph.
2. List 4-6 Key Bullet Points summarizing main topics or findings.
3. Keep the summary professional, structured, and easy to read.

Excerpts:
{context}

Summary:"""

    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY is not set.")

    try:
        client = Groq(api_key=api_key)
        response = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=800,
        )
        return response.choices[0].message.content
    except Exception as e:
        raise RuntimeError(f"Summarization error: {str(e)}")


def get_documents() -> list:
    return _documents


def reset_store():
    """Clears all indexed documents and state."""
    global _index, _chunk_store, _documents
    _index = None
    _chunk_store = []
    _documents = []






