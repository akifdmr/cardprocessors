// src/components/MessageBubble.jsx
import React from 'react';

const MessageBubble = ({ role, content }) => {
  const isUser = role === 'user';
  return (
    <div className={`message ${isUser ? 'user' : 'assistant'}`}>
      <div className="message-avatar">
        {isUser ? '👤' : '🤖'}
      </div>
      <div className="message-content">
        <strong>{isUser ? 'Sen' : 'Ollama'}</strong>
        <p>{content}</p>
      </div>
    </div>
  );
};

export default MessageBubble;