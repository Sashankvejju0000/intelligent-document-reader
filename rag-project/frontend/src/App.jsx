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
  BookOpenCheck
} from 'lucide-react'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

// Custom Human-Crafted Brand Logo Mark (Document + Precision Search Emblem)
const DocuLogo = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M14 2V8H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M8 12H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <path d="M8 16H11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <circle cx="16" cy="16" r="3" fill="#10b981" stroke="#060911" strokeWidth="1.5"/>
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

        // Section 1: Related Follow-up Suggestions Block
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
                <Zap size={16} style={{ color: '#10b981' }} />
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

        // Section 2: Header Cards
        if (trimmed.startsWith('#') || (trimmed.startsWith('**') && trimmed.endsWith('**') && trimmed.length < 70)) {
          const headerText = trimmed.replace(/^#+\s*/, '').replace(/\*\*/g, '')
          return (
            <div key={idx} className="block-header-card animate-fade-in">
              <div className="block-header-dot" />
              <span className="block-header-title">{headerText}</span>
            </div>
          )
        }

        // Section 3: List Item Block Cards
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

        // Section 4: Paragraph Glass Card
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

  const samplePrompts = [
    'Summarize the key points of the uploaded document.',
    'What are the main findings or conclusions?',
    'List any specific dates, numbers, or metrics mentioned.',
  ]

  return (
    <div className="app-container">
      {/* Header with Human-Crafted Brand Logo Mark */}
      <header className="header">
        <div className="logo-group">
          <div className="logo-icon">
            <DocuLogo />
          </div>
          <div>
            <h1 className="title">DocuQuery AI</h1>
            <p className="subtitle">Precision Document Reader • Sub-second Retrieval • Page Attribution</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="status-badge">
            <span
              className="status-dot"
              style={{ background: serverOnline ? '#10b981' : '#ef4444' }}
            />
            {serverOnline ? 'System Online' : 'System Offline'}
          </div>

          <button
            className="prompt-chip"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'rgba(16, 185, 129, 0.12)', borderColor: 'rgba(16, 185, 129, 0.3)' }}
            onClick={() => setShowSettings(!showSettings)}
          >
            <SlidersHorizontal size={14} /> Advanced
          </button>

          {messages.length > 0 && (
            <button className="prompt-chip" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px' }} onClick={exportTranscript} title="Export QA log as Markdown">
              <Download size={14} /> Export Log
            </button>
          )}

          {documents.length > 0 && (
            <button className="btn-reset" onClick={handleResetStore} title="Clear indexed knowledge store">
              <Trash2 size={14} /> Clear Store
            </button>
          )}
        </div>
      </header>

      {/* Advanced Settings Drawer */}
      {showSettings && (
        <div className="animate-fade-in" style={{ background: 'rgba(13, 19, 33, 0.95)', border: '1px solid rgba(16, 185, 129, 0.35)', padding: '14px 20px', borderRadius: 14, marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem', boxShadow: '0 8px 25px rgba(16, 185, 129, 0.15)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10b981', fontWeight: 700 }}>
              <ShieldCheck size={17} /> Fast ONNX Tensor Batching O(M/64) Active
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}>
              <span>Context Depth (Top K):</span>
              <select
                value={topK}
                onChange={(e) => setTopK(Number(e.target.value))}
                style={{ background: 'rgba(6, 9, 17, 0.8)', color: '#fff', border: '1px solid var(--glass-border)', padding: '5px 10px', borderRadius: 6, outline: 'none', fontWeight: 'bold' }}
              >
                <option value={3}>3 Chunks (Fastest)</option>
                <option value={5}>5 Chunks (Balanced)</option>
                <option value={8}>8 Chunks (Deep Context)</option>
              </select>
            </div>
          </div>
          <span style={{ fontSize: '0.76rem', color: '#6ee7b7', fontWeight: 600 }}>✨ Automatic Follow-up Suggestions Active</span>
        </div>
      )}

      {/* Main Grid */}
      <div className="main-layout">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="section-title">
            <span>Knowledge Base</span>
            <BookOpen size={16} />
          </div>

          {/* Drag and Drop Zone */}
          <div
            className={`dropzone ${isDragOver ? 'active' : ''}`}
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
            <div className="dropzone-icon">
              {uploading ? <Loader2 size={24} className="animate-spin" /> : <Upload size={24} />}
            </div>
            <div className="dropzone-text">
              {uploading ? 'Processing & Vector Indexing PDF…' : 'Drop your PDF here or Browse'}
            </div>
            <div className="dropzone-hint">Parses via pdfium C-engine • Parallel ONNX tensor embeddings</div>
          </div>

          {/* Indexed Documents List & Summary Button */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0 }}>
            <div className="section-title" style={{ fontSize: '0.8rem' }}>
              <span>Indexed PDFs ({documents.length})</span>
            </div>

            {documents.length === 0 ? (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', textAlign: 'center', padding: '18px 0' }}>
                No documents uploaded yet. Upload a PDF to start asking questions.
              </div>
            ) : (
              <>
                <div className="file-card-list">
                  {documents.map((doc, idx) => (
                    <div key={idx} className="file-card animate-fade-in">
                      <FileText size={20} className="file-icon" />
                      <div className="file-info">
                        <div className="file-name" title={doc.filename}>{doc.filename}</div>
                        <div className="file-meta">
                          <span>{doc.pages || 1} pages</span>
                          <span>•</span>
                          <span>{doc.chunks} chunks</span>
                          {doc.words > 0 && (
                            <>
                              <span>•</span>
                              <span>{doc.words.toLocaleString()} words</span>
                            </>
                          )}
                        </div>
                      </div>
                      <CheckCircle2 size={16} style={{ color: '#10b981' }} />
                    </div>
                  ))}
                </div>

                <button
                  className="btn-send"
                  onClick={handleSummarizePDF}
                  disabled={summarizing}
                  style={{ marginTop: 6, background: 'linear-gradient(135deg, #10b981, #06b6d4)', justifyContent: 'center' }}
                >
                  {summarizing ? <Loader2 size={16} className="animate-spin" /> : <FileSearch size={16} />}
                  <span>{summarizing ? 'Generating Summary…' : 'Summarize PDF'}</span>
                </button>
              </>
            )}
          </div>
        </aside>

        {/* Chat Section */}
        <section className="chat-section">
          {error && (
            <div className="error-banner animate-fade-in">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
              <button
                onClick={() => setError('')}
                style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontWeight: 'bold' }}
              >
                ✕
              </button>
            </div>
          )}

          <div className="chat-messages">
            {messages.length === 0 ? (
              <div className="welcome-box animate-fade-in">
                <div className="welcome-icon">
                  <BookOpenCheck size={30} />
                </div>
                <h3 className="welcome-title">DocuQuery Document Assistant</h3>
                <p className="welcome-desc">
                  Upload a PDF on the left. Answers are rendered in structured, interactive visualization cards grounded strictly in your document.
                </p>

                {documents.length > 0 && (
                  <div className="suggested-prompts">
                    <div style={{ fontSize: '0.75rem', color: '#6ee7b7', marginBottom: 6, textAlign: 'left', fontWeight: 800 }}>
                      SUGGESTED QUESTIONS
                    </div>
                    {samplePrompts.map((sp, i) => (
                      <button key={i} className="prompt-chip" onClick={() => handleAsk(sp)}>
                        👉 {sp}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              messages.map((m, i) => {
                const isOutOfPdf = m.role === 'assistant' && m.text.includes('OUT OF PDF')

                return (
                  <div key={i} className={`msg-row ${m.role} animate-fade-in`}>
                    <div className="avatar">
                      {m.role === 'user' ? <User size={16} /> : <BookOpenCheck size={16} />}
                    </div>

                    <div className="msg-bubble" style={isOutOfPdf ? { border: '1px solid rgba(239, 68, 68, 0.4)', background: 'rgba(239, 68, 68, 0.1)' } : {}}>
                      {m.role === 'user' ? (
                        <div style={{ fontWeight: 500 }}>{m.text}</div>
                      ) : (
                        <>
                          {isOutOfPdf ? (
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, color: '#fca5a5' }}>
                              <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: 2, color: '#ef4444' }} />
                              <div>
                                <strong style={{ color: '#ef4444', fontSize: '0.94rem' }}>OUT OF PDF DOCUMENT</strong>
                                <p style={{ marginTop: 4, fontSize: '0.88rem', color: '#fca5a5' }}>
                                  The requested information is not mentioned in your uploaded PDF.
                                </p>
                              </div>
                            </div>
                          ) : (
                            <MessageBlockRenderer text={m.text} handleAsk={handleAsk} />
                          )}

                          {/* Copy Answer Button */}
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                            <button
                              onClick={() => copyToClipboard(m.text, i)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-dim)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                fontSize: '0.76rem',
                                fontWeight: 600
                              }}
                            >
                              {copiedIndex === i ? (
                                <>
                                  <Check size={13} style={{ color: '#10b981' }} /> Copied
                                </>
                              ) : (
                                <>
                                  <Copy size={13} /> Copy
                                </>
                              )}
                            </button>
                          </div>

                          {/* Sources Accordion */}
                          {m.sources && m.sources.length > 0 && !isOutOfPdf && (
                            <div className="sources-box">
                              <button className="sources-toggle" onClick={() => toggleSources(i)}>
                                <span>Retrieved Sources ({m.sources.length})</span>
                                {openSources[i] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </button>

                              {openSources[i] && (
                                <div className="sources-list animate-fade-in">
                                  {m.sources.map((s, j) => (
                                    <div key={j} className="source-item">
                                      <div className="source-header">
                                        <span className="source-doc-name">{s.document}</span>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                          <span className="source-page-badge">
                                            {s.confidence || 85}% Match
                                          </span>
                                          <span className="source-page-badge" style={{ background: 'rgba(16, 185, 129, 0.18)', color: '#6ee7b7' }}>
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
              })
            )}

            {asking && (
              <div className="msg-row assistant animate-fade-in">
                <div className="avatar">
                  <BookOpenCheck size={16} />
                </div>
                <div className="msg-bubble" style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)' }}>
                  <Loader2 size={18} className="animate-spin" style={{ color: '#10b981' }} />
                  <span>Searching vector database & rendering interactive blocks…</span>
                </div>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Chat Input Bar */}
          <div className="chat-input-bar">
            <input
              type="text"
              className="input-field"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
              placeholder={
                documents.length === 0
                  ? 'Upload a PDF on the left to start asking questions…'
                  : 'Ask a question grounded in your uploaded documents…'
              }
              disabled={asking || summarizing}
            />
            <button
              className="btn-send"
              onClick={() => handleAsk()}
              disabled={asking || summarizing || !question.trim()}
            >
              <span>Ask</span>
              <Send size={16} />
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
