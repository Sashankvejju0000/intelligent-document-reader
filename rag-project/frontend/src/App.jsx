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
  ChevronLeft,
  ChevronRight,
  Bookmark,
  Sidebar
} from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

// DocuQuery AI Vibrant Cyan Rounded Glass Logo Icon
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
  
  // Dynamic Document Viewer State
  const [selectedPage, setSelectedPage] = useState(1)
  const [activeSnippet, setActiveSnippet] = useState('')
  
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

      // Auto-jump PDF viewer to top matching source page & snippet!
      if (data.sources && data.sources.length > 0) {
        jumpToPage(data.sources[0].page || 1, data.sources[0].chunk_text || '')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setAsking(false)
    }
  }

  function jumpToPage(pageNum, snippetText = '') {
    setSelectedPage(pageNum)
    if (snippetText) setActiveSnippet(snippetText)
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
      setSelectedPage(1)
      setActiveSnippet('')
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

  const activeDoc = documents.length > 0 ? documents[0] : null
  const maxPages = activeDoc ? activeDoc.pages : 1

  return (
    <div className="app-container">
      {/* Header Banner */}
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

          {/* PDF Drop Zone */}
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

          {/* INDEXED PDFS Section (ONLY SHOW WHEN PDF IS ACTUALLY UPLOADED) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
            <div className="panel-section-header" style={{ fontSize: '0.8rem' }}>
              <span>INDEXED PDFS ({documents.length})</span>
            </div>

            {documents.length === 0 ? (
              <div style={{ fontSize: '0.82rem', color: 'rgba(240, 253, 250, 0.5)', textAlign: 'center', padding: '24px 12px', border: '1px dashed rgba(0, 201, 167, 0.2)', borderRadius: 12 }}>
                No PDF documents uploaded yet. Upload a PDF file above to start questioning.
              </div>
            ) : (
              <>
                <div className="file-card-group">
                  {documents.map((doc, idx) => (
                    <div key={idx} className="pdf-card animate-fade-in" style={{ borderLeft: '3px solid #00C9A7' }}>
                      <div className="pdf-thumb-box">
                        <FileText size={20} />
                      </div>
                      <div className="pdf-details">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div className="pdf-filename" title={doc.filename}>{doc.filename}</div>
                          <CheckCircle2 size={16} style={{ color: '#00C9A7' }} />
                        </div>
                        <div className="pdf-meta-line">
                          <span>{doc.pages || 1} Pages</span>
                          <span>•</span>
                          <span>{doc.chunks} chunks</span>
                          {doc.words > 0 && (
                            <>
                              <span>•</span>
                              <span>{doc.words.toLocaleString()} words</span>
                            </>
                          )}
                        </div>
                        <div className="progress-bar-bg">
                          <div className="progress-bar-fill" style={{ width: '100%' }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  className="btn-ask-glowing"
                  onClick={handleSummarizePDF}
                  disabled={summarizing}
                  style={{ marginTop: 8, justifyContent: 'center' }}
                >
                  {summarizing ? <Loader2 size={18} className="animate-spin" /> : <FileSearch size={18} />}
                  <span>{summarizing ? 'Generating Summary…' : 'Summarize PDF'}</span>
                </button>
              </>
            )}
          </div>
        </aside>

        {/* Central Interaction Window */}
        <main className="central-window">
          {/* Neural Network Graphic Overlay */}
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

          {/* Overlaid Central Welcome Modal (Shows only when no messages exist) */}
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
            {/* Left Side: Document Preview Pane with Dynamic Page Jumps */}
            <div className="doc-preview-pane">
              <div className="pane-toolbar">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Sidebar size={16} />
                  <FileText size={16} />
                  <span style={{ fontWeight: 600 }}>
                    {activeDoc ? activeDoc.filename : 'Document Preview'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => setSelectedPage(Math.max(1, selectedPage - 1))}
                    disabled={selectedPage <= 1}
                    style={{ background: 'none', border: 'none', color: '#00C9A7', cursor: 'pointer' }}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span style={{ fontWeight: 'bold', color: '#00C9A7' }}>
                    Page {selectedPage} / {maxPages}
                  </span>
                  <button
                    onClick={() => setSelectedPage(Math.min(maxPages, selectedPage + 1))}
                    disabled={selectedPage >= maxPages}
                    style={{ background: 'none', border: 'none', color: '#00C9A7', cursor: 'pointer' }}
                  >
                    <ChevronRight size={18} />
                  </button>
                  <Bookmark size={16} style={{ marginLeft: 6, color: '#00C9A7' }} />
                </div>
              </div>

              <div className="doc-paper-view">
                <h4 style={{ fontSize: '1.05rem', fontWeight: 'bold', marginBottom: 10, color: '#0f172a' }}>
                  📄 Document Page {selectedPage} Content
                </h4>

                {activeSnippet ? (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: '0.78rem', color: '#0284c7', fontWeight: 'bold', marginBottom: 6 }}>
                      🎯 RETRIEVED EXCERPT FROM PAGE {selectedPage}:
                    </div>
                    <p className="doc-highlight" style={{ fontSize: '0.92rem', lineHeight: '1.6', color: '#0f172a', fontWeight: '500' }}>
                      "{activeSnippet}"
                    </p>
                  </div>
                ) : (
                  <p style={{ marginBottom: 12, fontStyle: 'italic', color: '#475569' }}>
                    {activeDoc
                      ? `Viewing Page ${selectedPage} of ${activeDoc.filename}. Ask any question or click a page citation to view extracted snippets.`
                      : 'Upload a PDF on the left. Once indexed, you can jump directly to any page cited in your answers.'}
                  </p>
                )}
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

                          {/* Sources Accordion with Clickable Page Navigation */}
                          {m.sources && m.sources.length > 0 && !isOutOfPdf && (
                            <div className="sources-box">
                              <button className="sources-toggle" onClick={() => toggleSources(i)}>
                                <span>Retrieved Sources ({m.sources.length})</span>
                                {openSources[i] ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                              </button>

                              {openSources[i] && (
                                <div className="sources-list animate-fade-in">
                                  {m.sources.map((s, j) => (
                                    <div
                                      key={j}
                                      className="source-item"
                                      onClick={() => jumpToPage(s.page || 1, s.chunk_text || '')}
                                      style={{ cursor: 'pointer' }}
                                      title="Click to jump to this page in the PDF viewer"
                                    >
                                      <div className="source-header">
                                        <span className="source-doc-name">{s.document}</span>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                          <span className="source-page-badge">{s.confidence || 85}% Match</span>
                                          <span className="source-page-badge" style={{ background: 'rgba(0, 201, 167, 0.25)', color: '#00C9A7', fontWeight: 'bold' }}>
                                            👉 Open Page {s.page || 1}
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
                    <span>AI is thinking & extracting page references…</span>
                  </div>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>
          </div>
        </main>
      </div>

      {/* Full-Width Bottom Interaction Bar */}
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
