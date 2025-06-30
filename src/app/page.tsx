'use client'; // Questo indica che il componente è un Client Component

import { useState } from 'react';

export default function Home() {
  // Stato per il contenuto da moderare inserito dall'utente
  const [content, setContent] = useState('');
  // Stato per il risultato della moderazione ricevuto dall'API
  const [result, setResult] = useState<any>(null);
  // Stato per gestire lo stato di caricamento del bottone
  const [loading, setLoading] = useState(false);

  // Funzione asincrona per testare la moderazione
  const testModeration = async () => {
    // Non fare nulla se il campo di testo è vuoto
    if (!content.trim()) return;

    setLoading(true); // Imposta lo stato di caricamento a true
    try {
      // Esegue una richiesta POST alla tua API di moderazione
      const response = await fetch('/api/moderate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }), // Invia il contenuto come JSON
      });

      const data = await response.json(); // Parsifica la risposta JSON
      setResult(data); // Imposta il risultato nel tuo stato
    } catch (error) {
      console.error('Error:', error); // Logga eventuali errori
    } finally {
      setLoading(false); // Reimposta lo stato di caricamento a false, indipendentemente dal successo/errore
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-center">
          🛡️ AI Content Moderation
        </h1>

        <div className="bg-white p-6 rounded-lg shadow-lg">
          {/* Area di testo per l'input del contenuto */}
          <textarea
            className="w-full h-32 p-4 border rounded-lg mb-4 resize-none"
            placeholder="Inserisci il contenuto da moderare..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />

          {/* Bottone per avviare la moderazione */}
          <button
            onClick={testModeration}
            disabled={loading || !content.trim()}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Analizzando...' : 'Modera Contenuto'}
          </button>

          {/* Se c'è un risultato, lo visualizza */}
          {result && (
            <div className={`mt-6 p-4 rounded-lg ${
              result.flagged ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
            }`}>
              <h3 className="font-bold mb-2">Risultato:</h3>
              <p className="mb-2">{result.message}</p>
              <div className="text-sm">
                <p><strong>Azione:</strong> {result.action}</p>
                <p><strong>Severità:</strong> {result.severity}</p>
                {/* ECCO IL BLOCCO CHE CAUSAVA L'ERRORE E CHE ORA INCLUDIAMO */}
                {result.categories && result.categories.length > 0 && (
                  <p><strong>Categorie:</strong> {result.categories.join(', ')}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}