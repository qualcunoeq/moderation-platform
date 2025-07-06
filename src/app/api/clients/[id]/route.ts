// src/app/api/clients/details/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs'; // Mantenuto per completezza, anche se non usato direttamente in DELETE

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

// Verifica se la chiave API master è configurata
if (!masterApiKey) {
    console.error('La variabile d\'ambiente MASTER_API_KEY è mancante. L\'endpoint di gestione client non sarà protetto.');
}

// --- Handler per le richieste GET (Recupero di un singolo client API) ---
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
    console.log(`[DEBUG] GET handler invoked for /api/clients/details/[id] with ID: ${params.id}`);
    console.log(`--- Richiesta di Recupero Singolo Client API Ricevuta per ID: ${params.id} ---`);

    // 1. Autenticazione con Chiave API Master
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== masterApiKey) {
        console.warn('Tentativo di accesso non autorizzato all\'endpoint di recupero singolo client.');
        return NextResponse.json({ error: 'unauthorized', message: 'Accesso non autorizzato. Chiave API Master mancante o non valida.' }, {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 2. Estrai l'ID del client dai parametri dell'URL
    const clientIdToRetrieve = params.id;
    if (!clientIdToRetrieve) {
        console.warn('ID del client mancante nei parametri dell\'URL per il recupero singolo.');
        return NextResponse.json({ error: 'invalid_request', message: 'L\'ID del client è richiesto nell\'URL.' }, {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 3. Verifica connessione Supabase
    if (!supabase) {
        console.error('Errore del server: Client Supabase non inizializzato.');
        return NextResponse.json({ error: 'server_error', message: 'Connessione al database non disponibile.' }, {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        // 4. Recupera il client specifico dal database
        const { data, error: dbError } = await supabase
            .from('api_clients')
            .select('client_id, scope, created_at')
            .eq('client_id', clientIdToRetrieve)
            .single();

        if (dbError || !data) {
            console.warn(`Client non trovato per il recupero: ${clientIdToRetrieve}. Errore DB: ${dbError?.message}`);
            return NextResponse.json({ error: 'not_found', message: 'Client API non trovato.' }, {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        console.log(`Client API '${clientIdToRetrieve}' recuperato con successo.`);

        // 5. Restituisci i dettagli del client
        return NextResponse.json({
            success: true,
            message: 'Client API recuperato con successo.',
            client: data,
        }, {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error('Errore interno del server durante il recupero del singolo client API:', error);
        return NextResponse.json({ error: 'server_error', message: 'Si è verificato un errore interno del server.' }, {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}


// --- Handler per le richieste PUT (Aggiornamento di un client API esistente) ---
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
    console.log(`--- Richiesta di Aggiornamento Client API Ricevuta per ID: ${params.id} ---`);

    // 1. Autenticazione con Chiave API Master
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== masterApiKey) {
        console.warn('Tentativo di accesso non autorizzato all\'endpoint di aggiornamento client.');
        return NextResponse.json({ error: 'unauthorized', message: 'Accesso non autorizzato. Chiave API Master mancante o non valida.' }, {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 2. Estrai l'ID del client dai parametri dell'URL
    const clientIdToUpdate = params.id;
    if (!clientIdToUpdate) {
        console.warn('ID del client mancante nei parametri dell\'URL per l\'aggiornamento.');
        return NextResponse.json({ error: 'invalid_request', message: 'L\'ID del client è richiesto nell\'URL.' }, {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 3. Parsifica il corpo della richiesta per i campi da aggiornare
    let requestBody;
    try {
        requestBody = await request.json();
    } catch (jsonError: any) {
        console.error(`Errore durante il parsing del corpo della richiesta per l'aggiornamento client: ${jsonError.message}`);
        return NextResponse.json({ error: 'invalid_json', message: 'Il corpo della richiesta deve essere JSON valido.' }, {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const { scope } = requestBody;

    // 4. Validazione dell'input per i campi da aggiornare
    if (!scope || typeof scope !== 'string') {
        console.warn('Input non valido: Il campo \'scope\' è richiesto e deve essere una stringa per l\'aggiornamento.');
        return NextResponse.json({ error: 'invalid_request', message: 'Il campo \'scope\' è richiesto e deve essere una stringa per l\'aggiornamento.' }, {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 5. Verifica connessione Supabase
    if (!supabase) {
        console.error('Errore del server: Client Supabase non inizializzato.');
        return NextResponse.json({ error: 'server_error', message: 'Connessione al database non disponibile.' }, {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        // 6. Aggiorna il client nel database
        const { data, error: dbError } = await supabase
            .from('api_clients')
            .update({ scope: scope })
            .eq('client_id', clientIdToUpdate)
            .select();

        if (dbError) {
            console.error(`Errore database durante l'aggiornamento del client ${clientIdToUpdate}:`, dbError);
            return NextResponse.json({ error: 'database_error', message: 'Errore durante l\'aggiornamento del client API.' }, {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (!data || data.length === 0) {
            console.warn(`Client non trovato per l'aggiornamento: ${clientIdToUpdate}.`);
            return NextResponse.json({ error: 'not_found', message: 'Client API non trovato.' }, {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        console.log(`Client API '${clientIdToUpdate}' aggiornato con successo. Nuovo scope: ${scope}`);

        // 7. Restituisci la risposta di successo
        return NextResponse.json({
            success: true,
            message: 'Client API aggiornato con successo.',
            client_id: data[0].client_id,
            scope: data[0].scope,
        }, {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error('Errore interno del server durante l\'aggiornamento del client API:', error);
        return NextResponse.json({ error: 'server_error', message: 'Si è verificato un errore interno del server.' }, {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}

// --- Handler per le richieste DELETE (Cancellazione di un client API esistente) ---
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
    console.log(`--- Richiesta di Cancellazione Client API Ricevuta per ID: ${params.id} ---`);

    // 1. Autenticazione con Chiave API Master
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== masterApiKey) {
        console.warn('Tentativo di accesso non autorizzato all\'endpoint di cancellazione client.');
        return NextResponse.json({ error: 'unauthorized', message: 'Accesso non autorizzato. Chiave API Master mancante o non valida.' }, {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 2. Estrai l'ID del client dai parametri dell'URL
    const clientIdToDelete = params.id;
    if (!clientIdToDelete) {
        console.warn('ID del client mancante nei parametri dell\'URL per la cancellazione.');
        return NextResponse.json({ error: 'invalid_request', message: 'L\'ID del client è richiesto nell\'URL.' }, {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 3. Verifica connessione Supabase
    if (!supabase) {
        console.error('Errore del server: Client Supabase non inizializzato.');
        return NextResponse.json({ error: 'server_error', message: 'Connessione al database non disponibile.' }, {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        // 4. Cancella il client dal database
        const { error: dbError, count } = await supabase
            .from('api_clients')
            .delete()
            .eq('client_id', clientIdToDelete)
            .select(); // Usa .select() per ottenere il numero di righe eliminate (se supportato e necessario)

        if (dbError) {
            console.error(`Errore database durante la cancellazione del client ${clientIdToDelete}:`, dbError);
            return NextResponse.json({ error: 'database_error', message: 'Errore durante la cancellazione del client API.' }, {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Supabase .delete() con .select() restituisce un array di dati eliminati.
        // Se l'array è vuoto, significa che nessun record è stato trovato o eliminato.
        if (!count || count === 0) { // 'count' è il numero di righe eliminate. Se 0, non trovato.
             console.warn(`Client non trovato per la cancellazione: ${clientIdToDelete}.`);
             return NextResponse.json({ error: 'not_found', message: 'Client API non trovato.' }, {
                 status: 404, // Not Found
                 headers: { 'Content-Type': 'application/json' },
             });
         }


        console.log(`Client API '${clientIdToDelete}' cancellato con successo.`);

        // 5. Restituisci la risposta di successo
        return NextResponse.json({
            success: true,
            message: 'Client API cancellato con successo.',
            client_id: clientIdToDelete, // Conferma l'ID del client cancellato
        }, {
            status: 200, // OK
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error('Errore interno del server durante la cancellazione del client API:', error);
        return NextResponse.json({ error: 'server_error', message: 'Si è verificato un errore interno del server.' }, {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}