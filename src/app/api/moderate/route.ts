import { NextRequest, NextResponse } from 'next/server';
import openai from '@/lib/openai'; // Importa il client OpenAI configurato
import { supabase } from '@/lib/supabase'; // Importa il client Supabase configurato

// Questa funzione gestisce le richieste POST all'endpoint /api/moderate
export async function POST(request: NextRequest) {
  try {
    // Estrae il contenuto da moderare e un userId (opzionale, default 'anonymous') dal corpo della richiesta JSON
    const { content, userId = 'anonymous' } = await request.json();

    // Validazione base: il contenuto è richiesto e deve essere una stringa
    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        { error: 'Content is required' },
        { status: 400 } // Bad Request
      );
    }

    // --- 1. Moderazione OpenAI ---
    // Invia il contenuto all'API di moderazione di OpenAI
    const moderation = await openai.moderations.create({
      input: content,
    });
    const result = moderation.results[0]; // Prende il primo (e unico) risultato della moderazione

    // --- 2. Determina azione e severità ---
    // Se OpenAI ha segnalato il contenuto, l'azione è 'blocked', altrimenti 'approved'
    const action = result.flagged ? 'blocked' : 'approved';
    // Calcola la severità basandosi sui punteggi delle categorie di moderazione
    const severity = calculateSeverity(result.category_scores);

    // --- 3. Salva in database (Supabase) ---
    // Inserisce il log della moderazione nella tabella 'moderation_logs' di Supabase
    const { data, error } = await supabase
      .from('moderation_logs')
      .insert({
        content: content.substring(0, 1000), // Limita il contenuto a 1000 caratteri per evitare overflow
        user_id: userId,
        flagged: result.flagged,
        categories: result.categories,
        category_scores: result.category_scores,
        action: action,
        severity: severity,
        created_at: new Date().toISOString(), // Data e ora della moderazione
      });

    // Gestisce eventuali errori durante l'inserimento nel database
    if (error) {
      console.error('Database error:', error);
      // Non blocchiamo la risposta successiva anche in caso di errore DB,
      // ma lo logghiamo per debug
    }

    // --- 4. Response ---
    // Restituisce la risposta JSON al client
    return NextResponse.json({
      success: true,
      flagged: result.flagged, // Indica se il contenuto è stato segnalato
      action: action, // Azione intrapresa (blocked/approved)
      severity: severity, // Livello di severità
      categories: Object.keys(result.categories).filter(
        key => result.categories[key]
      ), // Categorie specifiche che hanno causato la segnalazione
      scores: result.category_scores, // Punteggi dettagliati per ogni categoria
      message: result.flagged
        ? 'Content violates community guidelines'
        : 'Content approved',
    });
  } catch (error) {
    // Gestisce errori generici che possono verificarsi durante il processo
    console.error('Moderation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 } // Internal Server Error
    );
  }
}

// Funzione helper per calcolare la severità basandosi sui punteggi delle categorie di OpenAI
function calculateSeverity(scores: any): 'low' | 'medium' | 'high' {
  // Trova il punteggio massimo tra tutte le categorie segnalate
  const maxScore = Math.max(...Object.values(scores) as number[]);

  // Determina il livello di severità
  if (maxScore > 0.8) return 'high';
  if (maxScore > 0.5) return 'medium';
  return 'low';
}