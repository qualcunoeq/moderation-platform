# Configurazione delle Linee Guida Personalizzate

Una delle funzionalità più potenti della nostra piattaforma è la capacità di personalizzare la moderazione in base alle **regole specifiche del vostro server, forum o comunità**.

## Come Funziona
Le vostre linee guida personalizzate vengono memorizzate nel nostro sistema e, ogni volta che un testo viene inviato alla moderazione tramite il vostro `client_id`, il nostro motore AI valuterà il testo non solo per contenuti generalmente offensivi, ma anche e soprattutto **in base alle regole che avete fornito**.

## Dove Configurare le Linee Guida
Le linee guida vengono gestite esclusivamente attraverso la vostra **[Dashboard Clienti](#)** (verrà linkata qui una volta creata).
1.  Accedete alla vostra Dashboard Clienti.
2.  Navigate alla sezione "Le Mie Integrazioni" o "Configurazione Account".
3.  Selezionate l'integrazione o il progetto per cui desiderate impostare le linee guida.
4.  Troverete un campo di testo o un editor dove potrete inserire le vostre regole.

## Come Scrivere Linee Guida Efficaci
Per ottenere i migliori risultati dalla moderazione personalizzata, formulate le vostre linee guida in modo chiaro e specifico.

**Esempi di Linee Guida Efficaci:**
* "Vietato l'uso di linguaggio d'odio basato su razza, etnia, religione, genere, orientamento sessuale o disabilità."
* "Non sono ammessi contenuti per adulti (NSFW) o espliciti. Questo include immagini, video e descrizioni testuali."
* "È proibito pubblicare informazioni personali di altri utenti (doxing), come indirizzi, numeri di telefono o dettagli privati, senza il loro esplicito consenso."
* "Le offese personali, gli attacchi gratuiti o i bullismi verso altri membri della comunità non sono tollerati."
* "Non è consentita la promozione di attività illegali, incluso l'acquisto o la vendita di sostanze controllate o armi."
* "Qualsiasi contenuto che inciti alla violenza o promuova l'autolesionismo è severamente proibito."

**Cosa Evitare:**
* Linee guida troppo generiche ("Sii gentile").
* Regole ambigue o soggettive.
* Elenchi troppo lunghi e complessi. L'IA funziona meglio con regole concise e chiare.

## L'Impatto sulla Moderazione
Quando inviate un testo a `/api/moderate`, il nostro sistema recupera le vostre linee guida configurate e le utilizza come contesto aggiuntivo per il modello di intelligenza artificiale. Se il testo viola una delle vostre regole, verrà contrassegnato (`flagged: true`) e il campo `violations` nella risposta indicherà quali regole sono state infrante.