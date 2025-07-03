// src/app/api/moderate/route.ts

// Imports necessari
import { createClient } from '@supabase/supabase-js'; // Se userai Supabase per loggare o salvare dati di moderazione
import OpenAI from 'openai'; // Per interagire con l'API di OpenAI
import jwt from 'jsonwebtoken'; // Per verificare il token JWT

// Configurazione di Supabase (se necessaria, altrimenti puoi rimuoverla)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// Configurazione OpenAI
const openaiApiKey = process.env.OPENAI_API_KEY!; // Assicurati di avere questa variabile d'ambiente su Vercel!
const openai = new OpenAI({ apiKey: openaiApiKey });

// JWT Secret (lo stesso usato per generare il token)
const jwtSecret = process.env.JWT_SECRET!;

// ---

export async function POST(request: Request) {
    console.log('API Moderate Request Received.'); // Aggiunto: log all'inizio della richiesta
    console.log('Request Headers:', request.headers); // Aggiunto: log degli header della richiesta

    // 1. Verifica la presenza del token JWT nell'header Authorization
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'unauthorized', message: 'Missing or invalid Authorization header.' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const token = authHeader.split(' ')[1]; // Estrae il token dalla stringa "Bearer <token>"

    // 2. Verifica e decodifica il token JWT
    try {
        const decoded = jwt.verify(token, jwtSecret) as { client_id: string; scope: string };
        // Puoi usare decoded.client_id per identificare chi ha fatto la richiesta
        // E decoded.scope per verificare se ha i permessi necessari (es. 'moderate_content')

        if (!decoded.client_id || decoded.scope !== 'moderate_content') {
            return new Response(JSON.stringify({ error: 'forbidden', message: 'Token is valid but lacks necessary scope.' }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' },
            });
        }

    } catch (jwtError: any) {
        console.error('JWT verification failed:', jwtError);
        return new Response(JSON.stringify({ error: 'unauthorized', message: 'Invalid or expired token.' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 3. Ricevi il testo da moderare dal corpo della richiesta
    let requestBody;
    try {
        requestBody = await request.json();
        console.log('Parsed Request Body:', requestBody); // Aggiunto: log del corpo della richiesta parsato
    } catch (jsonError) {
        console.error('Failed to parse JSON body:', jsonError); // Aggiunto: log in caso di fallimento del parsing JSON
        return new Response(JSON.stringify({ error: 'invalid_json', message: 'Request body must be valid JSON.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const { text } = requestBody;
    console.log('Extracted text field:', text); // Aggiunto: log del campo 'text' estratto

    if (!text || typeof text !== 'string') {
        console.error('Missing or invalid "text" field:', text); // Aggiunto: log in caso di campo 'text' mancante o non valido
        return new Response(JSON.stringify({ error: 'invalid_input', message: 'Missing or invalid "text" field in request body.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 4. Invia il testo all'API di moderazione di OpenAI
    try {
        if (!openaiApiKey) {
            console.error('OPENAI_API_KEY environment variable not configured.');
            return new Response(JSON.stringify({ error: 'server_error', message: 'OpenAI API key not configured.' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const moderationResponse = await openai.moderations.create({
            input: text,
        });

        const moderationResult = moderationResponse.results[0]; // Prende il primo (e unico) risultato

        // 5. Opzionale: Salva i risultati di moderazione su Supabase (per auditing)
        // Se vuoi salvare, aggiungi qui il codice per inserire i dati nella tua tabella Supabase
        // Ad esempio:
        // const { data, error: dbError } = await supabase.from('moderation_logs').insert([
        //     { client_id: decoded.client_id, text_input: text, moderation_result: moderationResult },
        // ]);
        // if (dbError) {
        //     console.error('Error saving moderation log to Supabase:', dbError);
        // }

        // 6. Restituisci il risultato della moderazione
        return new Response(JSON.stringify({
            moderation_status: moderationResult.flagged ? 'flagged' : 'not_flagged',
            categories: moderationResult.categories,
            category_scores: moderationResult.category_scores,
            full_result: moderationResult, // Puoi decidere di restituire meno dettagli se preferisci
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (openaiError: any) {
        console.error('Error calling OpenAI Moderation API:', openaiError);
        return new Response(JSON.stringify({ error: 'openai_error', message: openaiError.message || 'Failed to moderate text with OpenAI.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}