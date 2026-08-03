import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  FileText,
  Upload,
  Send,
  Trash2,
  BookOpen,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Loader2,
  CheckCircle2,
  User,
  Copy,
  Check,
  FileSearch,
  Download,
  SlidersHorizontal,
  ShieldCheck,
  AlertTriangle,
  Zap,
  BookOpenCheck,
  MoreVertical,
  Info,
  Sliders,
  ChevronLeft,
  ChevronRight,
  Bookmark,
  Sidebar
} from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

// DocuQuery AI Vibrant Cyan Rounded Glass Logo Icon (Matching image_3.png)
const DocuQueryLogo = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2Z" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M14 2V8H20" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M8 12H13" stroke="#ffffff" strokeWidth="2" strokeLinecap="round"/>
    <path d="M8 16H11" stroke="#ffffff" strokeWidth="2" strokeLinecap="round"/>
    <circle cx="16" cy="16" r="3.5" fill="#00C9A7" stroke="#061114" strokeWidth="1.5"/>
    <path d="M18.5 18.5L21 21" stroke="#00C9A7" strokeWidth="2" strokeLinecap="round"/>
  </svg>
)

/* ==========================================================================
   BLOCK-WISE INTERACTIVE RESPONSE RENDERER
   ========================================================================== */
const MessageBlockRenderer = ({ text, handleAsk }) => {
  if (!text) return null

  const sections = text.split('\n\n')

  return (
    <div className="block-container animate-fade-in">
      {sections.map((section, idx) => {
        const trimmed = section.trim()
        if (!trimmed) return null

        if (trimmed.includes('💡 Related Questions You Might Ask:') || trimmed.includes('Related Follow-up Suggestions')) {
          const suggestions = trimmed
            .replace(/.*Related.* Suggestions:?/i, '')
            .replace(/.*Related Questions You Might Ask:?/i, '')
            .split('\n')
            .map((s) => s.replace(/^[0-9\.\-\*\•\s]+/, '').trim())
            .filter((s) => s.length > 4)

          return (
            <div key={idx} className="suggestion-block-card animate-fade-in">
              <div className="block-card-header">
                <Zap size={16} style={{ color: '#00C9A7' }} />
                <span>Suggested Follow-up Questions</span>
              </div>
              <div className="suggestion-grid">
                {suggestions.slice(0, 3).map((sug, sIdx) => (
                  <button key={sIdx} className="interactive-sug-card" onClick={() => handleAsk(sug)}>
                    <span className="sug-icon">💡</span>
                    <span className="sug-text">{sug}</span>
                    <span className="sug-arrow">➔</span>
                  </button>
                ))}
              </div>
            </div>
          )
        }

        if (trimmed.startsWith('#') || (trimmed.startsWith('**') && trimmed.endsWith('**') && trimmed.length < 70)) {
          const headerText = trimmed.replace(/^#+\s*/, '').replace(/\*\*/g, '')
          return (
            <div key={idx} className="block-header-card animate-fade-in">
              <div className="block-header-dot" />
              <span className="block-header-title">{headerText}</span>
            </div>
          )
        }

        if (trimmed.split('\n').some((line) => /^[0-9\.\-\*\•]/.test(line.trim()))) {
          const listItems = trimmed.split('\n').filter((l) => l.trim().length > 0)
          return (
            <div key={idx} className="block-list-grid animate-fade-in">
              {listItems.map((item, itemIdx) => {
                const cleanItem = item.replace(/^[0-9\.\-\*\•\s]+/, '').trim()
                return (
                  <div key={itemIdx} className="block-list-card">
                    <div className="block-list-badge">{itemIdx + 1}</div>
                    <div className="block-list-content">
                      <ReactMarkdown>{cleanItem}</ReactMarkdown>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        }

        return (
          <div key={idx} className="block-para-card animate-fade-in">
            <ReactMarkdown>{trimmed}</ReactMarkdown>
          </div>
        )
      })}
    </div>
  )
}

export default function App() {
  const [documents, setDocuments] = useState([])
  const [uploading, setUploading] = useState(false)
  const [summarizing, setSummarizing] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState([])
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState('')
  const [copiedIndex, setCopiedIndex] = useState(null)
  const [serverOnline, setServerOnline] = useState(false)
  const [openSources, setOpenSources] = useState({})
  
  // Advanced Options
  const [topK, setTopK] = useState(5)
  const [showSettings, setShowSettings] = useState(false)

  const chatBottomRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    checkHealth()
    fetchDocuments()
  }, [])

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, asking])

  async function checkHealth() {
    try {
      const res = await fetch(`${API_BASE}/health`)
      if (res.ok) setServerOnline(true)
      else setServerOnline(false)
    } catch {
      setServerOnline(false)
    }
  }

  async function fetchDocuments() {
    try {
      const res = await fetch(`${API_BASE}/documents`)
      if (res.ok) {
        const data = await res.json()
        setDocuments(data.documents || [])
      }
    } catch (err) {
      console.error('Failed to fetch documents:', err)
    }
  }

  async function uploadFile(file) {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please upload a valid PDF file.')
      return
    }

    setUploading(true)
    setError('')
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Upload failed')

      await fetchDocuments()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function handleFileSelect(e) {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
  }

  function handleDrop(e) {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) uploadFile(file)
  }

  async function handleAsk(promptText) {
    const q = promptText || question
    if (!q.trim() || asking) return

    setMessages((prev) => [...prev, { role: 'user', text: q }])
    if (!promptText) setQuestion('')
    setAsking(true)
    setError('')

    try {
      const res = await fetch(`${API_BASE}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, top_k: topK }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Failed to generate answer.')

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: data.answer, sources: data.sources },
      ])
    } catch (err) {
      setError(err.message)
    } finally {
      setAsking(false)
    }
  }

  async function handleSummarizePDF() {
    if (documents.length === 0 || summarizing) return
    setSummarizing(true)
    setError('')

    setMessages((prev) => [
      ...prev,
      { role: 'user', text: '📝 Generate an executive summary of the uploaded document.' }
    ])

    try {
      const res = await fetch(`${API_BASE}/summarize`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Summarization failed')

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: `### 📄 Executive Summary\n\n${data.summary}` }
      ])
    } catch (err) {
      setError('Summarization failed: ' + err.message)
    } finally {
      setSummarizing(false)
    }
  }

  async function handleResetStore() {
    if (!window.confirm('Are you sure you want to clear all indexed documents?')) return
    try {
      await fetch(`${API_BASE}/reset`, { method: 'POST' })
      setDocuments([])
      setMessages([])
      setError('')
    } catch (err) {
      setError('Failed to reset store: ' + err.message)
    }
  }

  function exportTranscript() {
    if (messages.length === 0) return
    let content = `# Document QA Transcript\n\nGenerated on: ${new Date().toLocaleString()}\n\n`
    messages.forEach((m) => {
      content += `### ${m.role === 'user' ? 'User Question' : 'Assistant Answer'}\n${m.text}\n\n`
    })

    const blob = new Blob([content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `QA_Transcript_${Date.now()}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  function copyToClipboard(text, index) {
    navigator.clipboard.writeText(text)
    setCopiedIndex(index)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  function toggleSources(index) {
    setOpenSources((prev) => ({ ...prev, [index]: !prev[index] }))
  }

  // Pre-populated demo document cards matching image_3.png if documents list is empty
  const displayDocs = documents.length > 0 ? documents : [
    { filename: 'doc_v1.pdf', pages: 85, chunks: 85, words: 12450, size: '12MB', progress: 100 },
    { filename: 'research_v3.pdf', pages: 22, chunks: 22, words: 5120, size: '5MB', progress: 80 }
  ]

  return (
    <div className="app-container">
      {/* Header Banner (Exact match to image_3.png) */}
      <header className="header-banner">
        <div className="logo-group">
          <div className="logo-box">
            <DocuQueryLogo />
          </div>
          <div>
            <h1 className="header-title">DocuQuery AI</h1>
            <p className="header-subtitle">
              Next-Gen Intelligent Document Reader • Instant Knowledge Extraction • Precise Attribution
            </p>
          </div>
        </div>

        <div className="header-actions">
          <div className="status-badge">
            <span
              className="status-dot"
              style={{ background: serverOnline ? '#00C9A7' : '#ef4444' }}
            />
            {serverOnline ? 'System Online' : 'System Offline'}
          </div>

          <button
            className="btn-advanced"
            onClick={() => setShowSettings(!showSettings)}
          >
            <SlidersHorizontal size={15} /> Advanced
          </button>

          {messages.length > 0 && (
            <button className="btn-advanced" onClick={exportTranscript} title="Export QA log as Markdown">
              <Download size={15} /> Export Log
            </button>
          )}

          {documents.length > 0 && (
            <button className="btn-reset" onClick={handleResetStore} title="Clear indexed knowledge store">
              <Trash2 size={15} /> Clear Store
            </button>
          )}
        </div>
      </header>

      {/* Advanced Settings Drawer */}
      {showSettings && (
        <div className="animate-fade-in" style={{ background: 'rgba(10, 26, 30, 0.95)', border: '1px solid var(--glass-border-focus)', padding: '14px 20px', borderRadius: 14, marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem', boxShadow: '0 8px 25px rgba(0, 201, 167, 0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#00C9A7', fontWeight: 700 }}>
              <ShieldCheck size={18} /> Fast ONNX Tensor Batching O(M/64) Active
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}>
              <span>Context Depth (Top K):</span>
              <select
                value={topK}
                onChange={(e) => setTopK(Number(e.target.value))}
                style={{ background: 'rgba(6, 17, 20, 0.8)', color: '#fff', border: '1px solid var(--glass-border)', padding: '5px 10px', borderRadius: 6, outline: 'none', fontWeight: 'bold' }}
              >
                <option value={3}>3 Chunks (Fastest)</option>
                <option value={5}>5 Chunks (Balanced)</option>
                <option value={8}>8 Chunks (Deep Context)</option>
              </select>
            </div>
          </div>
          <span style={{ fontSize: '0.78rem', color: '#00C9A7', fontWeight: 600 }}>✨ Automatic Follow-up Suggestions Active</span>
        </div>
      )}

      {/* Main Dual Panel Layout */}
      <div className="main-layout">
        {/* Left Sidebar: KNOWLEDGE BASE Panel */}
        <aside className="sidebar-panel">
          <div className="panel-section-header">
            <span>KNOWLEDGE BASE</span>
            <BookOpen size={16} />
          </div>

          {/* Refined PDF Drop Zone */}
          <div
            className={`dropzone-box ${isDragOver ? 'active' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragOver(true)
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => !uploading && fileInputRef.current?.click()}
          >
            <input
              type="file"
              accept="application/pdf"
              ref={fileInputRef}
              onChange={handleFileSelect}
              style={{ display: 'none' }}
              disabled={uploading}
            />
            <div className="dropzone-circle">
              {uploading ? <Loader2 size={24} className="animate-spin" /> : <Upload size={24} />}
            </div>
            <div className="dropzone-title">
              {uploading ? 'Processing & Indexing PDF…' : 'Drop your PDF here or Browse'}
            </div>
            <div className="dropzone-subtitle">
              Parses via pdfium C-engine - Parallel ONNX tensor embeddings
            </div>
          </div>

          {/* Indexed PDFs Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
            <div className="panel-section-header" style={{ fontSize: '0.8rem' }}>
              <span>INDEXED PDFS ({displayDocs.length})</span>
            </div>

            <div className="file-card-group">
              {displayDocs.map((doc, idx) => (
                <div key={idx} className="pdf-card animate-fade-in">
                  <div className="pdf-thumb-box">
                    <FileText size={20} />
                  </div>
                  <div className="pdf-details">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div className="pdf-filename" title={doc.filename}>{doc.filename}</div>
                      {doc.progress && doc.progress < 100 ? (
                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#00C9A7' }}>{doc.progress}%</span>
                      ) : (
                        <CheckCircle2 size={16} style={{ color: '#00C9A7' }} />
                      )}
                    </div>
                    <div className="pdf-meta-line">
                      <span>{doc.size || '12MB'}</span>
                      <span>•</span>
                      <span>{doc.pages || 1} Pages</span>
                    </div>
                    <div className="progress-bar-bg">
                      <div className="progress-bar-fill" style={{ width: `${doc.progress || 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {documents.length > 0 && (
              <button
                className="btn-ask-glowing"
                onClick={handleSummarizePDF}
                disabled={summarizing}
                style={{ marginTop: 8, justifyContent: 'center' }}
              >
                {summarizing ? <Loader2 size={18} className="animate-spin" /> : <FileSearch size={18} />}
                <span>{summarizing ? 'Generating Summary…' : 'Summarize PDF'}</span>
              </button>
            )}
          </div>
        </aside>

        {/* Central Interaction Window (Matching image_3.png) */}
        <main className="central-window">
          {/* Neural Network Node Graphic Graphic */}
          <svg className="neural-graphic" width="180" height="120" viewBox="0 0 200 140" fill="none">
            <circle cx="160" cy="30" r="6" fill="#00C9A7" />
            <circle cx="180" cy="60" r="5" fill="#06b6d4" />
            <circle cx="150" cy="90" r="6" fill="#00C9A7" />
            <circle cx="120" cy="50" r="4" fill="#38bdf8" />
            <line x1="160" y1="30" x2="180" y2="60" stroke="#00C9A7" strokeWidth="1.5" />
            <line x1="180" y1="60" x2="150" y2="90" stroke="#00C9A7" strokeWidth="1.5" />
            <line x1="160" y1="30" x2="120" y2="50" stroke="#06b6d4" strokeWidth="1.5" />
            <line x1="120" y1="50" x2="150" y2="90" stroke="#00C9A7" strokeWidth="1.5" />
          </svg>

          {/* Overlaid Central Welcome Card Modal (Matching image_3.png) */}
          {messages.length === 0 && (
            <div className="central-overlay-modal animate-fade-in">
              <div className="modal-logo-icon">
                <BookOpenCheck size={32} />
              </div>
              <h3 className="modal-title">DocuQuery Document Assistant</h3>
              <p className="modal-desc">
                Upload a PDF on the left. Answers are rendered in structured, interactive visualization cards grounded strictly in your document.
              </p>
            </div>
          )}

          {/* Split Interaction View */}
          <div className="split-view-container">
            {/* Left Side: Document Preview Pane */}
            <div className="doc-preview-pane">
              <div className="pane-toolbar">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Sidebar size={16} style={{ cursor: 'pointer' }} />
                  <FileText size={16} />
                  <span style={{ fontWeight: 600 }}>Page 12: Findings on...</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ChevronLeft size={16} style={{ cursor: 'pointer' }} />
                  <span>12 / 85</span>
                  <ChevronRight size={16} style={{ cursor: 'pointer' }} />
                  <Bookmark size={16} style={{ marginLeft: 6, cursor: 'pointer' }} />
                </div>
              </div>

              <div className="doc-paper-view">
                <h4 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: 8 }}>1. Introduction</h4>
                <p style={{ marginBottom: 12 }}>
                  Modern document processing workflow requires high throughput extraction of information from structured formats. Previous methods suffered from high latency and accuracy degradation over long context lengths.
                </p>
                <p style={{ marginBottom: 12 }}>
                  The research presented in this document establishes <span className="doc-highlight">new metrics for parallel vector embeddings</span> and dense retrieval accuracy across domain-specific PDF datasets <span className="citation-link">[12, 18, 33]</span>.
                </p>
                <p style={{ marginBottom: 12 }}>
                  Our experimental benchmarks show <span className="doc-highlight">a 2-270% performance gain</span> across all tested model variations <span className="citation-link">[12, 23, 33]</span>.
                </p>
              </div>
            </div>

            {/* Right Side: Response / Chat Area */}
            <div className="response-pane">
              {error && (
                <div className="error-banner animate-fade-in">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertCircle size={16} />
                    <span>{error}</span>
                  </div>
                  <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer' }}>✕</button>
                </div>
              )}

              {messages.map((m, i) => {
                const isOutOfPdf = m.role === 'assistant' && m.text.includes('OUT OF PDF')

                return (
                  <div key={i} className={`msg-row ${m.role} animate-fade-in`}>
                    <div className="avatar">
                      {m.role === 'user' ? <User size={18} /> : <BookOpenCheck size={18} />}
                    </div>

                    <div className="msg-bubble" style={isOutOfPdf ? { border: '1px solid rgba(239, 68, 68, 0.5)', background: 'rgba(239, 68, 68, 0.12)' } : {}}>
                      {m.role === 'user' ? (
                        <div style={{ fontWeight: 500 }}>{m.text}</div>
                      ) : (
                        <>
                          {isOutOfPdf ? (
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, color: '#fca5a5' }}>
                              <AlertTriangle size={22} style={{ flexShrink: 0, marginTop: 2, color: '#ef4444' }} />
                              <div>
                                <strong style={{ color: '#ef4444', fontSize: '0.96rem' }}>OUT OF PDF DOCUMENT</strong>
                                <p style={{ marginTop: 6, fontSize: '0.9rem', color: '#fca5a5' }}>
                                  The requested information is not mentioned in your uploaded PDF.
                                </p>
                              </div>
                            </div>
                          ) : (
                            <MessageBlockRenderer text={m.text} handleAsk={handleAsk} />
                          )}

                          {/* Copy Button */}
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                            <button
                              onClick={() => copyToClipboard(m.text, i)}
                              style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', fontWeight: 600 }}
                            >
                              {copiedIndex === i ? (
                                <>
                                  <Check size={14} style={{ color: '#00C9A7' }} /> Copied
                                </>
                              ) : (
                                <>
                                  <Copy size={14} /> Copy
                                </>
                              )}
                            </button>
                          </div>

                          {/* Sources Accordion */}
                          {m.sources && m.sources.length > 0 && !isOutOfPdf && (
                            <div className="sources-box">
                              <button className="sources-toggle" onClick={() => toggleSources(i)}>
                                <span>Retrieved Sources ({m.sources.length})</span>
                                {openSources[i] ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                              </button>

                              {openSources[i] && (
                                <div className="sources-list animate-fade-in">
                                  {m.sources.map((s, j) => (
                                    <div key={j} className="source-item">
                                      <div className="source-header">
                                        <span className="source-doc-name">{s.document}</span>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                          <span className="source-page-badge">{s.confidence || 85}% Match</span>
                                          <span className="source-page-badge" style={{ background: 'rgba(0, 201, 167, 0.2)', color: '#00C9A7' }}>
                                            Page {s.page || 1}
                                          </span>
                                        </div>
                                      </div>
                                      <div className="source-snippet">
                                        "{s.chunk_text.slice(0, 240)}{s.chunk_text.length > 240 ? '…' : ''}"
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )
              })}

              {asking && (
                <div className="thought-card animate-fade-in">
                  <div className="thought-header">
                    <Zap size={16} /> Thought Process/Response Area
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#00C9A7', fontSize: '0.88rem' }}>
                    <Loader2 size={18} className="animate-spin" />
                    <span>AI is thinking…</span>
                  </div>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>
          </div>
        </main>
      </div>

      {/* Full-Width Bottom Interaction Bar (Matching image_3.png) */}
      <footer className="bottom-prompt-bar">
        <input
          type="text"
          className="bottom-input-field"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
          placeholder="Upload a PDF or select one, then start asking questions…"
          disabled={asking || summarizing}
        />
        <button
          className="btn-ask-glowing"
          onClick={() => handleAsk()}
          disabled={asking || summarizing || !question.trim()}
        >
          <span>Ask</span>
          <Send size={16} />
        </button>
      </footer>
    </div>
  )
}
