import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs'; // <-- Modificato da 'bcrypt' a 'bcryptjs'

// Inizializzazione Supabase per i client API
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// JWT Secret
const jwtSecret = process.env.JWT_SECRET;

// QUESTA È LA FUNZIONE CRUCIALE CHE DEVE ESSERE ESATTAMENTE COSÌ
export async function POST(request: Request) {
  if (!jwtSecret) {
    console.error('JWT_SECRET environment variable not configured.');
    return new Response(JSON.stringify({ error: 'server_error', message: 'Server configuration error.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { client_id, client_secret, grant_type } = await request.json();

    if (!client_id || !client_secret || grant_type !== 'client_credentials') {
      return new Response(JSON.stringify({ error: 'invalid_request', message: 'Missing parameters or invalid grant_type.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { data: clients, error } = await supabase
      .from('api_clients')
      .select('client_id, client_secret_hash')
      .eq('client_id', client_id);

    if (error) {
      console.error('Database query error:', error);
      return new Response(JSON.stringify({ error: 'server_error', message: 'Failed to retrieve client data.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!clients || clients.length === 0) {
      return new Response(JSON.stringify({ error: 'invalid_client', message: 'Invalid client credentials.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const client = clients[0];

    // La logica di confronto rimane la stessa, solo l'importazione è cambiata
    const isValidSecret = await bcrypt.compare(client_secret, client.client_secret_hash);

    if (!isValidSecret) {
      return new Response(JSON.stringify({ error: 'invalid_client', message: 'Invalid client credentials.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const expiresIn = 3600;

    const accessToken = jwt.sign(
      { client_id: client.client_id, scope: 'moderate_content' },
      jwtSecret,
      { expiresIn: expiresIn }
    );

    return new Response(JSON.stringify({
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: expiresIn,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Authorization server error:', error);
    return new Response(JSON.stringify({ error: 'server_error', message: error.message || 'An unexpected error occurred.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}