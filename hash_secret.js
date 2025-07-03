// hashSecret.js
const bcrypt = require('bcryptjs'); // Assicurati che bcryptjs sia installato (npm install bcryptjs)

const clientSecretToHash = "8cXOpxJtuBL7v32Yi61kgbfQVNRrlUoI"; // <-- SOSTITUISCI QUESTO

async function hashClientSecret() {
    try {
        const saltRounds = 10; // Un valore standard per la sicurezza
        const hashedSecret = await bcrypt.hash(clientSecretToHash, saltRounds);
        console.log("Client Secret Originale:", clientSecretToHash);
        console.log("Client Secret Hashato:", hashedSecret);
    } catch (error) {
        console.error("Errore durante l'hashing:", error);
    }
}

hashClientSecret();