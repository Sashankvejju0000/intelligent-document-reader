# 📄 DocuQuery Reader - Intelligent Document Q&A System

DocuQuery Reader is a **Production-Grade Retrieval-Augmented Generation (RAG) Document Q&A System** built to perform sub-second, highly accurate question answering on private PDF documents with zero hallucination and page-level citations.

---

## ⚡ Features

- **🚀 Sub-Second PDF Indexing (< 0.5s)**: Uses C-native `pypdfium2` parsing and parallelized ONNX tensor embeddings (`batch_size=64`).
- **🎯 Hybrid Search Engine**: Combines **70% Dense Cosine Similarity (FAISS `IndexFlatIP`)** + **30% Sparse BM25 Keyword Search** with stemming.
- **🛡️ Strict Grounding & Zero Hallucination**: Automatically flags questions not in the document with an `⚠️ OUT OF PDF` notice.
- **💡 Interactive Follow-Up Suggestions**: Generates 3 clickable follow-up questions directly grounded in your document.
- **🧱 Block-Based Interactive UI**: Renders answers in structured visual block cards with page attribution and match confidence % badges.

---

## 🛠️ Tech Stack

- **Frontend**: React, Vite, Lucide Icons, Glassmorphism Styling.
- **Backend API**: FastAPI, Uvicorn (Python 3.14).
- **PDF Extraction**: `pypdfium2` (Chrome PDFium C++ engine) + `pdfplumber` fallback.
- **Vector Embeddings**: `fastembed` (`BAAI/bge-small-en-v1.5`, ONNX batch_size=64).
- **Vector Database**: FAISS (`IndexFlatIP` Cosine Similarity).
- **LLM Engine**: Groq API (`llama-3.1-8b-instant`).

---

## 🚀 Getting Started

### 1. Backend Setup
```bash
cd rag-project/backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
```

Create a `.env` file in `rag-project/backend/.env`:
```env
GROQ_API_KEY=your_groq_api_key_here
```

Start the backend API server:
```bash
uvicorn main:app --host 127.0.0.1 --port 8000
```

### 2. Frontend Setup
```bash
cd rag-project/frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## 📜 License
MIT License.
