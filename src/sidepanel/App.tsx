import { useState, useRef, useEffect } from 'react'
import type { Message } from '../shared/types'
import { AgentController } from './agent-controller'
import './App.css'

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    { 
      role: 'assistant', 
      content: '안녕하세요! Web Voyager입니다. 웹 페이지에서 무엇을 도와드릴까요? 예: "구글에서 ChatGPT 검색해줘", "이 페이지에서 로그인 버튼 클릭해줘"',
      timestamp: Date.now()
    }
  ])
  const [input, setInput] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [currentAction, setCurrentAction] = useState<string>('')
  const [showApiKeyInput, setShowApiKeyInput] = useState(false)
  const [apiKey, setApiKey] = useState(() => {
    return localStorage.getItem('claude-api-key') || '';
  })
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const agentController = useRef(new AgentController())

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    if (apiKey.trim()) {
      agentController.current.setClaudeApiKey(apiKey.trim())
      console.log('[App] API key loaded from localStorage')
    }
  }, [])

  const handleStop = () => {
    console.log('[App] Stopping agent execution');
    agentController.current.stop();
    setCurrentAction('작업을 중단하고 있습니다...');
  }
  
  const handleSubmit = async () => {
    if (!input.trim() || isProcessing) return

    const userMessage: Message = { 
      role: 'user', 
      content: input,
      timestamp: Date.now()
    }
    
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsProcessing(true)
    setCurrentAction('작업을 준비하고 있습니다...')

    try {
      const onProgress = (action: string) => {
        setCurrentAction(action)
      }

      const result = await agentController.current.runAgent(input, onProgress)

      let content = '';
      if (result.success) {
        const reasoningStep = result.steps.find(step => step.reasoning);
        if (reasoningStep) {
          content = `✅ 작업 완료!\n\n${reasoningStep.reasoning}\n\n단계별 실행:\n${result.summary}`;
        } else {
          content = `✅ 작업 완료!\n\n${result.summary}`;
        }
      } else {
        content = `❌ 작업 실패: ${result.error}`;
      }
      
      const assistantMessage: Message = {
        role: 'assistant',
        content,
        timestamp: Date.now()
      }

      setMessages(prev => [...prev, assistantMessage])

    } catch (error) {
      console.error('Agent execution error:', error)
      const errorMessage: Message = {
        role: 'assistant',
        content: `❌ 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
        timestamp: Date.now()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsProcessing(false)
      setCurrentAction('')
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('ko-KR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }

  const handleApiKeySubmit = () => {
    if (apiKey.trim()) {
      localStorage.setItem('claude-api-key', apiKey.trim())
      
      agentController.current.setClaudeApiKey(apiKey.trim())
      setShowApiKeyInput(false)
      
      const successMessage: Message = {
        role: 'assistant',
        content: '✅ Claude API 키가 설정되고 저장되었습니다! 이제 AI 분석 기능을 사용할 수 있습니다.',
        timestamp: Date.now()
      }
      setMessages(prev => [...prev, successMessage])
    }
  }

  const handleApiKeyClear = () => {
    localStorage.removeItem('claude-api-key')
    setApiKey('')
    setShowApiKeyInput(false)
    
    const clearMessage: Message = {
      role: 'assistant',
      content: '🗑️ API 키가 삭제되었습니다.',
      timestamp: Date.now()
    }
    setMessages(prev => [...prev, clearMessage])
  }

  return (
    <div className="voyager-app">
      <div className="header">
        <div className="header-top">
          <div>
            <h1>🚀 Web Voyager</h1>
            <p>AI 브라우저 자동화 어시스턴트</p>
          </div>
          <button 
            onClick={() => setShowApiKeyInput(!showApiKeyInput)}
            className="settings-button"
            title="API 키 설정"
          >
            ⚙️
          </button>
        </div>
        
        {showApiKeyInput && (
          <div className="api-key-input">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Claude API 키를 입력하세요"
              onKeyPress={(e) => e.key === 'Enter' && handleApiKeySubmit()}
            />
            <button onClick={handleApiKeySubmit} disabled={!apiKey.trim()}>
              저장
            </button>
            {localStorage.getItem('claude-api-key') && (
              <button onClick={handleApiKeyClear} style={{background: 'rgba(255,0,0,0.2)'}}>
                삭제
              </button>
            )}
            <button onClick={() => setShowApiKeyInput(false)}>
              취소
            </button>
          </div>
        )}
      </div>

      <div className="messages-container">
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            <div className="message-content">
              {msg.content.split('\n').map((line, j) => (
                <div key={j}>{line}</div>
              ))}
            </div>
            {msg.timestamp && (
              <div className="message-time">{formatTime(msg.timestamp)}</div>
            )}
          </div>
        ))}
        
        {isProcessing && currentAction && (
          <div className="message assistant processing">
            <div className="message-content">
              <div className="loading-indicator">
                ⏳ {currentAction}
                <button 
                  className="stop-button"
                  onClick={handleStop}
                  title="작업 중단"
                  style={{
                    marginLeft: '10px',
                    padding: '4px 8px',
                    background: '#ff4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  ⏹️ 중단
                </button>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      <div className="input-container">
        <div className="input-wrapper">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="무엇을 도와드릴까요? (Enter: 전송, Shift+Enter: 줄바꿈)"
            disabled={isProcessing}
            rows={3}
          />
          <button 
            onClick={handleSubmit} 
            disabled={isProcessing || !input.trim()}
            className="send-button"
          >
            {isProcessing ? '⏳' : '🚀'}
          </button>
        </div>
      </div>
    </div>
  )
}
