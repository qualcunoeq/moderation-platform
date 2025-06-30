import OpenAI from 'openai';

// Inizializza il client OpenAI usando la chiave API dalle variabili d'ambiente.
// La chiave viene letta da process.env.OPENAI_API_KEY, configurata nel file .env.local
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default openai;