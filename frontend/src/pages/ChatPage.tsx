import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import logo from '../assets/logo.png'
import '../App.css'

interface Message {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

const API_URL = (import.meta.env.VITE_API_BASE_URL as string) ?? 'http://localhost:3001'

const SUGGESTIONS = [
  'Me explica a task BANK-4087',
  'Nos usamos o RabbitMQ na Onfly?',
  'Com quais microserviços o OdinMS integra?',
  'Qual a arquitetura do projeto BANK?',
  'Existe algum padrão de código na task BANK-4087?',
]

const THINKING_PHRASES = [
  'Pensando...',
  'Consultando Jira...',
  'Analisando o diff...',
  'Verificando GitLab...',
  'Processando contexto...',
  'Elaborando resposta...',
  'Verificando fontes...',
]

function ThinkingIndicator() {
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const fade = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setIndex(i => (i + 1) % THINKING_PHRASES.length)
        setVisible(true)
      }, 300)
    }, 1800)
    return () => clearInterval(fade)
  }, [])

  return (
    <div className="thinking-indicator">
      <span className="thinking-dots">
        <span /><span /><span />
      </span>
      <span
        className="thinking-text"
        style={{ opacity: visible ? 1 : 0 }}
      >
        {THINKING_PHRASES[index]}
      </span>
    </div>
  )
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [input])

  async function sendMessage() {
    const text = input.trim()
    if (!text || isLoading) return

    const history = messages
      .filter(m => !m.streaming)
      .map(({ role, content }) => ({ role, content }))

    setInput('')
    setIsLoading(true)

    setMessages(prev => [
      ...prev,
      { role: 'user', content: text },
      { role: 'assistant', content: '', streaming: true },
    ])

    try {
      const resp = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
      })

      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`)

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''

        for (const event of events) {
          const dataLine = event.split('\n').find(l => l.startsWith('data:'))
          if (!dataLine) continue
          try {
            const parsed = JSON.parse(dataLine.slice(5).trim())

            if (parsed.type === 'chunk') {
              accumulated += parsed.text
              setMessages(prev => {
                const next = [...prev]
                next[next.length - 1] = { role: 'assistant', content: accumulated, streaming: true }
                return next
              })
            }

            if (parsed.type === 'done' || parsed.type === 'error') {
              const finalContent =
                parsed.type === 'error'
                  ? 'Ocorreu um erro ao gerar a resposta. Tente novamente.'
                  : accumulated
              setMessages(prev => {
                const next = [...prev]
                next[next.length - 1] = { role: 'assistant', content: finalContent, streaming: false }
                return next
              })
            }
          } catch {
            // evento SSE malformado — ignora
          }
        }
      }
    } catch {
      setMessages(prev => {
        const next = [...prev]
        next[next.length - 1] = {
          role: 'assistant',
          content: 'Não foi possível conectar ao servidor. Verifique se o backend está rodando na porta 3001.',
          streaming: false,
        }
        return next
      })
    } finally {
      setIsLoading(false)
      textareaRef.current?.focus()
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <img src={logo} alt="brAInfly" className="app-logo-img" />
        <div className="app-header-divider" />
        <p className="app-subtitle">Hub de Conhecimento · Onfly</p>
      </header>

      <main className="messages-area">
        {messages.length === 0 && (
          <div className="empty-state">
            <img src={logo} alt="brAInfly" className="empty-logo" />
            <p className="empty-desc">
              Pergunte sobre tasks do Jira, decisões arquiteturais<br />ou padrões de código da Onfly.
            </p>
            <div className="suggestions">
              {SUGGESTIONS.map(s => (
                <button key={s} className="suggestion-chip" onClick={() => setInput(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`msg-row msg-row--${msg.role}`}>
            {msg.role === 'assistant' && (
              <div className="assistant-avatar">
                <img src={logo} alt="brAInfly" />
              </div>
            )}
            <div className={`bubble bubble--${msg.role}`}>
              {msg.role === 'assistant' ? (
                msg.streaming && !msg.content ? (
                  <ThinkingIndicator />
                ) : (
                  <div className="md">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                )
              ) : (
                <p>{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </main>

      <footer className="input-area">
        <div className="input-row">
          <textarea
            ref={textareaRef}
            className="chat-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pergunte sobre uma task (ex: BANK-123), arquitetura ou padrões da Onfly..."
            rows={1}
            disabled={isLoading}
          />
          <button
            className="send-btn"
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            aria-label="Enviar mensagem"
          >
            {isLoading ? <span className="dot-pulse" /> : '↑'}
          </button>
        </div>
        <p className="input-hint">Enter para enviar · Shift+Enter para quebrar linha</p>
      </footer>
    </div>
  )
}
