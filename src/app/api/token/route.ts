// src/app/api/token/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

interface ApiClientData {
    client_secret_hash: string;
    scope: string;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const jwtSecret = process.env.JWT_SECRET;

let supabase: ReturnType<typeof createClient> | undefined;
if (supabaseUrl && supabaseServiceRoleKey) {
    supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
} else {
    console.error('Le variabili d\'ambiente Supabase (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) non sono completamente configurate per l\'API Token. Impossibile connettersi al DB.');
}

if (!jwtSecret) {
    console.error('La variabile d\'ambiente JWT_SECRET è mancante. La generazione del JWT fallirà.');
}

export async function POST(request: NextRequest) {
    console.log('--- Richiesta Token API Ricevuta ---');
    console.log('Metodo Richiesta:', request.method);
    console.log('Header Content-Type:', request.headers.get('Content-Type'));

    // --- BLOCCO DI DEBUG TEMPORANEO RIMOSSO ---
    // Il codice di debug per bcrypt.compare() è stato rimosso da qui.
    // Era utile per la diagnostica, ma non è necessario in produzione.

    if (!jwtSecret) {
        console.error('Errore Server: JWT_SECRET non configurato. Impossibile generare il token. Stato: 500');
        return NextResponse.json({ error: 'server_error', message: 'Errore di configurazione del server.' }, {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

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

    if (!client_id || typeof client_id !== 'string' ||
        !client_secret || typeof client_secret !== 'string' ||
        grant_type !== 'client_credentials') {
        console.error(`Input non valido per /api/token. Ricevuto: client_id=${client_id}, grant_type=${grant_type}. Stato: 400`);
        return NextResponse.json({ error: 'invalid_request', message: 'client_id, client_secret o grant_type mancanti o non validi.' }, {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    if (!supabase) {
        console.error('Errore Server: Client Supabase non inizializzato. Stato: 500');
        return NextResponse.json({ error: 'server_error', message: 'Connessione al database non disponibile.' }, {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        const { data, error: dbError } = await supabase
            .from('api_clients')
            .select('client_secret_hash, scope')
            .eq('client_id', client_id)
            .single<ApiClientData>();

        if (dbError || !data) {
            console.warn(`Autenticazione fallita per client_id: ${client_id}. Nessun client trovato o errore DB: ${dbError?.message}`);
            return NextResponse.json({ error: 'unauthorized', message: 'Credenziali client non valide.' }, {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const isPasswordValid = await bcrypt.compare(client_secret, data.client_secret_hash);

        if (!isPasswordValid) {
            console.warn(`Autenticazione fallita per client_id: ${client_id}. Secret non corretto.`);
            return NextResponse.json({ error: 'unauthorized', message: 'Credenziali client non valide.' }, {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const accessToken = jwt.sign(
            { client_id: client_id, scope: data.scope },
            jwtSecret,
            { expiresIn: '1h' }
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