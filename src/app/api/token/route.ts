// src/app/api/token/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs'; // Assicurati di aver installato 'bcryptjs' (npm install bcryptjs)

// --- Environment Variable Configuration ---
// These variables should be set in your .env.local file and Vercel environment variables.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const jwtSecret = process.env.JWT_SECRET;

// Initialize Supabase client (using the service_role key for server-side operations)
let supabase: ReturnType<typeof createClient> | undefined;
if (supabaseUrl && supabaseServiceRoleKey) {
    supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
} else {
    console.error('Supabase environment variables (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) are not fully configured for the Token API. Cannot connect to DB.');
    // In a production app, you might want to throw an error or exit here if DB is essential.
}

// Check if JWT_SECRET is configured at startup
if (!jwtSecret) {
    console.error('JWT_SECRET environment variable is missing. JWT generation will fail.');
    // This is a critical error: without a secret, tokens cannot be signed securely.
}

// --- Main POST Request Handler for /api/token ---
export async function POST(request: NextRequest) {
    console.log('--- API Token Request Received ---');
    console.log('Request Method:', request.method);
    console.log('Content-Type Header:', request.headers.get('Content-Type'));

    // 1. Validate JWT_SECRET configuration
    if (!jwtSecret) {
        console.error('Server Error: JWT_SECRET not configured. Cannot generate token. Status: 500');
        return NextResponse.json({ error: 'server_error', message: 'Server configuration error.' }, {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 2. Parse the request body for credentials
    let requestBody;
    try {
        requestBody = await request.json();
    } catch (jsonError: any) {
        console.error(`Error parsing request body for /api/token: ${jsonError.message}. Status: 400`);
        return NextResponse.json({ error: 'invalid_json', message: 'Request body must be valid JSON.' }, {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const { client_id, client_secret, grant_type } = requestBody;

    // 3. Input Validation
    // Ensure client_id, client_secret are strings and grant_type is 'client_credentials'
    if (!client_id || typeof client_id !== 'string' ||
        !client_secret || typeof client_secret !== 'string' ||
        grant_type !== 'client_credentials') { // The 'grant_type' is a standard OAuth2 parameter
        console.error(`Invalid input for /api/token. Received: client_id=${client_id}, grant_type=${grant_type}. Status: 400`);
        return NextResponse.json({ error: 'invalid_request', message: 'Missing or invalid client_id, client_secret, or grant_type.' }, {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 4. Connect to Supabase
    if (!supabase) {
        console.error('Server Error: Supabase client not initialized. Status: 500');
        return NextResponse.json({ error: 'server_error', message: 'Database connection not available.' }, {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 5. Retrieve client_secret_hash from the database
    try {
        const { data, error: dbError } = await supabase
            .from('api_clients') // Your Supabase table name for API clients
            .select('client_secret_hash, scope')
            .eq('client_id', client_id)
            .single(); // Expecting a single result

        if (dbError || !data) {
            console.warn(`Authentication failed for client_id: ${client_id}. No client found or DB error: ${dbError?.message}`);
            return NextResponse.json({ error: 'unauthorized', message: 'Invalid client credentials.' }, {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // 6. Compare the provided client_secret with the stored hash
        const isPasswordValid = await bcrypt.compare(client_secret, data.client_secret_hash);

        if (!isPasswordValid) {
            console.warn(`Authentication failed for client_id: ${client_id}. Incorrect secret.`);
            return NextResponse.json({ error: 'unauthorized', message: 'Invalid client credentials.' }, {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // 7. Generate the JWT
        const accessToken = jwt.sign(
            { client_id: client_id, scope: data.scope }, // Payload for the token
            jwtSecret, // Secret key for signing the token
            { expiresIn: '1h' } // Token valid for 1 hour
        );

        console.log(`Token successfully issued for client_id: ${client_id}`);
        return NextResponse.json({ access_token: accessToken, token_type: 'Bearer', expires_in: 3600 }, {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error(`Internal server error during token generation: ${error.message}`);
        return NextResponse.json({ error: 'server_error', message: 'An internal server error occurred.' }, {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}