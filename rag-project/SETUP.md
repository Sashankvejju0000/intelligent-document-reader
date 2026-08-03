# Setup & Run Instructions

This is a working starter implementation of the RAG Document Q&A Assistant.
**I could not run/test this code myself** (no internet access to install
packages in my sandbox), so treat this as a strong first draft — run it
locally today, fix anything that breaks, and understand every part of it.
That's also exactly what you need to be able to do for the interview.

## What's included

```
rag-project/
├── backend/
│   ├── main.py          # FastAPI app: /upload, /ask, /reset endpoints
│   ├── rag.py            # Core logic: PDF parsing, chunking, embeddings, FAISS, Groq call
│   ├── requirements.txt
│   └── .env.example       # Copy to .env and add your Groq API key
├── frontend/
│   ├── src/App.jsx        # Upload + chat UI, calls the backend
│   ├── src/main.jsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
└── SETUP.md               # this file
```

## 1. Get a free Groq API key
Go to https://console.groq.com/keys, sign up, create a key.

## 2. Backend setup

```bash
cd rag-project/backend
python -m venv venv
# Linux/Mac: source venv/bin/activate
# Windows:   .\venv\Scripts\activate

pip install -r requirements.txt

cp .env.example .env
# Open .env and paste your real Groq API key

uvicorn main:app --reload
```

Backend should now be running at `http://localhost:8000`.
Visit `http://localhost:8000/docs` — FastAPI's auto-generated interactive
docs. Test `/upload` and `/ask` there first, before touching the frontend,
to confirm the pipeline actually works.

**First run will download the embedding model** — `fastembed` downloads the `BAAI/bge-small-en-v1.5`
ONNX model (~67MB) the first time embeddings are generated. Subsequent runs are fast (cached).

## 3. Frontend setup

Open a **second terminal**:

```bash
cd rag-project/frontend
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`).

## 4. Test it with the resume's example scenario

1. Upload a PDF (e.g. your own class notes, or any PDF with clear factual content)
2. Ask a question you know the answer to from that PDF
3. Check the "Sources" dropdown under the answer — confirm the retrieved
   chunk actually contains the answer
4. Ask something NOT in the PDF — confirm it says
   "Not found in the uploaded documents." instead of guessing

## 5. Common issues you may hit

| Problem | Likely cause / fix |
|---|---|
| `ModuleNotFoundError` | You forgot to activate the venv, or `pip install -r requirements.txt` didn't finish — rerun it |
| CORS error in browser console | Frontend isn't running on port 5173, or backend isn't running — check both terminals |
| `GROQ_API_KEY not set` error | `.env` file missing or not filled in; also confirm `python-dotenv` installed |
| Upload returns "no extractable text" | The PDF is scanned/image-based, not real text — try a text-based PDF instead |
| `faiss-cpu` fails to install on Windows | Try `pip install faiss-cpu --only-binary :all:`, or use WSL/Linux |
| Answers seem to ignore the PDF and use general knowledge | Check the prompt in `rag.py` is actually being sent — print it to console and inspect |

## 6. Before your interview — make sure you can explain

- Why chunks overlap by 50 words (so an answer split across a chunk
  boundary doesn't get cut off in both halves)
- Why we embed with a local model but generate with a hosted LLM (cost +
  speed for embeddings; quality for generation)
- What `IndexFlatL2` does (brute-force nearest-neighbor search by
  Euclidean distance between vectors — fine for small doc sets, would
  need a different FAISS index type like `IVF` at larger scale)
- What happens if two PDFs contain contradictory information (worth
  thinking about, even if you don't fully solve it — shows depth)

## 7. Next steps once it's working

- Push to GitHub with commits per stage (backend working → frontend
  working → tested with real docs)
- Write real, measured results in your project README (not the generic
  one — replace with your actual test outcomes)
- Update your resume with the live repo link
