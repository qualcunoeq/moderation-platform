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
    console.log('API Moderate Request Received.');
    console.log('Request Headers:', request.headers);
    console.log('Content-Type Header:', request.headers.get('Content-Type')); // Aggiunto: Log del Content-Type

    // 1. Verifica la presenza del token JWT nell'header Authorization
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.error('Missing or invalid Authorization header.'); // Log per 401
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
            console.error('Token is valid but lacks necessary scope:', decoded); // Log per 403
            return new Response(JSON.stringify({ error: 'forbidden', message: 'Token is valid but lacks necessary scope.' }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        console.log('JWT successfully verified for client_id:', decoded.client_id); // Log di successo JWT

    } catch (jwtError: any) {
        console.error('JWT verification failed:', jwtError);
        return new Response(JSON.stringify({ error: 'unauthorized', message: 'Invalid or expired token.' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 3. Ricevi il testo da moderare dal corpo della richiesta
    let requestBody: any;
    let text: string | undefined; // Dichiarazione della variabile text

    try {
        // Tenta prima il parsing JSON standard
        requestBody = await request.json();
        console.log('Parsed Request Body (via request.json()):', requestBody);
        text = requestBody?.text; // Accedi alla proprietà 'text'

    } catch (jsonError) {
        // Se fallisce, prova a leggere come testo e parsare manualmente
        console.warn('Could not parse JSON directly. Attempting to read as text and parse:', jsonError);
        try {
            const rawBody = await request.text();
            console.log('Raw Request Body:', rawBody); // Log del corpo RAW
            requestBody = JSON.parse(rawBody); // Parsing manuale
            console.log('Parsed Request Body (via JSON.parse(raw)):', requestBody);
            text = requestBody?.text;
        } catch (fallbackError) {
            console.error('Failed to parse body even with fallback:', fallbackError); // Log errore fallback
            return new Response(JSON.stringify({ error: 'invalid_json', message: 'Request body must be valid JSON.' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }
    }

    if (!text || typeof text !== 'string') {
        console.error('Missing or invalid "text" field:', text); // Log per campo 'text' mancante/non valido
        return new Response(JSON.stringify({ error: 'invalid_input', message: 'Missing or invalid "text" field in request body.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    console.log('Successfully extracted text for moderation:', text); // Log di successo dell'estrazione del testo

    // 4. Invia il testo all'API di moderazione di OpenAI
    try {
        if (!openaiApiKey) {
            console.error('OPENAI_API_KEY environment variable not configured.');
            return new Response(JSON.stringify({ error: 'server_error', message: 'OpenAI API key not configured.' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        console.log('Calling OpenAI Moderation API...'); // Log prima della chiamata OpenAI
        const moderationResponse = await openai.moderations.create({
            input: text,
        });
        console.log('OpenAI Moderation API response received.'); // Log dopo la risposta OpenAI

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
        console.error('Error calling OpenAI Moderation API:', openaiError); // Log per errori OpenAI
        return new Response(JSON.stringify({ error: 'openai_error', message: openaiError.message || 'Failed to moderate text with OpenAI.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}