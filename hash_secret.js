const bcrypt = require('bcryptjs'); // Assicurati di aver installato bcryptjs: npm install bcryptjs

// IL TUO NUOVO CLIENT SECRET IN CHIARO
// Scegli un secret che sia forte, ma che ti ricordi per ora, per facilitare i test.
// Puoi renderlo più complesso dopo.
const newClientSecret = "MioNuovoSecretSicuro123!"; // <--- CAMBIA QUESTO VALORE!!!

const saltRounds = 10; // Il numero di "rounds" per l'hashing (un valore comune e sicuro)

async function generateHash() {
    try {
        const hash = await bcrypt.hash(newClientSecret, saltRounds);
        console.log('--- Generazione Nuovo Client Secret ---');
        console.log('Nuovo Client Secret (in chiaro):', newClientSecret);
        console.log('Hash Bcrypt generato (da salvare nel DB):', hash);
        console.log('------------------------------------');
        console.log('**IMPORTANTE:** Usa il "Nuovo Client Secret (in chiaro)" nel tuo script PowerShell/Postman.');
        console.log('Salva l\'"Hash Bcrypt generato" nella colonna client_secret_hash della tua tabella Supabase.');

    } catch (error) {
        console.error('Errore durante la generazione dell\'hash:', error);
    }
}

generateHash();