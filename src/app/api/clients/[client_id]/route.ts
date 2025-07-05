// src/app/api/clients/[client_id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs'; // Necessario se si volesse aggiornare il secret, ma per ora aggiorniamo solo lo scope.

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

// --- Handler per le richieste PUT (Aggiornamento di un client API esistente) ---
// La funzione riceve anche 'params' che contiene i segmenti dinamici dell'URL.
export async function PUT(request: NextRequest, { params }: { params: { client_id: string } }) {
    console.log(`--- Richiesta di Aggiornamento Client API Ricevuta per ID: ${params.client_id} ---`);

    // 1. Autenticazione con Chiave API Master
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== masterApiKey) {
        console.warn('Tentativo di accesso non autorizzato all\'endpoint di aggiornamento client.');
        return NextResponse.json({ error: 'unauthorized', message: 'Accesso non autorizzato. Chiave API Master mancante o non valida.' }, {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 2. Estrai il client_id dai parametri dell'URL
    const clientIdToUpdate = params.client_id;
    if (!clientIdToUpdate) {
        console.warn('client_id mancante nei parametri dell\'URL per l\'aggiornamento.');
        return NextResponse.json({ error: 'invalid_request', message: 'Il client_id è richiesto nell\'URL.' }, {
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

    // Estrai i campi che possono essere aggiornati.
    // Per ora, ci concentriamo sullo 'scope'.
    // Se volessi aggiornare il secret, la logica sarebbe più complessa (generare un nuovo hash).
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
            .update({ scope: scope }) // Aggiorna solo il campo 'scope'
            .eq('client_id', clientIdToUpdate) // Specifica il client da aggiornare
            .select(); // Richiede i dati del record aggiornato

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
                status: 404, // Not Found
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
            status: 200, // OK
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