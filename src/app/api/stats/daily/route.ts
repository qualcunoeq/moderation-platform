import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// --- Configurazione Variabili d'Ambiente ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const masterApiKey = process.env.MASTER_API_KEY;
const alertWebhookUrl = process.env.ALERT_WEBHOOK_URL; // Nuova variabile d'ambiente

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

// --- Funzione Helper per Inviare Notifiche Webhook ---
async function sendWebhookNotification(message: string, type: 'warning' | 'alert', data?: any) {
    if (!alertWebhookUrl) {
        console.warn('ALERT_WEBHOOK_URL non configurato. Impossibile inviare notifica webhook.');
        return;
    }

    const payload = {
        username: 'Moderation Bot',
        avatar_url: 'https://placehold.co/128x128/FF0000/FFFFFF?text=MOD', // Icona del bot (puoi cambiarla)
        embeds: [
            {
                title: `[${type.toUpperCase()}] Avviso Moderazione`,
                description: message,
                color: type === 'alert' ? 15548997 : 16776960, // Rosso per alert, Giallo per warning
                fields: data ? Object.keys(data).map(key => ({
                    name: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
                    value: typeof data[key] === 'object' ? JSON.stringify(data[key], null, 2) : String(data[key]),
                    inline: true
                })) : [],
                timestamp: new Date().toISOString(),
                footer: {
                    text: 'Next-Moderation Platform'
                }
            }
        ]
    };

    try {
        const response = await fetch(alertWebhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            console.error(`Errore invio webhook (${response.status}): ${response.statusText}`);
            const errorText = await response.text();
            console.error('Dettagli errore webhook:', errorText);
        } else {
            console.log(`Notifica webhook di tipo '${type}' inviata con successo.`);
        }
    } catch (error: any) {
        console.error('Errore durante l\'invio della notifica webhook:', error.message);
    }
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
        const { data: dailyStats, error: dbError } = await supabase
            .from('daily_stats')
            .select('*')
            .order('date', { ascending: false })
            .limit(30);

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
            stats: dailyStats || [],
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

        // --- Logica di Avviso Migliorata con Webhook ---
        if (totalRequests > 0) { // Solo se ci sono richieste da analizzare
            if (approvalRate < 0.8) { // Se il tasso di approvazione è inferiore all'80%
                const message = `Basso tasso di approvazione: ${(approvalRate * 100).toFixed(2)}% per il ${targetDate}.`;
                console.warn(`[AVVISO] ${message}`);
                sendWebhookNotification(message, 'warning', dailyStatsData);
            }
            if (flaggedRequests > 5) { // Se ci sono più di 5 richieste segnalate in un giorno (soglia di esempio)
                const message = `Alto numero di richieste segnalate: ${flaggedRequests} per il ${targetDate}.`;
                console.warn(`[AVVISO] ${message}`);
                sendWebhookNotification(message, 'alert', dailyStatsData);
            }
            // Puoi aggiungere altre condizioni di avviso qui
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
