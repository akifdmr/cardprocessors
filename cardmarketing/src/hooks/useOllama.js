import { useState, useCallback, useRef } from 'react';

const OLLAMA_API_URL = '/api/ollama/chat';

const useOllama = (defaultModel = 'qwen2.5:7b') => {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [streamingResponse, setStreamingResponse] = useState('');
  const abortControllerRef = useRef(null);

  // Yeni mesaj gönder (kullanıcı mesajı + AI yanıtı al)
  const sendMessage = useCallback(async (userMessage) => {
    if (!userMessage.trim()) return;

    // Kullanıcı mesajını geçmişe ekle
    const updatedMessages = [
      ...messages,
      { role: 'user', content: userMessage }
    ];
    setMessages(updatedMessages);
    setLoading(true);
    setError(null);
    setStreamingResponse('');

    // Önceki isteği iptal et (varsa)
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch(OLLAMA_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          model: defaultModel,
          messages: updatedMessages,
          stream: true,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        let data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = { responseMessage: text };
        }
        throw new Error(data?.failureReason || data?.responseMessage || data?.error || `HTTP error! status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Ollama response body is empty');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = buffer.split('\n');
        buffer = done ? '' : lines.pop() || '';
        for (const line of lines) {
          if (line.trim() === '') continue;
          try {
            const json = JSON.parse(line);
            const content = json.message?.content || '';
            fullResponse += content;
            setStreamingResponse(fullResponse);
          } catch (e) {
            buffer = `${line}\n${buffer}`;
          }
        }
        if (done) break;
      }

      // AI yanıtını geçmişe ekle
      const aiMessage = { role: 'assistant', content: fullResponse || 'Yanıt boş döndü.' };
      setMessages(prev => [...prev, aiMessage]);
      setStreamingResponse('');
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message);
        console.error('Ollama API error:', err);
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  }, [messages, defaultModel]);

  // Sohbeti temizle
  const clearChat = useCallback(() => {
    setMessages([]);
    setStreamingResponse('');
    setError(null);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  return {
    messages,
    loading,
    error,
    streamingResponse,
    sendMessage,
    clearChat,
  };
};

export default useOllama;
