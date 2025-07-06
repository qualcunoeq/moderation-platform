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
    console.error('Variabili d\'ambiente Supabase non completamente configurate per l\'API Statistiche Giornaliere.');
}

// Verifica se la chiave API master è configurata
if (!masterApiKey) {
    console.error('La variabile d\'ambiente MASTER_API_KEY è mancante. L\'endpoint delle statistiche non sarà protetto.');
}

// --- Funzione Helper per formattare la data in YYYY-MM-DD ---
function formatDateToYYYYMMDD(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// --- Handler per le richieste GET (Recupero di tutte le statistiche giornaliere) ---
export async function GET(request: NextRequest) {
    console.log('--- Richiesta Recupero Statistiche Giornaliere Ricevuta ---');

    // 1. Autenticazione con Chiave API Master
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== masterApiKey) {
        console.warn('Tentativo di accesso non autorizzato all\'endpoint di recupero statistiche giornaliere.');
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
        // 3. Recupera le statistiche giornaliere dal database
        // Ordina per data decrescente e limita ai 30 giorni più recenti per evitare risposte troppo grandi
        const { data: dailyStats, error: dbError } = await supabase
            .from('daily_stats')
            .select('*') // Seleziona tutte le colonne
            .order('date', { ascending: false }) // Ordina dalla data più recente
            .limit(30); // Limita agli ultimi 30 giorni

        if (dbError) {
            console.error('Errore database durante il recupero delle statistiche giornaliere:', dbError);
            return NextResponse.json({ error: 'database_error', message: 'Errore durante il recupero delle statistiche giornaliere.' }, {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        console.log(`Recuperate ${dailyStats?.length || 0} righe di statistiche giornaliere.`);

        // 4. Restituisci le statistiche
        return NextResponse.json({
            success: true,
            message: 'Statistiche giornaliere recuperate con successo.',
            stats: dailyStats || [], // Restituisce un array vuoto se non ci sono dati
        }, {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error('Errore interno del server durante il recupero delle statistiche giornaliere:', error);
        return NextResponse.json({ error: 'server_error', message: 'Si è verificato un errore interno del server.' }, {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}


// --- Handler per le richieste POST (Calcolo e Salvataggio Statistiche Giornaliere) ---
// Questo è il codice POST esistente che hai già.
export async function POST(request: NextRequest) {
    console.log('--- Richiesta Calcolo Statistiche Giornaliere Ricevuta ---');

    // 1. Autenticazione con Chiave API Master
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== masterApiKey) {
        console.warn('Tentativo di accesso non autorizzato all\'endpoint delle statistiche giornaliere.');
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

    let targetDate: string;
    try {
        const requestBody = await request.json();
        if (requestBody && requestBody.date && typeof requestBody.date === 'string') {
            targetDate = requestBody.date;
            console.log(`Calcolo statistiche per la data specificata: ${targetDate}`);
        } else {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            targetDate = formatDateToYYYYMMDD(yesterday);
            console.log(`Calcolo statistiche per il giorno precedente: ${targetDate}`);
        }
    } catch (jsonError: any) {
        console.warn(`Errore parsing JSON, useremo la data di ieri per default: ${jsonError.message}`);
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        targetDate = formatDateToYYYYMMDD(yesterday);
    }


    try {
        // 3. Recupera i log di moderazione per la data target
        const { data: logs, error: logsError } = await supabase
            .from('moderation_logs')
            .select('flagged, categories')
            .gte('created_at', `${targetDate}T00:00:00.000Z`)
            .lt('created_at', `${targetDate}T23:59:59.999Z`);

        if (logsError) {
            console.error(`Errore durante il recupero dei log per ${targetDate}:`, logsError);
            return NextResponse.json({ error: 'database_error', message: 'Errore durante il recupero dei log di moderazione.' }, {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const totalRequests = logs?.length || 0;
        let flaggedRequests = 0;
        const categoryBreakdown: { [key: string]: number } = {};

        logs?.forEach(log => {
            if (log.flagged) {
                flaggedRequests++;
            }
            if (Array.isArray(log.categories)) {
                log.categories.forEach((category: string) => {
                    categoryBreakdown[category] = (categoryBreakdown[category] || 0) + 1;
                });
            }
        });

        const approvalRate = totalRequests > 0 ? (totalRequests - flaggedRequests) / totalRequests : 1.0;

        // 4. Prepara i dati per l'upsert
        const dailyStatsData = {
            date: targetDate,
            total_requests: totalRequests,
            flagged_requests: flaggedRequests,
            approval_rate: approvalRate,
            category_breakdown: categoryBreakdown,
        };

        // 5. Inserisci o Aggiorna (Upsert) le statistiche giornaliere
        const { data: upsertData, error: upsertError } = await supabase
            .from('daily_stats')
            .upsert(dailyStatsData, { onConflict: 'date' })
            .select();

        if (upsertError) {
            console.error(`Errore durante l'upsert delle statistiche giornaliere per ${targetDate}:`, upsertError);
            return NextResponse.json({ error: 'database_error', message: 'Errore durante il salvataggio delle statistiche giornaliere.' }, {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        console.log(`Statistiche giornaliere per ${targetDate} salvate/aggiornate con successo.`);
        console.log('Statistiche:', dailyStatsData);

        // --- Logica Semplice di Avviso (Esempio) ---
        if (approvalRate < 0.8 && totalRequests > 10) {
            console.warn(`[AVVISO] Basso tasso di approvazione (${(approvalRate * 100).toFixed(2)}%) per ${targetDate}!`);
        }
        if (flaggedRequests > 50) {
            console.warn(`[AVVISO] Alto numero di richieste segnalate (${flaggedRequests}) per ${targetDate}!`);
        }

        // 6. Restituisci la risposta di successo
        return NextResponse.json({
            success: true,
            message: `Statistiche giornaliere calcolate e salvate per ${targetDate}.`,
            stats: dailyStatsData,
            upserted_record: upsertData ? upsertData[0] : null,
        }, {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error('Errore interno del server durante il calcolo delle statistiche giornaliere:', error);
        return NextResponse.json({ error: 'server_error', message: 'Si è verificato un errore interno del server.' }, {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
