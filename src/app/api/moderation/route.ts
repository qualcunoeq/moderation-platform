// src/app/api/content-moderation/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { OpenAI } from 'openai';

// --- Environment Variable Configuration ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const jwtSecret = process.env.JWT_SECRET;
const openaiApiKey = process.env.OPENAI_API_KEY;

// Initialize Supabase client
let supabase: ReturnType<typeof createClient> | undefined;
if (supabaseUrl && supabaseServiceRoleKey) {
    supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
} else {
    console.error('Supabase environment variables not fully configured for Moderation API. Cannot connect to DB.');
}

// Initialize OpenAI client
let openai: OpenAI | undefined;
if (openaiApiKey) {
    openai = new OpenAI({ apiKey: openaiApiKey });
} else {
    console.error('OPENAI_API_KEY environment variable is missing. OpenAI moderation will not work.');
}

// Check if JWT_SECRET is configured
if (!jwtSecret) {
    console.error('JWT_SECRET environment variable is missing. JWT verification will fail.');
}

// --- Helper Function to Determine Action and Severity ---
function determineActionAndSeverity(moderationResult: any): { action: boolean; severity: string; determinedAction: string } {
    const flagged = moderationResult.flagged;
    const scores = moderationResult.category_scores;

    let severity = 'low';
    let determinedAction = 'approved';

    const highSeverityThreshold = 0.8;
    const mediumSeverityThreshold = 0.5;

    if (flagged) {
        if (scores) {
            if (scores.sexual > highSeverityThreshold || scores.hate > highSeverityThreshold || scores.violence > highSeverityThreshold || scores['self-harm'] > highSeverityThreshold) {
                severity = 'high';
                determinedAction = 'block';
            } else if (scores.sexual > mediumSeverityThreshold || scores.hate > mediumSeverityThreshold || scores.harassment > mediumSeverityThreshold || scores.violence > mediumSeverityThreshold || scores['self-harm'] > mediumSeverityThreshold) {
                severity = 'medium';
                determinedAction = 'manual_review';
            } else {
                severity = 'low';
                determinedAction = 'warn';
            }
        } else {
            console.warn("Moderation scores (category_scores) not found in OpenAI response for severity determination. Defaulting to 'flagged_unknown_severity'.");
            severity = 'unknown';
            determinedAction = 'flagged_unknown_severity';
        }
    } else {
        severity = 'low';
        determinedAction = 'approved';
    }

    return { action: flagged, severity: severity, determinedAction: determinedAction };
}

// --- Helper Function to Apply Custom Rules ---
interface CustomRule {
    id: string; // Ensure this matches the UUID type in the DB
    term: string;
    type: 'blacklist' | 'whitelist';
    action_override: 'block' | 'approve' | 'manual_review' | 'warn' | null;
    is_regex: boolean;
    case_sensitive: boolean;
}

async function applyCustomRules(content: string): Promise<{ actionOverride: string | null; ruleMatched: CustomRule | null }> {
    if (!supabase) {
        console.warn('Supabase client not available for custom rules.');
        return { actionOverride: null, ruleMatched: null };
    }

    try {
        // Retrieve all active custom rules
        const { data, error: dbError } = await supabase
            .from('custom_moderation_rules')
            .select('*');

        if (dbError) {
            console.error('Error retrieving custom moderation rules:', dbError);
            return { actionOverride: null, ruleMatched: null };
        }

        const rules: CustomRule[] = (data as unknown as CustomRule[] || []); // TypeScript FIX

        if (rules.length === 0) {
            console.log('No custom moderation rules found.');
            return { actionOverride: null, ruleMatched: null };
        }

        // Normalize content for case-insensitive comparison if needed
        const normalizedContent = content.toLowerCase();

        let whitelistMatch: CustomRule | null = null;
        let blacklistMatch: CustomRule | null = null;

        for (const rule of rules) {
            let termToMatch = rule.case_sensitive ? rule.term : rule.term.toLowerCase();
            let contentToCompare = rule.case_sensitive ? content : normalizedContent;

            let isMatch = false;
            if (rule.is_regex) {
                try {
                    const regex = new RegExp(termToMatch, rule.case_sensitive ? '' : 'i');
                    isMatch = regex.test(contentToCompare);
                } catch (e) {
                    console.error(`Regex error for rule '${rule.term}':`, e);
                    continue;
                }
            } else {
                isMatch = contentToCompare.includes(termToMatch);
            }

            if (isMatch) {
                if (rule.type === 'whitelist') {
                    whitelistMatch = rule;
                    return { actionOverride: rule.action_override || 'approve', ruleMatched: rule };
                } else if (rule.type === 'blacklist') {
                    blacklistMatch = rule;
                }
            }
        }

        if (blacklistMatch) {
            return { actionOverride: blacklistMatch.action_override || 'block', ruleMatched: blacklistMatch };
        }

        return { actionOverride: null, ruleMatched: null };
    } catch (error: any) {
        console.error('Unexpected error during custom rules application:', error);
        return { actionOverride: null, ruleMatched: null };
    }
}


