import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken'; // Assicurati che jsonwebtoken sia importato

// Inizializzazione OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Inizializzazione Supabase per i log (usa Service Role Key per accesso server-side)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Assicurati che sia la Service Role Key
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// Definizioni di tipo (assicurati che queste siano presenti nel tuo file)
interface ModerationResponse {
    flagged: boolean;
    categories: {
        sexual: boolean;
        hate: boolean;
        harassment: boolean;
        "self-harm": boolean;
        "sexual/minors": boolean;
        violence: boolean;
        "hate/threatening": boolean;
        "harassment/threatening": boolean;
        "self-harm/intent": boolean;
        "self-harm/instructions": boolean;
        "violence/graphic": boolean;
    };
    category_scores: {
        sexual: number;
        hate: number;
        harassment: number;
        "self-harm": number;
        "sexual/minors": number;
        violence: number;
        "hate/threatening": number;
        "harassment/threatening": number;
        "self-harm/intent": number;
        "self-harm/instructions": number;
        "violence/graphic": number;
    };
}

// Interfaccia per il log nel database
interface ModerationLog {
    text_content: string;
    flagged: boolean;
    action: 'APPROVED' | 'BLOCKED';
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'NONE'; // Aggiunto 'NONE' per chiarezza
    categories: string[];
    scores: Record<string, number>;
    client_id?: string; // Aggiunto per tracciare il client che ha fatto la richiesta
}

export async function POST(request: Request) {
    // 1. Verifica il Token OAuth 2.0 (Bearer Token)
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'unauthorized', message: 'Bearer token missing or malformed.' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const token = authHeader.split(' ')[1];
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
        console.error('JWT_SECRET environment variable not configured.');
        return new Response(JSON.stringify({ error: 'server_error', message: 'Server configuration error.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    let clientIdFromToken: string | undefined;
    try {
        const decoded = jwt.verify(token, jwtSecret) as { client_id: string; scope: string; exp: number; iat: number; };
        // Puoi aggiungere qui una logica per controllare gli 'scope' se li usi
        if (decoded.scope !== 'moderate_content') { // Esempio di verifica scope
            return new Response(JSON.stringify({ error: 'forbidden', message: 'Insufficient scope.' }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        clientIdFromToken = decoded.client_id; // Ottieni il client_id dal token
    } catch (err) {
        console.error('Token verification error:', err);
        return new Response(JSON.stringify({ error: 'invalid_token', message: 'Invalid or expired token.' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 2. Continua con la logica di moderazione esistente
    try {
        const { content } = await request.json();

        if (!content) {
            return new Response(JSON.stringify({ error: 'Bad Request', message: 'Content field is required.' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const moderationResponse = await openai.moderations.create({
            input: content,
        });

        const result: ModerationResponse = moderationResponse.results[0];

        // Determina l'azione e la severità basate sul flagging di OpenAI
        const flagged = result.flagged;
        let action: 'APPROVED' | 'BLOCKED' = flagged ? 'BLOCKED' : 'APPROVED';

        // Calcola la severità massima tra tutte le categorie segnalate
        let severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'NONE' = 'NONE';
        let maxScore = 0;
        let flaggedCategories: string[] = [];

        if (flagged) {
            Object.keys(result.categories).forEach(key => {
                const categoryKey = key as keyof ModerationResponse['categories'];
                if (result.categories[categoryKey]) { // Se la categoria è flagged (true)
                    flaggedCategories.push(categoryKey);
                    const score = result.category_scores[categoryKey];
                    if (score > maxScore) {
                        maxScore = score;
                    }
                }
            });

            // Determina la severità in base al punteggio più alto (esempio di logica)
            if (maxScore >= 0.9) {
                severity = 'CRITICAL';
            } else if (maxScore >= 0.75) {
                severity = 'HIGH';
            } else if (maxScore >= 0.5) {
                severity = 'MEDIUM';
            } else {
                severity = 'LOW';
            }
        }

        // Determina un messaggio più descrittivo
        let message: string;
        if (flagged) {
            message = `Content flagged for: ${flaggedCategories.join(', ')}. Severity: ${severity}.`;
        } else {
            message = 'Content approved. No issues detected.';
        }

        // Salva il log della moderazione in Supabase
        const logData: ModerationLog = {
            text_content: content,
            flagged,
            action,
            severity,
            categories: flaggedCategories,
            scores: result.category_scores,
            client_id: clientIdFromToken, // Salva il client_id nel log
        };

        const { error: dbError } = await supabase.from('moderation_logs').insert([logData]);
        if (dbError) {
            console.error('Error saving moderation log to Supabase:', dbError);
            // Non bloccare la risposta API per un errore di logging
        }

        return new Response(JSON.stringify({
            flagged,
            action,
            severity,
            message,
            categories: flaggedCategories,
            scores: result.category_scores,
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error('Error during content moderation:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error', message: error.message || 'An unexpected error occurred during moderation.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}