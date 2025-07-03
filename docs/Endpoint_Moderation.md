# Endpoint di Moderazione: `/api/moderate`

Questo è l'endpoint principale per inviare testi alla moderazione automatica.

## Panoramica
L'endpoint `/api/moderate` analizza il testo fornito utilizzando i nostri modelli di intelligenza artificiale, tenendo conto delle **linee guida personalizzate che avete configurato** per il vostro `client_id` (o la specifica integrazione). Il risultato indicherà se il testo viola le regole e fornirà dettagli pertinenti.

## Metodo HTTP
`POST`

## URL
`https://your-domain.com/api/moderate` (sostituire con il dominio reale)

## Header Richiesti
* `Content-Type: application/json`
* `Authorization: Bearer <your_jwt_token>`

## Corpo della Richiesta (JSON)
```json
{
  "text": "Il testo che desiderate moderare."
}