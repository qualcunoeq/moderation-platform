import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// --- Configurazione Variabili d'Ambiente ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const masterApiKey = process.env.MASTER_API_KEY;

// Inizializza il client Supabase
let supabase: ReturnType<typeof createClient> | undefined;
if (supabaseUrl && supabaseServiceRoleKey) {
    supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
} else {
    console.error('Variabili d\'ambiente Supabase non completamente configurate per l\'API Regole di Moderazione.');
}

// Verifica se la chiave API master è configurata
if (!masterApiKey) {
    console.error('La variabile d\'ambiente MASTER_API_KEY è mancante. L\'endpoint delle regole non sarà protetto.');
}

// --- Handler per le richieste POST (Aggiunta di una nuova regola di moderazione) ---
export async function POST(request: NextRequest) {
    console.log('--- Richiesta Aggiunta Regola di Moderazione Ricevuta ---');

    // 1. Autenticazione con Chiave API Master
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== masterApiKey) {
        console.warn('Tentativo di accesso non autorizzato all\'endpoint di aggiunta regole.');
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
        console.error(`Errore durante il parsing del corpo della richiesta per l'aggiunta regole: ${jsonError.message}`);
        return NextResponse.json({ error: 'invalid_json', message: 'Il corpo della richiesta deve essere JSON valido.' }, {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const { term, type, action_override, is_regex = false, case_sensitive = false } = requestBody;

    // 3. Validazione dell'input
    if (!term || typeof term !== 'string') {
        console.warn('Input non valido: Il campo \'term\' è richiesto e deve essere una stringa.');
        return NextResponse.json({ error: 'invalid_request', message: 'Il campo \'term\' è richiesto e deve essere una stringa.' }, {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    if (!type || (type !== 'blacklist' && type !== 'whitelist')) {
        console.warn('Input non valido: Il campo \'type\' è richiesto e deve essere \'blacklist\' o \'whitelist\'.');
        return NextResponse.json({ error: 'invalid_request', message: 'Il campo \'type\' è richiesto e deve essere \'blacklist\' o \'whitelist\'.' }, {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    if (action_override && !['block', 'approve', 'manual_review', 'warn'].includes(action_override)) {
        console.warn('Input non valido: Il campo \'action_override\' non è valido.');
        return NextResponse.json({ error: 'invalid_request', message: 'Il campo \'action_override\' deve essere \'block\', \'approve\', \'manual_review\' o \'warn\'.' }, {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }
    if (typeof is_regex !== 'boolean' || typeof case_sensitive !== 'boolean') {
        console.warn('Input non valido: I campi \'is_regex\' e \'case_sensitive\' devono essere booleani.');
        return NextResponse.json({ error: 'invalid_request', message: 'I campi \'is_regex\' e \'case_sensitive\' devono essere booleani.' }, {
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
        // 5. Inserisci la nuova regola nel database
        const { data, error: dbError } = await supabase
            .from('custom_moderation_rules')
            .insert({
                term: term,
                type: type,
                action_override: action_override,
                is_regex: is_regex,
                case_sensitive: case_sensitive,
            })
            .select(); // Richiede i dati del record inserito

        if (dbError) {
            console.error(`Errore database durante l'inserimento della regola:`, dbError);
            if (dbError.code === '23505') { // Codice per violazione di unique constraint (se ne aggiungiamo uno in futuro)
                return NextResponse.json({ error: 'duplicate_rule', message: 'Una regola con questo termine esiste già.' }, {
                    status: 409,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            return NextResponse.json({ error: 'database_error', message: 'Errore durante l\'aggiunta della regola di moderazione.' }, {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        console.log(`Regola di moderazione '${term}' (${type}) aggiunta con successo.`);

        // 6. Restituisci la risposta di successo
        return NextResponse.json({
            success: true,
            message: 'Regola di moderazione aggiunta con successo.',
            rule: data ? data[0] : null,
        }, {
            status: 201, // Created
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error('Errore interno del server durante l\'aggiunta della regola di moderazione:', error);
        return NextResponse.json({ error: 'server_error', message: 'Si è verificato un errore interno del server.' }, {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}