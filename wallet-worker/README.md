# Serveur Wallet (Cloudflare Worker)

Il signe les billets Google Wallet. Les clés secrètes restent dans Cloudflare et ne sont jamais dans le site public.

## 1. Google Wallet (gratuit)
1. https://pay.google.com/business/console : créer le profil émetteur, puis noter l'**Issuer ID**.
2. https://console.cloud.google.com :
   - créer un projet `sds-wallet` ;
   - aller dans « API et services », puis activer **Google Wallet API**.
3. « IAM et administration », puis « Comptes de service » :
   - créer le compte `sds-wallet` ;
   - ouvrir l'onglet « Clés », puis « Ajouter une clé » et choisir **JSON** ;
   - le fichier se télécharge. Ne le partagez avec personne.
4. Revenir dans la console Wallet, ouvrir « Utilisateurs » et inviter l'adresse `client_email` du JSON avec le rôle **Développeur**.
5. Dans la console Wallet, ajouter votre adresse Gmail comme **utilisateur de test** (en mode démo, seuls les comptes de test peuvent enregistrer un billet).

## 2. Cloudflare Worker (gratuit)
1. https://dash.cloudflare.com, puis « Workers & Pages » et « Créer » : un Worker nommé `sds-wallet`.
2. Cliquer sur « Modifier le code », coller `worker.js`, puis « Déployer ».
3. Ouvrir « Paramètres », puis « Variables et secrets » :
   - `ALLOWED_ORIGINS` (texte) = `https://fadiloundour.github.io`
   - `GOOGLE_ISSUER_ID` (secret) = votre Issuer ID
   - `GOOGLE_SA_EMAIL` (secret) = la valeur `client_email` du JSON
   - `GOOGLE_SA_PRIVATE_KEY` (secret) = la valeur `private_key` du JSON, de `-----BEGIN` à `END PRIVATE KEY-----`
4. Copier l'adresse du Worker (`https://sds-wallet.<compte>.workers.dev`) dans `WALLET_API` de `index.html`.
