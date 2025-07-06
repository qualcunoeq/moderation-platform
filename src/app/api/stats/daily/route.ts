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

// --- Handler per le richieste POST (Calcolo e Salvataggio Statistiche Giornaliere) ---
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
        // Permetti di specificare la data nel corpo della richiesta per test (es. { "date": "2025-07-05" })
        // Altrimenti, calcola le statistiche per il giorno precedente
        if (requestBody && requestBody.date && typeof requestBody.date === 'string') {
            targetDate = requestBody.date;
            console.log(`Calcolo statistiche per la data specificata: ${targetDate}`);
        } else {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1); // Calcola per ieri
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
            .gte('created_at', `${targetDate}T00:00:00.000Z`) // Dal'inizio del giorno
            .lt('created_at', `${targetDate}T23:59:59.999Z`); // Fino alla fine del giorno

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
            // Aggrega il conteggio delle categorie
            if (Array.isArray(log.categories)) {
                log.categories.forEach((category: string) => {
                    categoryBreakdown[category] = (categoryBreakdown[category] || 0) + 1;
                });
            }
        });

        const approvalRate = totalRequests > 0 ? (totalRequests - flaggedRequests) / totalRequests : 1.0; // 1.0 se nessuna richiesta

        // 4. Prepara i dati per l'upsert
        const dailyStatsData = {
            date: targetDate, // Colonna 'date' nel DB
            total_requests: totalRequests,
            flagged_requests: flaggedRequests,
            approval_rate: approvalRate, // Colonna 'approval_rate' nel DB
            category_breakdown: categoryBreakdown,
        };

        // 5. Inserisci o Aggiorna (Upsert) le statistiche giornaliere
        // Usa `onConflict` sulla colonna `date` per aggiornare se il record per quella data esiste già
        const { data: upsertData, error: upsertError } = await supabase
            .from('daily_stats')
            .upsert(dailyStatsData, { onConflict: 'date' })
            .select(); // Richiede i dati del record inserito/aggiornato

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
        if (approvalRate < 0.8 && totalRequests > 10) { // Se il tasso di approvazione è inferiore all'80% e ci sono abbastanza richieste
            console.warn(`[AVVISO] Basso tasso di approvazione (${(approvalRate * 100).toFixed(2)}%) per ${targetDate}!`);
            // Qui potresti integrare un servizio di notifica (es. email, webhook Discord)
        }
        if (flaggedRequests > 50) { // Se ci sono più di 50 richieste segnalate in un giorno
            console.warn(`[AVVISO] Alto numero di richieste segnalate (${flaggedRequests}) per ${targetDate}!`);
            // Qui potresti integrare un servizio di notifica
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
