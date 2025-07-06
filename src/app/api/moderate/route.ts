// src/app/api/moderate/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { OpenAI } from 'openai'; // Assicurati di aver installato 'openai' (npm install openai)

// --- Environment Variable Configuration ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const jwtSecret = process.env.JWT_SECRET;
const openaiApiKey = process.env.OPENAI_API_KEY; // La tua chiave API di OpenAI

// Initialize Supabase client
let supabase: ReturnType<typeof createClient> | undefined;
if (supabaseUrl && supabaseServiceRoleKey) {
    supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
} else {
    console.error('Supabase environment variables not fully configured for Moderation API. Cannot connect to DB.');
}

// Initialize OpenAI client
let openai: OpenAI | undefined;
if (openaiApiKey) {
    openai = new OpenAI({ apiKey: openaiApiKey });
} else {
    console.error('OPENAI_API_KEY environment variable is missing. OpenAI moderation will not work.');
}

// Check if JWT_SECRET is configured
if (!jwtSecret) {
    console.error('JWT_SECRET environment variable is missing. JWT verification will fail.');
}

// --- Helper Function to Determine Action and Severity ---
// Questa funzione analizza la risposta di moderazione di OpenAI per determinare
// l'azione raccomandata e la severità.
function determineActionAndSeverity(moderationResult: any): { action: string; severity: string } {
    if (moderationResult.flagged) {
        // Se è flagged, controlla i punteggi per determinare la severità
        const scores = moderationResult.scores;
        let severity = 'low'; // Default

        // Esempi di logica per la severità (puoi personalizzarla)
        // Questi sono valori arbitrari, adattali alle tue esigenze
        const highSeverityThreshold = 0.8;
        const mediumSeverityThreshold = 0.5;

        if (scores.sexual > highSeverityThreshold || scores.hate > highSeverityThreshold || scores.violence > highSeverityThreshold || scores['self-harm'] > highSeverityThreshold) {
            severity = 'high';
        } else if (scores.sexual > mediumSeverityThreshold || scores.hate > mediumSeverityThreshold || scores.violence > mediumSeverityThreshold || scores['self-harm'] > mediumSeverityThreshold) {
            severity = 'medium';
        }

        return { action: 'flagged', severity: severity };
    } else {
        return { action: 'approved', severity: 'low' };
    }
}

// --- Main POST Request Handler for /api/moderate ---
export async function POST(request: NextRequest) {
    console.log('--- Richiesta Moderazione API Ricevuta ---');

    // 1. Authenticate JWT (using the token provided by /api/token)
    const authHeader = request.headers.get('Authorization');
    let clientId: string | null = null;
    let clientScope: string | null = null;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn('Tentativo di accesso non autorizzato: Header Authorization mancante o non valido.');
        return NextResponse.json({ error: 'unauthorized', message: 'Header Authorization mancante o non valido.' }, {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const token = authHeader.split(' ')[1];

    if (!jwtSecret) {
        console.error('Errore Server: JWT_SECRET non configurato. Impossibile verificare il token. Stato: 500');
        return NextResponse.json({ error: 'server_error', message: 'Errore di configurazione del server.' }, {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        const decoded = jwt.verify(token, jwtSecret) as { client_id: string; scope: string; [key: string]: any };
        clientId = decoded.client_id;
        clientScope = decoded.scope;
        console.log(`Token verificato. Client ID: ${clientId}, Scope: ${clientScope}`);
    } catch (jwtError: any) {
        console.warn(`Verifica JWT fallita: ${jwtError.message}. Stato: 401`);
        return NextResponse.json({ error: 'unauthorized', message: 'Token non valido o scaduto.' }, {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 2. Parse the request body
    let requestBody;
    try {
        requestBody = await request.json();
    } catch (jsonError: any) {
        console.error(`Errore durante il parsing del corpo della richiesta per /api/moderate: ${jsonError.message}. Stato: 400`);
        return NextResponse.json({ error: 'invalid_json', message: 'Il corpo della richiesta deve essere JSON valido.' }, {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const { content, userId } = requestBody; // 'userId' è opzionale

    // 3. Input Validation
    if (!content || typeof content !== 'string') {
        console.warn('Input non valido: Il campo \'content\' è richiesto e deve essere una stringa. Stato: 400');
        return NextResponse.json({ error: 'invalid_request', message: 'Il campo \'content\' è richiesto e deve essere una stringa.' }, {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 4. Verify OpenAI client is initialized
    if (!openai) {
        console.error('Errore Server: Client OpenAI non inizializzato. Stato: 500');
        return NextResponse.json({ error: 'server_error', message: 'Servizio di moderazione non disponibile.' }, {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    let moderationResult: any = null;
    let moderationAction = 'unknown';
    let moderationSeverity = 'unknown';
    let moderationCategories: string[] = [];
    let moderationScores: { [key: string]: number } = {};

    try {
        // 5. Call OpenAI Moderation API
        const response = await openai.moderations.create({
            input: content,
        });

        moderationResult = response.results[0]; // Prendi il primo (e unico) risultato
        console.log('Risultato moderazione OpenAI:', moderationResult);

        // Determina azione e severità in base al risultato di OpenAI
        const { action, severity } = determineActionAndSeverity(moderationResult);
        moderationAction = action;
        moderationSeverity = severity;

        // Estrai le categorie segnalate
        for (const category in moderationResult.categories) {
            if (moderationResult.categories[category]) {
                moderationCategories.push(category);
            }
        }

        // Estrai i punteggi
        moderationScores = moderationResult.scores;

    } catch (openaiError: any) {
        console.error(`Errore durante la chiamata all'API di moderazione OpenAI: ${openaiError.message}. Stato: 500`);
        return NextResponse.json({ error: 'openai_error', message: 'Errore durante la moderazione del contenuto.' }, {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // --- LOGGING DELL'OPERAZIONE DI MODERAZIONE SU SUPABASE ---
    if (supabase) {
        try {
            const { error: logError } = await supabase
                .from('moderation_logs')
                .insert({
                    client_id: clientId, // L'ID del client autenticato
                    user_id: userId || null, // L'ID dell'utente finale, se fornito
                    content: content,
                    flagged: moderationResult.flagged,
                    action: moderationAction,
                    severity: moderationSeverity,
                    categories: moderationCategories,
                    scores: moderationScores,
                    openai_response_raw: moderationResult, // Salva la risposta raw di OpenAI
                });

            if (logError) {
                console.error('Errore durante il logging della moderazione su Supabase:', logError);
                // Non blocchiamo la risposta di successo all'utente finale per un errore di logging,
                // ma lo registriamo.
            } else {
                console.log('Log di moderazione salvato con successo su Supabase.');
            }
        } catch (logCatchError: any) {
            console.error('Errore imprevisto durante il logging su Supabase:', logCatchError);
        }
    } else {
        console.warn('Supabase client non disponibile. Impossibile salvare il log di moderazione.');
    }
    // --- FINE LOGGING ---

    // 6. Return the moderation result
    return NextResponse.json({
        success: true,
        flagged: moderationResult.flagged,
        action: moderationAction,
        severity: moderationSeverity,
        categories: moderationCategories,
        scores: moderationScores,
        message: moderationResult.flagged ? 'Content flagged' : 'Content approved',
    }, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}
