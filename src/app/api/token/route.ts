import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt'; // Importa bcrypt

// Inizializza Supabase Client con la Service Role Key
// Questa chiave ha i permessi per bypassare RLS e leggere la tabella api_clients
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

export async function POST(request: Request) {
    try {
        const { client_id, client_secret, grant_type } = await request.json();

        // 1. Verifica il grant_type
        if (grant_type !== 'client_credentials') {
            return new Response(JSON.stringify({
                error: 'unsupported_grant_type',
                error_description: 'Only client_credentials grant type is supported.'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // 2. Cerca il client nel database Supabase
        const { data: client, error } = await supabase
            .from('api_clients')
            .select('client_id, client_secret_hash') // Seleziona solo ciò che serve
            .eq('client_id', client_id)
            .single();

        if (error || !client) {
            console.error('Client lookup error:', error?.message || 'Client not found.');
            return new Response(JSON.stringify({
                error: 'invalid_client',
                error_description: 'Invalid client ID or client not found.'
            }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // 3. Verifica il client_secret confrontando l'hash
        const isSecretValid = await bcrypt.compare(client_secret, client.client_secret_hash);

        if (!isSecretValid) {
            return new Response(JSON.stringify({
                error: 'invalid_client',
                error_description: 'Invalid client secret.'
            }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // 4. Emetti l'Access Token JWT
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            console.error('JWT_SECRET environment variable not configured.');
            return new Response(JSON.stringify({
                error: 'server_error',
                error_description: 'Server misconfiguration: JWT secret missing.'
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const accessToken = jwt.sign(
            { client_id: client.client_id, scope: 'moderate_content' }, // Payload del token
            jwtSecret,
            { expiresIn: '1h' } // Il token scade dopo 1 ora
        );

        return new Response(JSON.stringify({
            access_token: accessToken,
            token_type: 'bearer',
            expires_in: 3600 // Secondi (1 ora)
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error('Error in token endpoint:', error);
        return new Response(JSON.stringify({
            error: 'internal_server_error',
            error_description: error.message || 'An unexpected error occurred.'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}