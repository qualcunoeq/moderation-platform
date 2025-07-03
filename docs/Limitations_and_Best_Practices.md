# Limitazioni e Best Practices

Per garantire un servizio stabile e performante per tutti i nostri utenti, è importante essere a conoscenza di alcune limitazioni e seguire le migliori pratiche.

## Limitazioni di Frequenza (Rate Limiting)
(Descrizione dettagliata se e come implementerai il rate limiting: es. "X richieste al minuto per client_id", "headers di risposta per monitorare il limite")

## Lunghezza Massima del Testo
(Specifica la lunghezza massima del testo che l'endpoint `/api/moderate` può accettare, es. "Il testo non deve superare i 10.000 caratteri.")

## Best Practices per l'Integrazione
* **Gestione dei Token:**
    * Non hardcodare i token JWT nel codice.
    * Implementa un meccanismo per rinnovare i token prima della loro scadenza.
* **Gestione degli Errori:**
    * Implementa una robusta gestione degli errori nel tuo codice client per catturare e reagire ai codici di stato HTTP di errore.
    * Considera una strategia di "retry with exponential backoff" per errori temporanei (es. 429, 500).
* **Ottimizzazione delle Linee Guida:**
    * Formulate le vostre linee guida in modo chiaro, conciso e inequivocabile per l'IA.
    * Testate le vostre linee guida con vari tipi di testo per assicurarvi che funzionino come previsto.