// --- Main POST Request Handler for /api/content-moderation --- // <--- Aggiornato il log
export async function POST(request: NextRequest) {
    console.log('--- Content Moderation API Request Received ---'); // <--- Aggiornato il log

    // 1. Authenticate JWT (using the token provided by /api/token)
    const authHeader = request.headers.get('Authorization');
    let clientId: string | null = null;
    let clientScope: string | null = null;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn('Unauthorized access attempt: Missing or invalid Authorization header.');
        return NextResponse.json({ error: 'unauthorized', message: 'Missing or invalid Authorization header.' }, {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const token = authHeader.split(' ')[1];

    if (!jwtSecret) {
        console.error('Server Error: JWT_SECRET not configured. Cannot verify token. Status: 500');
        return NextResponse.json({ error: 'server_error', message: 'Server configuration error.' }, {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        const decoded = jwt.verify(token, jwtSecret) as { client_id: string; scope: string; [key: string]: any };
        clientId = decoded.client_id;
        clientScope = decoded.scope;
        console.log(`Token verified. Client ID: ${clientId}, Scope: ${clientScope}`);
    } catch (jwtError: any) {
        console.warn(`JWT verification failed: ${jwtError.message}. Status: 401`);
        return NextResponse.json({ error: 'unauthorized', message: 'Invalid or expired token.' }, {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 2. Parse the request body
    let requestBody;
    try {
        requestBody = await request.json();
    } catch (jsonError: any) {
        console.error(`Error parsing request body for /api/content-moderation: ${jsonError.message}. Status: 400`); // <--- Aggiornato il log
        return NextResponse.json({ error: 'invalid_json', message: 'Request body must be valid JSON.' }, {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const { content, userId } = requestBody;

    // 3. Input Validation
    if (!content || typeof content !== 'string') {
        console.warn('Invalid input: \'content\' field is required and must be a string. Status: 400');
        return NextResponse.json({ error: 'invalid_request', message: '\'content\' field is required and must be a string.' }, {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    let moderationResult: any = null;
    let moderationCategories: string[] = [];
    let moderationScores: { [key: string]: number } = {};
    let determinedAction = 'unknown';
    let moderationSeverity = 'unknown';
    let ruleMatchedId: string | null = null;

    // --- NEW LOGIC: Apply Custom Rules ---
    const { actionOverride, ruleMatched } = await applyCustomRules(content);

    if (actionOverride) {
        console.log(`Custom rule '${ruleMatched?.term}' (ID: ${ruleMatched?.id}, Type: ${ruleMatched?.type}) overrode the action: ${actionOverride}`);
        determinedAction = actionOverride;
        moderationSeverity = 'custom_rule';
        moderationResult = { flagged: determinedAction !== 'approved', categories: {}, category_scores: {} };
        ruleMatchedId = ruleMatched?.id || null;
    } else {
        if (!openai) {
            console.error('Server Error: OpenAI client not initialized. Status: 500');
            return NextResponse.json({ error: 'server_error', message: 'Moderation service not available.' }, {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        try {
            const response = await openai.moderations.create({
                input: content,
            });

            moderationResult = response.results[0];
            console.log('OpenAI moderation result:', moderationResult);

            const { action: flaggedFromOpenAI, severity, determinedAction: calculatedAction } = determineActionAndSeverity(moderationResult);
            moderationSeverity = severity;
            determinedAction = calculatedAction;

            for (const category in moderationResult.categories) {
                if (moderationResult.categories[category]) {
                    moderationCategories.push(category);
                }
            }
            moderationScores = moderationResult.category_scores;

        } catch (openaiError: any) {
            console.error(`Error calling OpenAI moderation API: ${openaiError.message}. Status: 500`);
            return NextResponse.json({ error: 'openai_error', message: 'Error during content moderation.' }, {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }
    }

    // --- LOGGING THE MODERATION OPERATION TO SUPABASE ---
    if (supabase) {
        try {
            const { error: logError } = await supabase
                .from('moderation_logs')
                .insert({
                    client_id: clientId,
                    user_id: userId || null,
                    content: content,
                    flagged: moderationResult.flagged,
                    action: determinedAction,
                    severity: moderationSeverity,
                    categories: moderationCategories,
                    scores: moderationScores,
                    openai_response_raw: moderationResult,
                    custom_rule_id: ruleMatchedId,
                });

            if (logError) {
                console.error('Error logging moderation to Supabase:', logError);
            } else {
                console.log('Moderation log successfully saved to Supabase.');
            }
        } catch (logCatchError: any) {
            console.error('Unexpected error during Supabase logging:', logCatchError);
        }
    } else {
        console.warn('Supabase client not available. Cannot save moderation log.');
    }
    // --- END LOGGING ---

    // 6. Return the moderation result
    return NextResponse.json({
        success: true,
        flagged: moderationResult.flagged,
        action: determinedAction,
        severity: moderationSeverity,
        categories: moderationCategories,
        scores: moderationScores,
        message: moderationResult.flagged ? `Content flagged. Recommended action: ${determinedAction}.` : 'Content approved.',
        custom_rule_applied: !!actionOverride,
        matched_rule_id: ruleMatchedId,
    }, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}