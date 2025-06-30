import { createClient } from '@supabase/supabase-js';

// Recupera l'URL del progetto Supabase e la chiave anonima dalle variabili d'ambiente.
// NEXT_PUBLIC_ indica che queste variabili saranno esposte al client (browser),
// il che è necessario per l'SDK di Supabase lato client/API route.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Crea e esporta un client Supabase.
// Questo client verrà utilizzato per interagire con il database Supabase.
export const supabase = createClient(supabaseUrl, supabaseKey);