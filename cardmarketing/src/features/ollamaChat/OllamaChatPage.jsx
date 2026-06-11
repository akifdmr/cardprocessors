// src/components/ChatInterface.jsx
import React, { useState, useRef, useEffect } from 'react';
import useOllama from '../../hooks/useOllama';
import MessageBubble from './MessageBubble';
import LoadingDots from './LoadingDots';
import ModelSelector from './ModelSelector';
import { api } from '../../api/client';

export function OllamaChatPage() {
  const [input, setInput] = useState('');
  const [model, setModel] = useState('qwen2.5:7b');
  const [status, setStatus] = useState(null);
  const { messages, loading, error, streamingResponse, sendMessage, clearChat } = useOllama(model);
  const messagesEndRef = useRef(null);

  async function loadStatus() {
    try {
      setStatus(await api('/ollama/status'));
    } catch (err) {
      setStatus(err.data || { ok: false, message: err.message, status: 'unhealthy' });
    }
  }

  // Otomatik kaydırma
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingResponse]);

  useEffect(() => {
    loadStatus();
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (input.trim() && !loading) {
      sendMessage(input);
      setInput('');
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h2>Ollama AI Sohbet</h2>
        <div className="chat-header-actions">
          <span className={`pill ${status?.ok ? 'good' : 'bad'}`}>{status?.status || 'checking'}</span>
          <button onClick={loadStatus} className="ghost small" type="button">Status</button>
          <button onClick={clearChat} className="clear-button" type="button">Temizle</button>
        </div>
      </div>
      {status?.message ? <div className="chat-status muted">{status.message}</div> : null}
      <ModelSelector currentModel={model} onModelChange={setModel} />

      <div className="messages-area">
        {messages.map((msg, idx) => (
          <MessageBubble key={idx} role={msg.role} content={msg.content} />
        ))}
        {loading && streamingResponse && (
          <MessageBubble role="assistant" content={streamingResponse} />
        )}
        {loading && !streamingResponse && (
          <div className="loading-indicator">
            <LoadingDots />
          </div>
        )}
        {error && <div className="error-message">Hata: {error}</div>}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="input-form">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Mesajınızı yazın..."
          disabled={loading}
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Yanıt bekleniyor...' : 'Gönder'}
        </button>
      </form>
    </div>
  );
}

export default OllamaChatPage;
