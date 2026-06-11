import { useGenerate } from 'react-ollama';

function AIChat() {
    const { generate, loading, error, response } = useGenerate({ 
        model: 'qwen2.5:7b' 
    });

    const handleSubmit = (prompt) => {
        generate(prompt);
    };

    return (
        <div>
            {loading && <p>AI yanıt veriyor...</p>}
            {response && <p><strong>AI:</strong> {response}</p>}
            <button onClick={() => handleSubmit('Merhaba Kanka!')}>Sor</button>
        </div>
    );
}
