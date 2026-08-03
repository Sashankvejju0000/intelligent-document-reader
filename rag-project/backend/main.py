import os
import shutil
import tempfile

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import rag

app = FastAPI(title="RAG Document Q&A API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AskRequest(BaseModel):
    question: str
    top_k: int = 5


@app.get("/")
def read_root():
    return {
        "message": "RAG Document Q&A API is running. Visit /docs for interactive API documentation.",
        "status": "online"
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/documents")
def list_documents():
    return {"documents": rag.get_documents()}


@app.get("/summarize")
def summarize_document():
    try:
        summary = rag.summarize_documents()
        return {"status": "success", "summary": summary}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        res = rag.add_document(tmp_path, filename=file.filename)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process PDF: {str(e)}")
    finally:
        try:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        except Exception:
            pass

    if res.get("chunks", 0) == 0:
        raise HTTPException(
            status_code=422,
            detail="No extractable text found in this PDF (it may be scanned or image-only).",
        )

    return {
        "status": "success",
        "filename": file.filename,
        "pages": res.get("pages", 1),
        "chunks_indexed": res.get("chunks", 0),
    }


@app.post("/ask")
async def ask_question(payload: AskRequest):
    if not payload.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    try:
        retrieved_chunks = rag.retrieve(payload.question, k=payload.top_k)
        answer = rag.generate_answer(payload.question, retrieved_chunks)

        return {
            "answer": answer,
            "sources": [
                {
                    "document": c["source"],
                    "page": c.get("page", 1),
                    "confidence": c.get("confidence", 85),
                    "chunk_text": c["text"]
                }
                for c in retrieved_chunks
            ],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class DeleteRequest(BaseModel):
    filename: str


@app.post("/delete-doc")
@app.delete("/delete-doc")
def delete_document(payload: DeleteRequest):
    if not payload.filename:
        raise HTTPException(status_code=400, detail="Filename parameter is required.")
    try:
        rag.delete_document(payload.filename)
        return {"status": "success", "message": f"Successfully deleted {payload.filename}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/reset")
async def reset():
    rag.reset_store()
    return {"status": "cleared", "message": "Document store successfully reset."}

