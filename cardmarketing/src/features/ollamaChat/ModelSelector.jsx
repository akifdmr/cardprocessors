// src/components/ModelSelector.jsx
import React, { useState, useEffect } from 'react';

const ModelSelector = ({ currentModel, onModelChange }) => {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  function loadModels() {
    setLoading(true);
    setError('');
    setMessage('');
    fetch('/api/ollama/tags', { credentials: 'include' })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.responseMessage || data.message || `HTTP ${res.status}`);
        return data;
      })
      .then(data => {
        const nextModels = data.models || [];
        setModels(nextModels);
        setMessage(data.message || '');
        if (nextModels.length && !nextModels.some((model) => model.name === currentModel)) {
          onModelChange(nextModels[0].name);
        }
      })
      .catch(err => {
        setModels([]);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div className="model-selector"><span className="muted">Modeller yükleniyor...</span></div>;

  if (error || !models.length) {
    return (
      <div className="model-selector">
        <span className="muted">{error ? `Model listesi alınamadı: ${error}` : message || 'Model bulunamadı'}</span>
        <input value={currentModel} onChange={(event) => onModelChange(event.target.value)} placeholder="qwen2.5:7b" />
        <button className="ghost small" type="button" onClick={loadModels}>Yenile</button>
      </div>
    );
  }

  return (
    <div className="model-selector">
      <select value={currentModel} onChange={(e) => onModelChange(e.target.value)}>
        {models.map(model => (
          <option key={model.name} value={model.name}>{model.name}</option>
        ))}
      </select>
      <button className="ghost small" type="button" onClick={loadModels}>Yenile</button>
    </div>
  );
};

export default ModelSelector;
