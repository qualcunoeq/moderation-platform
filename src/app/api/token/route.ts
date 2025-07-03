// src/app/api/moderate/route.ts

// Imports necessari
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import jwt from 'jsonwebtoken';

// --- Configurazione Variabili d'Ambiente ---
// È buona pratica controllare la presenza delle variabili d'ambiente all'avvio o prima dell'uso.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Inizializzazione Supabase (solo se le chiavi sono presenti)
let supabase: ReturnType<typeof createClient> | undefined;
if (supabaseUrl && supabaseServiceRoleKey) {
    supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
} else {
    console.warn('Supabase environment variables not fully configured. Supabase logging will be skipped.');
}

const openaiApiKey = process.env.OPENAI_API_KEY;
// Inizializzazione OpenAI (solo se la chiave è presente)
let openai: OpenAI | undefined;
if (openaiApiKey) {
    openai = new OpenAI({ apiKey: openaiApiKey });
} else {
    console.error('OPENAI_API_KEY environment variable is missing. OpenAI API calls will fail.');
}

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
    console.error('JWT_SECRET environment variable is missing. JWT verification will fail.');
}

// --- Funzione Principale della Route POST ---

export async function POST(request: Request) {
    console.log('--- API Moderate Request Received ---');
    console.log('Request Method:', request.method); // Log del metodo HTTP
    console.log('Request Headers:', request.headers);
    console.log('Content-Type Header:', request.headers.get('Content-Type'));

    // --- 1. Verifica il Token JWT nell'header Authorization ---
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.error('Error: Missing or invalid Authorization header. Status: 401');
        return new Response(JSON.stringify({ error: 'unauthorized', message: 'Missing or invalid Authorization header.' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    if (!jwtSecret) {
        console.error('Server Error: JWT_SECRET not configured. Cannot verify token. Status: 500');
        return new Response(JSON.stringify({ error: 'server_error', message: 'Server configuration error.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const token = authHeader.split(' ')[1];
    let client_id: string | undefined;

    // --- 2. Verifica e decodifica il token JWT ---
    try {
        const decoded = jwt.verify(token, jwtSecret) as { client_id?: string; scope?: string }; // client_id reso opzionale per robustezza
        client_id = decoded.client_id; // Assegna il client_id se presente

        if (!decoded.client_id || decoded.scope !== 'moderate_content') {
            console.error(`Error: Token valid but lacks necessary scope or client_id. Decoded: ${JSON.stringify(decoded)}. Status: 403`);
            return new Response(JSON.stringify({ error: 'forbidden', message: 'Token is valid but lacks necessary scope.' }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        console.log(`JWT successfully verified for client_id: ${decoded.client_id}.`);

    } catch (jwtError: any) {
        console.error(`JWT verification failed: ${jwtError.message}. Status: 401`);
        return new Response(JSON.stringify({ error: 'unauthorized', message: 'Invalid or expired token.' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // --- 3. Ricevi il testo da moderare dal corpo della richiesta ---
    let requestBody: any;
    let text: string | undefined;

    try {
        requestBody = await request.json();
        console.log('Parsed Request Body (via request.json()):', requestBody);
        text = requestBody?.text;

    } catch (jsonError: any) {
        console.warn(`Warning: Could not parse JSON directly. Attempting to read as text and parse. Error: ${jsonError.message}`);
        try {
            const rawBody = await request.text();
            console.log('Raw Request Body (for fallback parsing):', rawBody);
            requestBody = JSON.parse(rawBody);
            console.log('Parsed Request Body (via JSON.parse(raw)):', requestBody);
            text = requestBody?.text;
        } catch (fallbackError: any) {
            console.error(`Error: Failed to parse body even with fallback. Error: ${fallbackError.message}. Status: 400`);
            return new Response(JSON.stringify({ error: 'invalid_json', message: 'Request body must be valid JSON.' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }
    }

    if (!text || typeof text !== 'string' || text.trim().length === 0) { // Aggiunto controllo per testo vuoto
        console.error(`Error: Missing, invalid, or empty "text" field. Received: ${JSON.stringify(text)}. Status: 400`);
        return new Response(JSON.stringify({ error: 'invalid_input', message: 'Missing, invalid, or empty "text" field in request body.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    console.log(`Successfully extracted text for moderation (length: ${text.length}): "${text.substring(0, 50)}..."`); // Logga i primi 50 caratteri

    // --- 4. Invia il testo all'API di moderazione di OpenAI ---
    try {
        if (!openai) { // Controlla se l'istanza di OpenAI è stata creata
            console.error('Server Error: OpenAI API client not initialized due to missing API key. Status: 500');
            return new Response(JSON.stringify({ error: 'server_error', message: 'OpenAI API key not configured on server.' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        console.log('Calling OpenAI Moderation API...');
        const moderationResponse = await openai.moderations.create({
            input: text,
        });
        console.log('OpenAI Moderation API response received.');

        const moderationResult = moderationResponse.results[0];

        // --- 5. Opzionale: Salva i risultati di moderazione su Supabase (per auditing) ---
        if (supabase && client_id) { // Esegue il log solo se Supabase è configurato e client_id è disponibile
            const { data, error: dbError } = await supabase.from('moderation_logs').insert([
                {
                    client_id: client_id, // Usa il client_id estratto
                    text_input: text,
                    moderation_result: moderationResult,
                    flagged: moderationResult.flagged // Aggiungi un campo "flagged" per query più semplici
                },
            ]);
            if (dbError) {
                console.error('Error saving moderation log to Supabase:', dbError);
            } else {
                console.log('Moderation log saved to Supabase:', data);
            }
        } else if (!supabase) {
            console.warn('Supabase not initialized, skipping moderation log.');
        } else if (!client_id) {
            console.warn('Client ID not available, skipping moderation log to Supabase.');
        }


        // --- 6. Restituisci il risultato della moderazione ---
        console.log(`Moderation complete. Flagged: ${moderationResult.flagged}. Status: 200`);
        return new Response(JSON.stringify({
            moderation_status: moderationResult.flagged ? 'flagged' : 'not_flagged',
            categories: moderationResult.categories,
            category_scores: moderationResult.category_scores,
            // full_result: moderationResult, // Puoi decidere di restituire o meno l'intero oggetto per ragioni di dimensione/privacy
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (openaiError: any) {
        console.error(`Error calling OpenAI Moderation API: ${openaiError.message}. Status: 500`);
        // Logga l'errore completo se vuoi più dettagli (utile in sviluppo)
        // console.error('Full OpenAI error object:', openaiError);
        return new Response(JSON.stringify({ error: 'openai_error', message: openaiError.message || 'Failed to moderate text with OpenAI.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}