// src/app/api/clients/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// --- Configurazione Variabili d'Ambiente ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const masterApiKey = process.env.MASTER_API_KEY;

// Inizializza il client Supabase
let supabase: ReturnType<typeof createClient> | undefined;
if (supabaseUrl && supabaseServiceRoleKey) {
    supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
} else {
    console.error('Variabili d\'ambiente Supabase non completamente configurate per la gestione client API.');
}

// Verifica se la chiave API master è configurata all\'avvio
if (!masterApiKey) {
    console.error('La variabile d\'ambiente MASTER_API_KEY è mancante. L\'endpoint di gestione client non sarà protetto.');
}

// --- Funzione Helper per Generare un Secret Casuale ---
function generateRandomSecret(length: number = 48): string {
    return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

// --- Handler per le richieste GET (Recupero di tutti i client API) ---
export async function GET(request: NextRequest) {
    console.log('--- Richiesta di Recupero Tutti i Client API Ricevuta ---');

    // 1. Autenticazione con Chiave API Master
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== masterApiKey) {
        console.warn('Tentativo di accesso non autorizzato all\'endpoint di recupero client.');
        return NextResponse.json({ error: 'unauthorized', message: 'Accesso non autorizzato. Chiave API Master mancante o non valida.' }, {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 2. Verifica connessione Supabase
    if (!supabase) {
        console.error('Errore del server: Client Supabase non inizializzato.');
        return NextResponse.json({ error: 'server_error', message: 'Connessione al database non disponibile.' }, {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        // 3. Recupera tutti i client dal database
        // SELEZIONA SOLO I CAMPI NECESSARI ED ESCLUDI IL client_secret_hash PER SICUREZZA!
        const { data, error: dbError } = await supabase
            .from('api_clients')
            .select('client_id, scope, created_at'); // Assicurati che 'created_at' esista o rimuovilo se non lo usi.

        if (dbError) {
            console.error('Errore database durante il recupero dei client API:', dbError);
            return NextResponse.json({ error: 'database_error', message: 'Errore durante il recupero dei client API.' }, {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        console.log(`Recuperati ${data?.length || 0} client API.`);

        // 4. Restituisci la lista dei client
        return NextResponse.json({
            success: true,
            message: 'Client API recuperati con successo.',
            clients: data || [], // Restituisce un array vuoto se non ci sono dati
        }, {
            status: 200, // OK
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error('Errore interno del server durante il recupero dei client API:', error);
        return NextResponse.json({ error: 'server_error', message: 'Si è verificato un errore interno del server.' }, {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}

// --- Handler per le richieste POST (Creazione di un nuovo client API) ---
export async function POST(request: NextRequest) {
    console.log('--- Richiesta di Creazione Client API Ricevuta ---');

    // 1. Autenticazione con Chiave API Master
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== masterApiKey) {
        console.warn('Tentativo di accesso non autorizzato all\'endpoint di gestione client.');
        return NextResponse.json({ error: 'unauthorized', message: 'Accesso non autorizzato. Chiave API Master mancante o non valida.' }, {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 2. Parsifica il corpo della richiesta
    let requestBody;
    try {
        requestBody = await request.json();
    } catch (jsonError: any) {
        console.error(`Errore durante il parsing del corpo della richiesta: ${jsonError.message}`);
        return NextResponse.json({ error: 'invalid_json', message: 'Il corpo della richiesta deve essere JSON valido.' }, {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const { client_id, scope = 'default' } = requestBody;

    // 3. Validazione dell'input
    if (!client_id || typeof client_id !== 'string') {
        console.warn('Input non valido: client_id mancante o non è una stringa.');
        return NextResponse.json({ error: 'invalid_request', message: 'Il campo client_id è richiesto e deve essere una stringa.' }, {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 4. Verifica connessione Supabase
    if (!supabase) {
        console.error('Errore del server: Client Supabase non inizializzato.');
        return NextResponse.json({ error: 'server_error', message: 'Connessione al database non disponibile.' }, {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        // 5. Genera un nuovo client_secret e il suo hash
        const newClientSecret = generateRandomSecret(48);
        const saltRounds = 10;
        const clientSecretHash = await bcrypt.hash(newClientSecret, saltRounds); // Riga corretta: da saltRands a saltRounds

        // 6. Inserisci il nuovo client nel database
        const { data, error: dbError } = await supabase
            .from('api_clients')
            .insert({
                client_id: client_id,
                client_secret_hash: clientSecretHash,
                scope: scope,
            })
            .select();

        if (dbError) {
            console.error(`Errore database durante l'inserimento del client ${client_id}:`, dbError);
            if (dbError.code === '23505') {
                return NextResponse.json({ error: 'duplicate_client', message: 'Il client_id specificato esiste già.' }, {
                    status: 409,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            return NextResponse.json({ error: 'database_error', message: 'Errore durante la registrazione del client API.' }, {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        console.log(`Client API '${client_id}' registrato con successo.`);

        // 7. Restituisci il client_id e il client_secret (in chiaro) al chiamante
        return NextResponse.json({
            success: true,
            message: 'Client API creato con successo.',
            client_id: client_id,
            client_secret: newClientSecret,
            scope: scope,
        }, {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error('Errore interno del server durante la creazione del client API:', error);
        return NextResponse.json({ error: 'server_error', message: 'Si è verificato un errore interno del server.' }, {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}