// src/app/api/token/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs'; // Assicurati di aver installato 'bcryptjs' (npm install bcryptjs)

// --- Define an interface for the expected data structure from the api_clients table ---
// Questo aiuta TypeScript a capire la forma dei dati restituiti da Supabase.
interface ApiClientData {
    client_secret_hash: string;
    scope: string;
    // Aggiungi altri campi se li selezioni, es. id?: string; client_id?: string;
}

// --- Environment Variable Configuration ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const jwtSecret = process.env.JWT_SECRET;

// Initialize Supabase client (using the service_role key for server-side operations)
let supabase: ReturnType<typeof createClient> | undefined;
if (supabaseUrl && supabaseServiceRoleKey) {
    supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
} else {
    console.error('Le variabili d\'ambiente Supabase (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) non sono completamente configurate per l\'API Token. Impossibile connettersi al DB.');
    // In un'applicazione di produzione, potresti voler lanciare un errore o uscire qui se il DB è essenziale.
}

// Check if JWT_SECRET is configured at startup
if (!jwtSecret) {
    console.error('La variabile d\'ambiente JWT_SECRET è mancante. La generazione del JWT fallirà.');
    // Questo è un errore critico: senza un secret, i token non possono essere firmati in modo sicuro.
}

// --- Main POST Request Handler for /api/token ---
export async function POST(request: NextRequest) {
    console.log('--- Richiesta Token API Ricevuta ---');
    console.log('Metodo Richiesta:', request.method);
    console.log('Header Content-Type:', request.headers.get('Content-Type'));

    // --- BLOCCO DI DEBUG TEMPORANEO PER TESTARE BCRYPT.COMPARE() ---
    // Rimuovi questo blocco prima del deploy in produzione!
    const TEST_SECRET_IN_CHIARO = "passwordDiProva123"; // Un secret di test che conosci
    // Genera l'hash di TEST_SECRET_IN_CHIARO usando il tuo generate_secret.js
    // Esempio: node generate_secret.js (e usa "passwordDiProva123" come input)
    const TEST_HASH_DAL_DB = "$2a$10$K/ljo8vApxQrp88kVSuyWe2wPyK5dYCxJJ.pf5.8ZkhbVjwvxwCbC"; // <--- INSERISCI QUI L'HASH GENERATO!

    try {
        console.log('--- DEBUG BCRYPT.COMPARE() TEST ---');
        const isTestSecretValid = await bcrypt.compare(TEST_SECRET_IN_CHIARO, TEST_HASH_DAL_DB);
        console.log(`Test bcrypt.compare('${TEST_SECRET_IN_CHIARO}', '${TEST_HASH_DAL_DB}') result: ${isTestSecretValid}`);
        if (!isTestSecretValid) {
            console.error('!!! ERRORE CRITICO DI DEBUG: bcrypt.compare() FALLITO PER UN SECRET NOTO E CORRETTO !!!');
        } else {
            console.log('--- DEBUG BCRYPT.COMPARE() TEST SUPERATO CON SUCCESSO ---');
        }
    } catch (bcryptError: any) {
        console.error('--- ECCEZIONE DEBUG BCRYPT.COMPARE() ---', bcryptError.message);
    }
    // --- FINE BLOCCO DI DEBUG TEMPORANEO ---

    // 1. Validate JWT_SECRET configuration
    if (!jwtSecret) {
        console.error('Errore Server: JWT_SECRET non configurato. Impossibile generare il token. Stato: 500');
        return NextResponse.json({ error: 'server_error', message: 'Errore di configurazione del server.' }, {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 2. Parse the request body for credentials
    let requestBody;
    try {
        requestBody = await request.json();
    } catch (jsonError: any) {
        console.error(`Errore durante il parsing del corpo della richiesta per /api/token: ${jsonError.message}. Stato: 400`);
        return NextResponse.json({ error: 'invalid_json', message: 'Il corpo della richiesta deve essere JSON valido.' }, {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const { client_id, client_secret, grant_type } = requestBody;

    // 3. Input Validation
    // Assicurati che client_id, client_secret siano stringhe e grant_type sia 'client_credentials'
    if (!client_id || typeof client_id !== 'string' ||
        !client_secret || typeof client_secret !== 'string' ||
        grant_type !== 'client_credentials') { // Il 'grant_type' è un parametro standard OAuth2
        console.error(`Input non valido per /api/token. Ricevuto: client_id=${client_id}, grant_type=${grant_type}. Stato: 400`);
        return NextResponse.json({ error: 'invalid_request', message: 'client_id, client_secret o grant_type mancanti o non validi.' }, {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 4. Connect to Supabase
    if (!supabase) {
        console.error('Errore Server: Client Supabase non inizializzato. Stato: 500');
        return NextResponse.json({ error: 'server_error', message: 'Connessione al database non disponibile.' }, {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 5. Retrieve client_secret_hash from the database
    try {
        // Tipizza esplicitamente i dati restituiti da Supabase
        const { data, error: dbError } = await supabase
            .from('api_clients') // Nome della tua tabella Supabase per i client API
            .select('client_secret_hash, scope')
            .eq('client_id', client_id)
            .single<ApiClientData>(); // <-- Usa .single<ApiClientData>() qui per la sicurezza del tipo

        if (dbError || !data) {
            console.warn(`Autenticazione fallita per client_id: ${client_id}. Nessun client trovato o errore DB: ${dbError?.message}`);
            return NextResponse.json({ error: 'unauthorized', message: 'Credenziali client non valide.' }, {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Ora TypeScript sa che 'data' è di tipo ApiClientData, quindi 'data.client_secret_hash' è una stringa
        const isPasswordValid = await bcrypt.compare(client_secret, data.client_secret_hash);

        if (!isPasswordValid) {
            console.warn(`Autenticazione fallita per client_id: ${client_id}. Secret non corretto.`);
            return NextResponse.json({ error: 'unauthorized', message: 'Credenziali client non valide.' }, {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // 7. Generate the JWT
        const accessToken = jwt.sign(
            { client_id: client_id, scope: data.scope }, // Payload per il token
            jwtSecret, // Chiave segreta per firmare il token
            { expiresIn: '1h' } // Token valido per 1 ora
        );

        console.log(`Token emesso con successo per client_id: ${client_id}`);
        return NextResponse.json({ access_token: accessToken, token_type: 'Bearer', expires_in: 3600 }, {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error(`Errore interno del server durante la generazione del token: ${error.message}`);
        return NextResponse.json({ error: 'server_error', message: 'Si è verificato un errore interno del server.' }, {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}