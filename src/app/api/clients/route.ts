// src/app/api/clients/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs'; // Assicurati di aver installato 'bcryptjs' (npm install bcryptjs)
import crypto from 'crypto'; // Modulo Node.js per la generazione di stringhe casuali

// --- Configurazione Variabili d'Ambiente ---
// URL pubblico di Supabase, usato per inizializzare il client.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Chiave del ruolo di servizio di Supabase, usata per operazioni lato server con privilegi elevati.
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Chiave API Master per proteggere questo endpoint di gestione client.
const masterApiKey = process.env.MASTER_API_KEY;

// Inizializza il client Supabase.
// Viene creato solo se le variabili d'ambiente necessarie sono presenti.
let supabase: ReturnType<typeof createClient> | undefined;
if (supabaseUrl && supabaseServiceRoleKey) {
    supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
} else {
    // Registra un errore se le variabili d'ambiente di Supabase non sono configurate.
    console.error('Variabili d\'ambiente Supabase non completamente configurate per la gestione client API.');
}

// Verifica se la chiave API master è configurata all\'avvio del server.
// Questo è un controllo critico per la sicurezza dell'endpoint.
if (!masterApiKey) {
    console.error('La variabile d\'ambiente MASTER_API_KEY è mancante. L\'endpoint di gestione client non sarà protetto.');
}

// --- Funzione Helper per Generare un Secret Casuale ---
// Genera una stringa casuale esadecimale di una lunghezza specificata.
// Utilizza `crypto.randomBytes` per una generazione crittograficamente sicura.
function generateRandomSecret(length: number = 48): string {
    // Genera un numero di byte pari alla metà della lunghezza desiderata (per esadecimale).
    // Converte i byte in una stringa esadecimale e la taglia alla lunghezza esatta.
    return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

// --- Handler Principale per le Richieste POST all'endpoint /api/clients ---
// Questa funzione gestisce la creazione di nuovi client API nel database.
export async function POST(request: NextRequest) {
    console.log('--- Richiesta di Creazione Client API Ricevuta ---');

    // 1. Autenticazione con Chiave API Master
    // Questo endpoint è protetto. Richiede un header 'Authorization: Bearer <MASTER_API_KEY>'.
    const authHeader = request.headers.get('Authorization');
    // Controlla se l'header è presente, inizia con 'Bearer ' e se la chiave corrisponde.
    if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== masterApiKey) {
        console.warn('Tentativo di accesso non autorizzato all\'endpoint di gestione client.');
        return NextResponse.json({ error: 'unauthorized', message: 'Accesso non autorizzato. Chiave API Master mancante o non valida.' }, {
            status: 401, // Unauthorized
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 2. Parsifica il corpo della richiesta
    // Il server si aspetta un corpo della richiesta in formato JSON.
    let requestBody;
    try {
        requestBody = await request.json();
    } catch (jsonError: any) {
        // Gestisce gli errori se il corpo della richiesta non è JSON valido.
        console.error(`Errore durante il parsing del corpo della richiesta: ${jsonError.message}`);
        return NextResponse.json({ error: 'invalid_json', message: 'Il corpo della richiesta deve essere JSON valido.' }, {
            status: 400, // Bad Request
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // Estrae client_id e scope dal corpo della richiesta.
    // 'scope' ha un valore predefinito 'default' se non fornito.
    const { client_id, scope = 'default' } = requestBody;

    // 3. Validazione dell'input
    // Verifica che 'client_id' sia presente e sia una stringa.
    if (!client_id || typeof client_id !== 'string') {
        console.warn('Input non valido: client_id mancante o non è una stringa.');
        return NextResponse.json({ error: 'invalid_request', message: 'Il campo client_id è richiesto e deve essere una stringa.' }, {
            status: 400, // Bad Request
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 4. Verifica connessione Supabase
    // Assicura che il client Supabase sia stato inizializzato correttamente.
    if (!supabase) {
        console.error('Errore del server: Client Supabase non inizializzato.');
        return NextResponse.json({ error: 'server_error', message: 'Connessione al database non disponibile.' }, {
            status: 500, // Internal Server Error
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        // 5. Genera un nuovo client_secret (in chiaro) e il suo hash Bcrypt
        const newClientSecret = generateRandomSecret(48); // Genera un secret di 48 caratteri esadecimali
        const saltRounds = 10; // Il costo per l'hashing Bcrypt (deve corrispondere a quello usato per la verifica del token)
        const clientSecretHash = await bcrypt.hash(newClientSecret, saltRounds);

        // 6. Inserisci il nuovo client nel database Supabase
        const { data, error: dbError } = await supabase
            .from('api_clients') // Nome della tua tabella per i client API
            .insert({
                client_id: client_id,
                client_secret_hash: clientSecretHash,
                scope: scope,
            })
            .select(); // Richiede i dati del record appena inserito

        if (dbError) {
            console.error(`Errore database durante l'inserimento del client ${client_id}:`, dbError);
            // Gestisce il caso in cui il client_id esista già (violazione di chiave unica).
            if (dbError.code === '23505') { // Codice SQLSTATE per violazione di chiave unica
                return NextResponse.json({ error: 'duplicate_client', message: 'Il client_id specificato esiste già.' }, {
                    status: 409, // Conflict
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            // Gestisce altri errori generici del database.
            return NextResponse.json({ error: 'database_error', message: 'Errore durante la registrazione del client API.' }, {
                status: 500, // Internal Server Error
                headers: { 'Content-Type': 'application/json' },
            });
        }

        console.log(`Client API '${client_id}' registrato con successo.`);

        // 7. Restituisci il client_id e il client_secret (in chiaro) al chiamante
        // È fondamentale capire che questo è l'UNICO momento in cui il client_secret in chiaro viene esposto.
        // Il chiamante deve salvare questo secret in modo sicuro.
        return NextResponse.json({
            success: true,
            message: 'Client API creato con successo.',
            client_id: client_id,
            client_secret: newClientSecret, // Il secret in chiaro, da salvare con cautela!
            scope: scope,
        }, {
            status: 201, // Created (standard per la creazione di risorse)
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        // Gestisce errori imprevisti durante il processo di creazione del client.
        console.error('Errore interno del server durante la creazione del client API:', error);
        return NextResponse.json({ error: 'server_error', message: 'Si è verificato un errore interno del server.' }, {
            status: 500, // Internal Server Error
            headers: { 'Content-Type': 'application/json' },
        });
    }
}