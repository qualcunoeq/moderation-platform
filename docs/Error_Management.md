# Gestione degli Errori API

Quando si verificano problemi con le richieste API, la nostra piattaforma risponderà con un codice di stato HTTP appropriato e un corpo JSON che fornisce ulteriori dettagli sull'errore.

## Codici di Stato HTTP Comuni
* **`200 OK`**: La richiesta è stata elaborata con successo.
* **`400 Bad Request`**: La richiesta non è valida. Controlla i parametri e il formato del corpo della richiesta.
* **`401 Unauthorized`**: Le credenziali di autenticazione (`client_id`, `client_secret`) sono mancanti o non valide per l'endpoint `/api/token`.
* **`403 Forbidden`**: Il token JWT è mancante, non valido o scaduto per l'endpoint `/api/moderate`. Oppure, il `client_id` non ha i permessi per accedere al servizio.
* **`404 Not Found`**: L'endpoint richiesto non esiste.
* **`429 Too Many Requests`**: Hai superato i limiti di frequenza delle richieste. Riprova più tardi.
* **`500 Internal Server Error`**: Si è verificato un errore sul lato server. Questo indica un problema con la nostra infrastruttura. Se persiste, contatta il supporto.

## Struttura delle Risposte di Errore
La maggior parte delle risposte di errore avrà una struttura JSON simile a questa:
```json
{
  "error": "Descrizione sintetica dell'errore",
  "details": "Dettagli più specifici sul problema (es. 'Parametro 'text' mancante nel corpo della richiesta.')"
}