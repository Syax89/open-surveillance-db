/**
 * French legal content (fr-FR) — translation of the English pilot
 * (app/lib/legal/en.ts).
 *
 * Web adaptation of the legal documents:
 *   - docs/TERMS_OF_USE.md          → terms
 *   - docs/legal/PRIVACY_NOTICE.md  → privacy
 *   - docs/OPEN_SOURCE.md           → licenses
 *
 * The repository copies of those documents remain the canonical source
 * of record; this file is the presentation layer for the public pages.
 * Inline markup: **bold** and [label](url) (see app/lib/legal/types.ts).
 * Pinned to the same LegalContent type as en.ts/it.ts, so missing/extra
 * keys fail `tsc` — parity per ADR 0007.
 */
import type { LegalContent } from "./types";

export const frLegal: LegalContent = {
  privacy: {
    eyebrow: "Mentions légales · Confidentialité",
    title: "Politique de confidentialité",
    intro:
      "Comment OpenSurveillanceDB traite les données personnelles, ce que nous publions, ce que nous ne collectons jamais, et comment vous pouvez exercer vos droits au titre du RGPD.",
    versionNote:
      "Version 0.8 — 9 août 2026. Alignement sur l’audit juridique : resynchronisée avec la PRIVACY_NOTICE canonique v0.14 (docs/legal/PRIVACY_NOTICE.md reste la version canonique). Le § 5 ajoute le sous-traitant de géocodage Nominatim (PR6) ; le § 7 documente les règles de suppression définitive des anciennes fiches `pending`/`rejected` (R19/R20) ; § 10 Section cookies ; références aux sous-traitants OIDC corrigées en PR4/PR5 ; note sur les catégories particulières reformulée selon le modèle texte uniquement (preuves photographiques supprimées).",
    sections: [
      {
        heading: "1. Qui sommes-nous (responsable du traitement)",
        blocks: [
          {
            type: "paragraph",
            text: "**Responsable du traitement :** Simone Rondina (syax89) / OpenSurveillanceDB — Italie.",
          },
          {
            type: "paragraph",
            text: "**Contact confidentialité :** [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org) — une boîte aux lettres dédiée — pour toute question, demande d’une personne concernée ou signalement. Première réponse sous 48 heures, réponse sur le fond sous 14 jours.",
          },
        ],
      },
      {
        heading: "2. Ce que fait le service",
        blocks: [
          {
            type: "paragraph",
            text: "OpenSurveillanceDB publie une carte d’intérêt public des **infrastructures de surveillance publiques et visibles** (par exemple des caméras installées dans des rues, sur des places ou à l’extérieur de gares), publiées immédiatement depuis des comptes contributeurs vérifiés et tenues à jour par la communauté au moyen de confirmations, de signalements et de seuils automatiques (ADR 0021). Il s’agit d’un projet de transparence citoyenne, et non d’une plateforme commerciale : pas de publicité comportementale, pas de pistage, pas de vente de données.",
          },
        ],
      },
      {
        heading: "3. Quelles données personnelles nous traitons",
        blocks: [
          {
            type: "paragraph",
            text: "Le tableau ci-dessous décrit les données personnelles traitées par le Service, leur source, leur finalité et leur base juridique.",
          },
          {
            type: "table",
            caption: "Données personnelles traitées par le Service",
            headers: ["Données", "Source", "Finalité", "Base juridique"],
            rows: [
              [
                "Contenu du signalement : emplacement, description, fabricant / date d’observation facultatifs, notes privées",
                "Auteur du signalement (personne concernée)",
                "Constituer la fiche publique ; actions communautaires de fiabilisation",
                "Art. 6(1)(f) RGPD",
              ],
              [
                "Identifiant interne pseudonyme du contributeur + horodatage de l’envoi",
                "Auteur du signalement",
                "Prévention des abus, provenance",
                "Art. 6(1)(f) RGPD",
              ],
              [
                "Compte contributeur (e-mail, nom d’affichage facultatif, empreinte du mot de passe)",
                "Contributeur (inscription volontaire)",
                "Connexion, attribution des envois, prévention des abus",
                "Art. 6(1)(f) RGPD — minimisation : pseudonyme facultatif, mot de passe haché en PBKDF2-SHA256, jamais exposé dans les réponses de l’API",
              ],
              [
                "Données de session (jeton haché, jeton CSRF, horodatages)",
                "Le projet (connexion)",
                "Maintenir la connexion du contributeur ; protection CSRF",
                "Art. 6(1)(f) RGPD ; jeton conservé uniquement sous forme SHA-256, expire après 30 jours ou à la déconnexion",
              ],
              [
                "Demande de correction / de retrait (coordonnées fournies par le demandeur, p. ex. e-mail)",
                "Demandeur",
                "Exercice des droits, signalements de préjudice",
                "Art. 6(1)(c) RGPD (articles 15 à 22) et 6(1)(f)",
              ],
              [
                "Actions communautaires sur les fiches (type d’action `like` / `confirm` / `gone` / `problem` / `privacy`, instantané du poids, horodatage)",
                "Contributeur (compte vérifié)",
                "Exactitude du jeu de données — modération communautaire",
                "Art. 6(1)(f) RGPD ; une action par utilisateur et par fiche (`UNIQUE(camera_id, contributor_id)`), instantané du poids au moment de l’action, **uniquement des agrégats dans les données publiques** — jamais attribuées à un profil (ADR 0021 §3/§13)",
              ],
              [
                "Attributs d’identité OIDC (fournisseur, identifiant du sujet, nom d’affichage, indicateur de vérification — jamais l’e-mail)",
                "GitHub / Google (fournisseur d’identité — uniquement si vous choisissez cette méthode)",
                "Connexion facultative du contributeur ; association du compte au contributeur",
                "Art. 6(1)(f) RGPD ; aucun e-mail importé ; le fournisseur observe la connexion et l’adresse IP (§ 5/§ 6)",
              ],
              [
                "Entrées du journal d’audit de modération (décision, code de motif, horodatage, pseudonyme du modérateur)",
                "Le projet",
                "Responsabilité ; anciens recours clôturés par migration (ADR 0021 §7)",
                "Art. 6(1)(f) RGPD ; jamais publiques (uniquement des rapports de transparence agrégés)",
              ],
              [
                "Fiches publiées",
                "Signalements publiés / sources publiques officielles",
                "Le jeu de données public (ODbL 1.0)",
                "Art. 6(1)(f) / 6(1)(e) RGPD",
              ],
            ],
          },
          {
            type: "note",
            text: "**Fiches issues de sources publiques officielles :** lorsqu’une fiche est republiée à partir d’une source publique officielle, les données n’ont pas été obtenues auprès de la personne concernée. Catégories de sources : registres publics et portails de transparence des administrations publiques (par exemple en Italie, les jeux de données du D.Lgs. 33/2013), documents publiés par des autorités publiques et autres sources officielles accessibles au public. Ces fiches sont vérifiées une par une selon le régime juridique propre à la source.",
          },
          {
            type: "note",
            text: "**Historique public des événements de chaque fiche (ADR 0021 § 7) :** chaque transition communautaire (publiée, confirmée, appréciée, signalée comme disparue, masquée, supprimée, rétablie) est consignée dans un **historique public du cycle de vie sans aucune attribution** — aucun identifiant de contributeur, aucun e-mail ni aucune donnée dérivée de l’adresse IP dans les lignes publiques. Il s’agit d’un dispositif de transparence du responsable du traitement, et non d’une nouvelle collecte de données personnelles (agrégats uniquement).",
          },
          {
            type: "note",
            text: "**Fourniture volontaire :** la fourniture de données pour un signalement est **volontaire** — elle ne constitue ni une exigence légale ni une exigence contractuelle. La seule conséquence d’un refus est que le signalement ne peut pas être traité. Il n’existe aucune obligation de fournir des données, ni aucune sanction en cas de refus.",
          },
          {
            type: "note",
            text: "**Catégories particulières (art. 9 RGPD) :** aucune n’est collectée intentionnellement. Les fiches sont **uniquement des métadonnées textuelles** — la fonctionnalité de preuves photographiques a été supprimée (2026-08-08, table `photos` supprimée par la migration 0043), il n’y a donc aucun envoi de médias. Un texte de signalement contenant incidemment des données personnelles (p. ex. un nom ou une plaque dans la description) enfreint les règles de contenu et est traité par la modération communautaire et les corrections.",
          },
          {
            type: "note",
            text: "**Mineurs :** le service s’adresse aux adultes. En Italie, l’envoi d’un signalement requiert l’âge du consentement pour les services de la société de l’information (14 ans, art. 2-quinquies D.Lgs. 196/2003) ; les autres juridictions appliquent leurs propres seuils d’âge.",
          },
        ],
      },
      {
        heading: "4. Ce que nous ne collectons ni ne publions PAS",
        blocks: [
          {
            type: "list",
            items: [
              "**Aucune vidéo, aucun flux en direct, aucun identifiant de connexion, aucune information réseau ni interface de contrôle** — le projet documente l’*existence* d’infrastructures de surveillance visibles, jamais leurs images ni leurs accès.",
              "**Aucune caméra de logement privé** ni caméra orientée vers des intérieurs privés.",
              "**Aucun nom de personne, visage, plaque d’immatriculation ni détail opérationnel précis.**",
              "**Aucune coordonnée plus précise que l’échelle de la zone :** les emplacements publiés sont arrondis à **~4 décimales (~10 m)** ; l’emplacement exact reste dans la base de données et n’est jamais publié.",
              "**Aucune publicité comportementale, aucun pistage, aucune vente de données**, aucune bibliothèque d’analyse d’audience.",
              "Les signalements sont publiés immédiatement depuis des comptes vérifiés et font partie du jeu de données public dès leur envoi. Les contenus qui enfreignent les règles sont retirés par la communauté ou dans le cadre d’une urgence juridique, et les contenus retirés ne sont jamais republiés.",
            ],
          },
        ],
      },
      {
        heading: "5. Destinataires et transferts",
        blocks: [
          {
            type: "list",
            items: [
              "**Cloudflare, Inc.** — hébergement et base de données (Workers + D1). Sous-traitant (art. 28) en vertu de l’avenant sur le traitement des données de Cloudflare (DPA v6.3, juin 2025) intégrant les **clauses contractuelles types de l’UE (2021/914)** ; Cloudflare est certifiée au titre du **cadre de protection des données UE–États-Unis (EU–US Data Privacy Framework)**. D1 est configurée pour une résidence des données dans l’UE.",
              "**OpenStreetMap Foundation (Nominatim — nominatim.openstreetmap.org, sous-traitant PR6).** Géocodage pour le parcours de signalement et les pages des fiches : recherche directe par nom de lieu (`GET /api/geocode`, jusqu’à 5 suggestions) et géocodage inverse coordonnées→adresse (`GET /api/geocode/reverse`, préremplissage du formulaire de signalement). Seule la requête elle-même est envoyée — chaînes de lieu/adresse en texte libre et coordonnées arrondies à ~4 décimales (~11 m) ; la réponse (adresse affichée) est conservée dans le cache D1 (`geocode_reverse_cache`). **Aucune donnée personnelle, aucune donnée de compte, aucun profilage ; les données du demandeur ne sont jamais envoyées ni journalisées.** L’usage respecte la politique de Nominatim : **1 requête/s** au maximum, User-Agent identifiant, cache en priorité.",
              "**GitHub, Inc. / Google LLC (fournisseurs d’identité OIDC — facultatifs, uniquement si vous choisissez cette méthode).** Ils sont **responsables de traitement indépendants pour leurs propres services d’authentification** (leurs politiques de confidentialité s’appliquent lors de la connexion) ; aucune donnée d’OpenSurveillanceDB ne leur est envoyée — nous recevons uniquement les attributs d’identité énumérés au § 3 (fournisseur, identifiant du sujet, nom d’affichage, indicateur de vérification ; jamais l’e-mail). Le fournisseur observe la connexion et votre adresse IP. Jamais publiés, jamais journalisés.",
              "**La publication elle-même :** les fiches publiées font partie d’un jeu de données public sous licence ODbL 1.0 et peuvent être téléchargées ou exportées (JSON/CSV/GeoJSON). Les copies déjà téléchargées ne peuvent pas être rappelées ; les fiches retirées sont exclues des exports ultérieurs.",
              "Aucun autre destinataire ; aucune publicité comportementale ; aucune bibliothèque d’analyse d’audience.",
            ],
          },
        ],
      },
      {
        heading: "6. Transferts internationaux de données",
        blocks: [
          {
            type: "list",
            items: [
              "**Cloudflare :** transferts couverts par le DPA de Cloudflare intégrant les **clauses contractuelles types de l’UE (2021/914)** ; mesures supplémentaires évaluées pour les traitements aux États-Unis (chiffrement en transit, résidence dans l’UE pour D1).",
              "**Connexion OIDC (GitHub/Google, si vous choisissez cette méthode) :** des attributs d’identité (fournisseur, identifiant du sujet, nom d’affichage, indicateur de vérification) sont échangés avec les services du fournisseur lors de la connexion ; ce flux est régi par les conditions et la politique de confidentialité du fournisseur.",
            ],
          },
        ],
      },
      {
        heading: "7. Conservation",
        blocks: [
          {
            type: "paragraph",
            text: "Les signalements sont publiés immédiatement et restent publics tant que la communauté continue de les confirmer ; les fiches retirées par la communauté ou dans le cadre d’une urgence juridique sont exclues des données publiques et suivent le calendrier de conservation du dépôt (docs/legal/RETENTION_SCHEDULE.md). Demandes de correction et entrées d’audit : 2 ans. Journaux opérationnels : jusqu’à 12 mois (agrégés). Sauvegardes : renouvelées par le fournisseur (restauration à un instant donné jusqu’à 30 jours).",
          },
          {
            type: "paragraph",
            text: "Les règles détaillées figurent dans le calendrier de conservation du dépôt (docs/legal/RETENTION_SCHEDULE.md), notamment : données communautaires (R14) — les actions communautaires suivent le compte (actif → effacement ; les actions effectuées sur d’autres fiches sont supprimées avec le contributeur, ADR 0021 § 13, et l’historique public du cycle de vie ne conserve que des agrégats) ; données des méthodes d’authentification (R15, ADR 0020) — jetons de vérification d’e-mail 24 heures, jetons de réinitialisation 3 heures (à usage unique, supprimés après utilisation) ; clés d’accès (passkeys) et codes de récupération tant que le compte est actif, supprimés définitivement lors de l’effacement du compte — rien ne subsiste qui permettrait de relier le compte à un fournisseur ou à un appareil ; compteurs d’échecs de connexion (R16), journal du plafond d’inscriptions par IP (R17) et journal des e-mails transactionnels (R18) purgés par la tâche planifiée de conservation ; fiches de démonstration (R12) purgées par la tâche planifiée de conservation hors environnement de développement.",
          },
          {
            type: "paragraph",
            text: "Les règles de suppression et d’expiration sont appliquées automatiquement par la purge quotidienne de conservation (planifiée dans `worker/index.ts`, tous les jours à 03:00 UTC — RETENTION_SCHEDULE.md § 3) : la tâche planifiée supprime les lignes expirées (R12/R16/R17/R18), supprime définitivement les anciens envois `pending` 90 jours après leur envoi (**R19**) et les anciennes fiches `rejected` 30 jours après la décision (**R20**, les deux étant ignorées tant qu’un recours est ouvert ou qu’une conservation légale est active), archive les entrées d’audit au bout de 2 ans (R4/R5/R9) et ne modifie jamais le statut de cycle de vie des fiches publiées (modèle communautaire, ADR 0021 § 2.2).",
          },
        ],
      },
      {
        heading: "8. Vos droits (articles 15 à 22 du RGPD)",
        blocks: [
          {
            type: "paragraph",
            text: "Vous pouvez demander, gratuitement :",
          },
          {
            type: "list",
            items: [
              "**L’accès** (art. 15) — la confirmation du traitement et une copie de vos données.",
              "**La rectification** (art. 16) — la correction de données inexactes.",
              "**L’effacement** (art. 17) — la suppression, sous réserve des exceptions prévues à l’art. 17(3) et du calendrier de conservation.",
              "**La limitation** (art. 18) et **l’opposition** (art. 21).",
              "**La portabilité** (art. 20) — lorsque cela est techniquement applicable.",
              "Aucune prise de décision automatisée, y compris le profilage, n’est mise en œuvre (art. 22).",
            ],
          },
          {
            type: "paragraph",
            text: "**Comment les exercer :** écrivez à [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org). Afin de protéger les personnes concernées, nous pouvons vous demander de justifier de votre identité, de manière proportionnée à la demande.",
          },
          {
            type: "paragraph",
            text: "**Délai :** nous répondons dans un délai d’**1 mois** (art. 12(3)) ; ce délai peut être prolongé de 2 mois supplémentaires au maximum pour les demandes complexes, avec information préalable. En cas de refus, nous vous en expliquons les raisons et vous rappelons votre droit d’introduire une réclamation.",
          },
          {
            type: "paragraph",
            text: "**Réclamations :** vous pouvez introduire une réclamation auprès de l’autorité de contrôle compétente — en Italie, le [Garante per la protezione dei dati personali](https://www.garanteprivacy.it).",
          },
        ],
      },
      {
        heading: "9. Contact et suivi",
        blocks: [
          {
            type: "paragraph",
            text: "Contact confidentialité : [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org) — première réponse sous 48 heures, réponse sur le fond sous 14 jours.",
          },
          {
            type: "paragraph",
            text: "La présente politique est réexaminée au moins une fois par an, ou à chaque modification importante ; l’historique des versions est conservé dans le dépôt.",
          },
        ],
      },
      {
        heading: "10. Cookies",
        blocks: [
          {
            type: "paragraph",
            text: "OpenSurveillanceDB utilise un seul cookie fonctionnel :",
          },
          {
            type: "paragraph",
            text: "**opensurveillancedb-locale** — mémorise la langue que vous avez choisie sur cet appareil/navigateur (italien ou anglais). Il est déposé **uniquement lorsque vous changez de langue** ; il n’est jamais utilisé pour vous suivre.",
          },
          {
            type: "list",
            items: [
              "**Type :** fonctionnel — strictement nécessaire pour fournir la préférence linguistique que vous avez expressément demandée",
              "**Finalité :** conserver la langue de votre interface",
              "**Durée :** 1 an (`max-age=31536000`)",
              "**Contenu :** aucune de vos données — un simple code de langue (`it` / `en`)",
              "**Propriétés :** `SameSite=Lax`, `path=/`, non lisible depuis d’autres sites (aucune surface de pistage ni de session)",
              "**Base juridique :** art. 122 D.Lgs. 196/2003 (transposant l’art. 5(3) de la directive 2002/58/CE telle que modifiée par la directive 2009/136/CE) — le consentement n’est **pas** requis pour les cookies strictement nécessaires à la fourniture d’un service expressément demandé par l’utilisateur ; aucun bandeau de consentement n’est donc affiché.",
              "**Gestion :** vous pouvez le supprimer à tout moment depuis les paramètres de votre navigateur ; sans lui, l’interface s’affiche par défaut dans la langue pilote (anglais) sur cet appareil.",
            ],
          },
          {
            type: "paragraph",
            text: "La même préférence est dupliquée dans le `localStorage` de votre navigateur pour la synchronisation entre onglets. Le `localStorage` est une technologie de stockage du navigateur, et non un cookie ; il n’est jamais transmis à nos serveurs.",
          },
          {
            type: "note",
            text: "**Engagement :** si la refonte ou une fonctionnalité future introduit des cookies qui ne sont pas strictement nécessaires (mesure d’audience, publicité, profilage), nous vous demanderons votre consentement explicite au moyen d’un bandeau **avant** de les déposer, conformément à l’art. 122 D.Lgs. 196/2003.",
          },
        ],
      },
    ],
  },

  terms: {
    eyebrow: "Mentions légales · Conditions d’utilisation",
    title: "Conditions d’utilisation",
    intro:
      "Les présentes conditions régissent l’utilisation d’OpenSurveillanceDB, la base de données ouverte et maintenue par la communauté des infrastructures de surveillance publiques visibles. Elles s’appliquent à l’application web, à l’API publique, aux exports de données et aux services associés (« le Service »).",
    versionNote:
      "Version 0.5 — 8 août 2026. Alignement sur l’état actuel (prêt pour le modèle) : resynchronisée avec les TERMS_OF_USE canoniques v0.8 (docs/TERMS_OF_USE.md reste la version canonique). § 3.7 informations sur l’authentification (vérification de l’e-mail pour l’accès en écriture, clés d’accès, OIDC — ADR 0020, contrôlé côté serveur) ; § 5 publication immédiate et actions communautaires ; § 6 corrections privées et pouvoir d’urgence juridique ; preuves photographiques supprimées (2026-08-08).",
    sections: [
      {
        heading: "1. Qui sommes-nous",
        blocks: [
          {
            type: "paragraph",
            text: "**Responsable du traitement / exploitant :** Simone Rondina (syax89) / OpenSurveillanceDB — Italie.",
          },
          {
            type: "paragraph",
            text: "**Contact :** [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org) — une boîte aux lettres dédiée — pour toute question, demande de correction, de suppression ou relative à la vie privée. Délais de réponse : première réponse sous 48 heures, décision sur le fond sous 14 jours.",
          },
        ],
      },
      {
        heading: "2. Objet des présentes conditions",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "OpenSurveillanceDB est un **projet de transparence citoyenne non commercial et gouverné par la communauté** qui documente les **infrastructures de surveillance publiques visibles** (par exemple des caméras installées dans des rues, sur des places ou à l’extérieur de gares). Son utilisation est gratuite : pas de publicité, pas de profilage comportemental, pas de vente de données.",
              "En utilisant le Service, vous acceptez les présentes conditions. Si vous **envoyez un signalement**, vous acceptez en outre les obligations relatives aux envois prévues à la section 5.",
              "Le Service ne fournit pas de flux vidéo, d’outils de pistage, d’accès à des caméras privées ni de conseils pour échapper à une surveillance légale.",
            ],
          },
        ],
      },
      {
        heading: "3. Utilisation autorisée du Service",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "**Consultation :** parcourir la carte, le répertoire des fiches et les pages de chaque fiche ; rechercher et lire le jeu de données public.",
              "**Exports :** télécharger les données publiques via les exports JSON/CSV/GeoJSON et l’API publique, et les réutiliser, sous réserve de la licence ODbL 1.0 (section 7) et des limites anti-abus de la section 4.",
              "**Signalements :** envoyer des observations d’infrastructures de surveillance publiques visibles. Un signalement provenant d’un compte vérifié est **publié immédiatement** et fait partie du jeu de données public dès son envoi (section 5).",
              "**Finalités licites :** les données peuvent être utilisées pour la recherche, le journalisme, le plaidoyer citoyen et toute finalité compatible avec les présentes conditions et avec la licence ODbL 1.0. La consultation des données publiques ne nécessite jamais de compte. L’envoi d’un signalement ou d’une correction nécessite un compte contributeur vérifié (section 3.5 ; ADR 0020), et chaque envoi lui est attribué au moyen d’un **identifiant interne pseudonyme** — jamais d’obligation de fournir son vrai nom.",
              "**Méthodes d’authentification (multiméthode, ADR 0020).** Les comptes contributeurs prennent en charge **trois méthodes**, au choix : **(a) e-mail + mot de passe** — la méthode de base, avec **vérification de l’e-mail obligatoire pour l’accès en écriture** (lien à usage unique, 24 h ; tant que vous n’avez pas vérifié votre adresse, votre session est en lecture seule) ; **(b) clés d’accès (passkeys, WebAuthn)** — facultatives, sans mot de passe ; **(c) OIDC via GitHub ou Google** — facultatif, sur adhésion. Les règles :",
            ],
          },
          {
            type: "list",
            items: [
              "**Vérification de l’e-mail.** Après l’inscription, vous devez vérifier votre adresse e-mail avant de pouvoir envoyer, modifier ou vérifier des fiches ; d’ici là, votre session est en lecture seule. Les e-mails de vérification et de réinitialisation du mot de passe sont envoyés via Cloudflare Email Routing, sans contenu de pistage. Une adresse e-mail = un compte ; gardez-la accessible au cas où vous perdriez votre mot de passe.",
              "**Clés d’accès.** Si vous enregistrez une clé d’accès, le site ne conserve que la clé publique ; la clé privée reste sur votre appareil. **Note sur les éditeurs :** les clés d’accès *synchronisées* sont sauvegardées, si vous le choisissez, dans le cloud de l’éditeur du système d’exploitation (Apple/Google/Microsoft) — l’éditeur apprend que vous avez un compte ici, le site ne partage rien avec lui, et vous contrôlez la synchronisation. Conservez en lieu sûr les 10 codes de récupération délivrés lors de l’enregistrement ; sans eux, la perte d’un appareil peut entraîner la perte de l’accès par clé d’accès (la méthode e-mail + mot de passe reste disponible).",
              "**OIDC via GitHub/Google — information sur le pistage.** Se connecter avec GitHub ou Google signifie que **GitHub ou Google observe que vous vous connectez à ce Service, ainsi que votre adresse IP**, à chaque connexion ; les conditions et la politique de confidentialité du fournisseur s’appliquent lors de la connexion. Nous **n’importons pas votre e-mail** depuis le fournisseur (uniquement l’identifiant du sujet, le nom d’affichage et l’indicateur de vérification) et nous ne fusionnons jamais automatiquement des comptes sur la base d’une adresse e-mail identique — un conflit nécessite une fusion manuelle et vérifiée. Cette méthode est **facultative et annoncée** (matrice des risques sur la page de connexion) ; les boutons ne s’affichent que lorsque l’exploitant a activé le fournisseur (identifiants configurés sur ce déploiement).",
              "Vous pouvez ajouter, modifier ou supprimer des méthodes depuis la page de votre compte à tout moment ; la suppression de votre compte supprime les données de toutes les méthodes (politique de confidentialité § 7 R15, § 8).",
            ],
          },
        ],
      },
      {
        heading: "4. Ce que vous ne pouvez pas faire",
        blocks: [
          {
            type: "paragraph",
            text: "**Contenus interdits.** Les exclusions des règles de publication s’appliquent à tout ce que vous envoyez, y compris les signalements et les notes. En particulier, n’envoyez pas :",
          },
          {
            type: "list",
            items: [
              "de caméras résidentielles ou privées, y compris les sonnettes vidéo et les caméras orientées vers un logement privé ;",
              "de vidéo en direct, d’URL de flux, d’identifiants de connexion, d’informations réseau ou d’interfaces de contrôle ;",
              "de champ de vision détaillé ou de capacités opérationnelles susceptibles de créer un risque pour la sécurité ;",
              "d’installations ou de lieux sensibles dont la publication pourrait accroître sensiblement les risques ;",
              "d’allégations invérifiables concernant des personnes ou des organisations ;",
              "de contenus que vous n’avez pas le droit de partager.",
            ],
          },
          {
            type: "paragraph",
            text: "**Aucune donnée personnelle superflue.** Les signalements et les notes ne doivent pas contenir de données personnelles qui ne servent pas la fiche publique (minimisation des données).",
          },
          {
            type: "paragraph",
            text: "**Aucun abus.** Ne dépassez pas les limites de débit applicables, n’aspirez pas le Service au-delà d’un usage personnel raisonnable, ne tentez pas d’accéder à des fiches non publiques (fiches retirées, demandes de correction), ne contournez pas les contrôles d’accès et n’utilisez pas le Service pour harceler ou faciliter un préjudice.",
          },
          {
            type: "paragraph",
            text: "**Aucune revente commerciale du Service lui-même.** La réutilisation des *données* sous ODbL 1.0 (y compris la réutilisation commerciale) reste autorisée ; la présente clause concerne la revente du Service en tant que produit.",
          },
        ],
      },
      {
        heading: "5. Signalements et publication",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "**Publication immédiate.** Un signalement provenant d’un contributeur vérifié est publié immédiatement : il entre dans le jeu de données public dès son envoi. Il n’y a ni file d’examen ni délai d’attente. La communauté veille à l’exactitude du répertoire : les fiches sont confirmées, signalées comme n’étant plus présentes, indiquées comme utiles ou retirées selon des seuils automatiques (ADR 0021). Une fiche peut être masquée ou supprimée à tout moment par suffisamment de signaux de la communauté, ou par une décision d’urgence juridique ; les fiches retirées restent accessibles par lien direct, avec un bandeau et un historique public des événements, et peuvent être rétablies par suffisamment de confirmations.",
              "**Ce que vous conservez et ce que vous concédez.** Vous conservez tous les droits dont vous disposez sur le contenu que vous envoyez. En l’envoyant, vous concédez au projet une licence non exclusive, mondiale et gratuite pour conserver, examiner et publier le signalement dans le cadre de la base de données ouverte, mise à disposition sous **ODbL 1.0**, avec attribution aux contributeurs conformément à la mention ODbL. La publication a lieu lors de l’envoi, et non après une étape d’approbation.",
              "**Vos garanties.** En envoyant un contenu, vous confirmez que : il est exact à votre connaissance ; vous avez le droit de le partager ; il respecte la section 4 ; et vous avez l’âge minimum requis pour utiliser le Service dans votre juridiction (en Italie, 14 ans).",
              "**Exactitude communautaire.** Les fiches republiées à partir de sources publiques officielles suivent leur propre régime juridique, vérifié fiche par fiche ; l’exactitude des signalements de la communauté est assurée par les confirmations et les signalements de la communauté selon les seuils automatiques, et non par comparaison avec des registres officiels.",
            ],
          },
        ],
      },
      {
        heading: "6. Actions communautaires, corrections, urgences juridiques",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "**Actions communautaires.** Tout compte vérifié peut indiquer qu’une fiche est utile, confirmer qu’elle est toujours présente, la signaler comme n’étant plus présente, ou signaler un problème ou une préoccupation relative à la vie privée. Un compte, une action active par fiche. Des seuils automatiques — dont un seuil délibérément bas pour la vie privée — déterminent quand une fiche est masquée ou supprimée ; chaque transition est consignée dans l’historique public de la fiche sans attribution à un quelconque profil.",
              "**Corrections.** Toute personne peut demander une correction ou une suppression via le formulaire de correction privé (page d’accueil, section « Signaler un problème / correction ») ou à [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org). Les demandes sont privées, examinées par une personne et ne modifient jamais la carte automatiquement. Délais visés : première réponse sous **48 heures**, réponse sur le fond sous **14 jours** ; les masquages pour urgence juridique sont immédiats.",
              "**Urgences juridiques.** Le seul pouvoir d’intervention humaine restant est le masquage ou la suppression pour urgence juridique par l’administrateur, utilisé lorsque la loi l’exige et réexaminé a posteriori. Les administrateurs ne peuvent pas rétablir ou démasquer une fiche unilatéralement : le consensus communautaire de la section 5 est la seule voie d’annulation.",
              "Les droits des personnes concernées (accès, rectification, effacement, limitation, opposition, portabilité) sont décrits dans la [politique de confidentialité](/privacy) et s’exercent par le même contact.",
            ],
          },
        ],
      },
      {
        heading: "7. Licences",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "**Données :** la base de données publique et ses exports sont placés sous licence **[ODbL 1.0](https://opendatacommons.org/licenses/odbl/)** — la réutilisation est autorisée, y compris à des fins commerciales, à condition de citer la base de données et, si vous créez une base de données dérivée, de la partager sous ODbL 1.0. Les exports comportent la mention ODbL. Les fiches de démonstration à titre d’illustration font partie de la base de données sous licence.",
              "**Logiciel :** le code source de l’application est placé sous licence **[AGPL-3.0-or-later](https://www.gnu.org/licenses/agpl-3.0.html)**.",
              "**Documentation :** la documentation du projet est proposée sous [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).",
              "**OpenStreetMap :** les données du fond de carte sont utilisées selon les conditions OSM/ODbL ; les exigences d’attribution d’OSM s’appliquent.",
            ],
          },
        ],
      },
      {
        heading: "8. Avertissement sur l’exactitude",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "OpenSurveillanceDB est un **jeu de données citoyen maintenu par la communauté — ni un registre officiel, ni une constatation juridique.** Les fiches peuvent être incomplètes, obsolètes ou inexactes malgré la maintenance communautaire ; la publication est immédiate, et non prudente.",
              "Ne vous fiez pas au jeu de données pour des décisions critiques en matière de sécurité ou des décisions officielles. Vérifiez auprès de sources officielles (par exemple l’administration publique compétente) avant d’agir sur cette base. Le Service fournit uniquement des informations sur des infrastructures visibles — ce n’est pas un répertoire de toutes les caméras, et l’absence d’une fiche ne prouve rien.",
              "Les fiches issues de sources officielles indiquent leur source et leur date de vérification ; les fiches de la communauté n’offrent pas une telle garantie.",
              "Les coordonnées publiées sont arrondies à **~4 décimales (~10 m)** — une précision à l’échelle de la zone. L’emplacement exact n’est jamais publié et reste dans la base de données.",
            ],
          },
        ],
      },
      {
        heading: "9. Confidentialité",
        blocks: [
          {
            type: "paragraph",
            text: "Votre utilisation du Service est régie par la [politique de confidentialité](/privacy). Points essentiels : pas de pistage, pas de publicité comportementale ; les signalements sont publics dès leur publication et les demandes de correction privées restent privées ; vos droits au titre du RGPD peuvent être exercés via [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org) dans les délais légaux (art. 12(3) RGPD).",
          },
        ],
      },
      {
        heading: "10. Disponibilité et limitation de responsabilité",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "Le Service est fourni **« en l’état » et « selon disponibilité »**, sans garantie d’exactitude, d’exhaustivité, de disponibilité ou d’adéquation à un usage particulier.",
              "Dans toute la mesure permise par la loi, le projet et ses contributeurs **ne sont pas responsables** des dommages — y compris les pertes indirectes, accessoires ou consécutives — découlant de l’utilisation du Service ou de ses données, ou de la confiance qui leur est accordée. En particulier, le projet n’est pas responsable des décisions prises sur la base du jeu de données.",
              "Aucune disposition des présentes conditions n’exclut ni ne limite une responsabilité qui ne peut être exclue ou limitée par la loi (par exemple la fraude, le décès ou les dommages corporels causés par négligence, les droits impératifs de protection des consommateurs).",
              "Le Service n’est pas destiné à un usage d’urgence ou critique en matière de sécurité ; il ne remplace pas les canaux d’information officiels.",
            ],
          },
        ],
      },
      {
        heading: "11. Suspension et suppression",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "Nous pouvons suspendre ou limiter l’accès, ou supprimer des contenus, lorsque cela est nécessaire pour faire respecter les présentes conditions, pour protéger les utilisateurs ou les personnes concernées, ou en application des règles de publication — en nous efforçant d’en informer la personne concernée lorsque cela est proportionné et possible.",
              "Les contributeurs peuvent demander la suppression de leurs signalements via [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org) ; les fiches publiées restent publiques tant que la communauté continue de les confirmer, et suivent les voies de correction et de retrait de la section 6.",
            ],
          },
        ],
      },
      {
        heading: "12. Droit applicable et juridiction compétente",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "Les présentes conditions sont régies par **le droit de l’UE et, le cas échéant, le droit italien** — en particulier le RGPD et le D.Lgs. 196/2003 (Codice Privacy, tel que modifié par le D.Lgs. 101/2018).",
              "**Litiges :** les tribunaux du lieu d’établissement du responsable du traitement (Italie) sont compétents, **sans préjudice** du droit des consommateurs résidant dans l’UE de saisir les tribunaux de leur pays de résidence et de bénéficier de la protection des dispositions impératives de leur droit national.",
              "**Réclamations :** vous pouvez introduire une réclamation auprès de l’autorité de contrôle compétente — en Italie, le [Garante per la protezione dei dati personali](https://www.garanteprivacy.it).",
            ],
          },
        ],
      },
      {
        heading: "13. Modification des présentes conditions",
        blocks: [
          {
            type: "list",
            ordered: true,
            items: [
              "Les présentes conditions sont versionnées et conservées dans le dépôt. Les **modifications substantielles** (finalité, licences, publication des données, gouvernance) nécessitent une proposition publique documentée et une période de commentaires raisonnable.",
              "Les modifications non substantielles prennent effet dès leur publication, accompagnées d’un avis. La poursuite de l’utilisation du Service après la date d’entrée en vigueur vaut acceptation ; lorsque la loi exige un consentement, celui-ci sera recueilli séparément.",
            ],
          },
        ],
      },
      {
        heading: "14. Contact",
        blocks: [
          {
            type: "list",
            items: [
              "**Confidentialité, corrections, droits :** [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org) (boîte aux lettres dédiée).",
              "Les urgences juridiques et les signalements d’abus passent par le même canal (masquage immédiat).",
            ],
          },
        ],
      },
    ],
  },

  licenses: {
    eyebrow: "Mentions légales · Licences",
    title: "Licences",
    intro:
      "Sous quelles licences sont placés le logiciel, la documentation et les données d’OpenSurveillanceDB, et ce que cela implique pour leur réutilisation.",
    versionNote:
      "Mis à jour le 31 juillet 2026 (décision sur la licence des données — ADR 0008) et le 5 août 2026 (jeux de données publics importés). La copie du dépôt (docs/OPEN_SOURCE.md) reste la version canonique.",
    sections: [
      {
        heading: "1. Logiciel",
        blocks: [
          {
            type: "paragraph",
            text: "Le code source de l’application est placé sous licence **AGPL-3.0-or-later**. Cela garantit que les versions modifiées exploitées comme services en réseau restent accessibles à la communauté. Voir le fichier [LICENSE](https://github.com/Syax89/open-surveillance-db/blob/main/LICENSE).",
          },
        ],
      },
      {
        heading: "2. Documentation",
        blocks: [
          {
            type: "paragraph",
            text: "Sauf mention contraire dans un document, la documentation du projet est proposée sous [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Les contributeurs conservent le crédit de leurs contributions via l’historique normal du dépôt.",
          },
        ],
      },
      {
        heading: "3. Base de données et exports",
        blocks: [
          {
            type: "paragraph",
            text: "La base de données publique et tous les formats d’export sont placés sous licence **[ODbL 1.0](https://opendatacommons.org/licenses/odbl/)**, avec des mentions claires d’attribution et de partage à l’identique (décision du 31 juillet 2026, [ADR 0008](https://github.com/Syax89/open-surveillance-db/blob/main/docs/decisions/0008-data-licence-precision-retention-contact.md)). La réutilisation est autorisée, y compris à des fins commerciales, à condition de citer la base de données et, si vous créez une base de données dérivée, de la partager sous ODbL 1.0.",
          },
          {
            type: "note",
            text: "Les sources importées conservent leur propre licence et leur propre attribution ; la licence ODbL s’applique à la compilation propre au projet (voir la section 6).",
          },
        ],
      },
      {
        heading: "4. Données OpenStreetMap",
        blocks: [
          {
            type: "paragraph",
            text: "Les données OpenStreetMap sont disponibles sous l’[Open Database License](https://www.openstreetmap.org/copyright). L’utilisation d’un fond de carte OSM ne fait pas automatiquement de chaque fiche du projet une contribution à OSM. Si des données sont importées d’OSM, en sont dérivées ou sont combinées dans une base de données dérivée, le projet doit documenter cette relation, fournir l’attribution requise et respecter les obligations de l’ODbL.",
          },
        ],
      },
      {
        heading: "5. Engagement des contributeurs",
        blocks: [
          {
            type: "paragraph",
            text: "Les contributeurs ne doivent envoyer que des éléments qu’ils ont le droit de partager. Ils concèdent au projet les droits nécessaires pour publier le code, la documentation et les données acceptés sous la licence applicable du projet. ",
          },
        ],
      },
      {
        heading: "6. Jeux de données publics importés",
        blocks: [
          {
            type: "paragraph",
            text: "Le projet peut intégrer des jeux de données publics diffusés par des administrations publiques et des projets de données ouvertes (par exemple des inventaires municipaux de caméras ou les éléments de surveillance d’OpenStreetMap). Chaque source intégrée conserve sa propre licence et sa propre attribution : la licence de la base de données ci-dessus s’applique à la compilation propre au projet, elle ne remplace jamais la licence d’une source individuelle. La page [Sources des données](/fonti) liste chaque jeu de données importé avec sa source, sa licence, sa date d’import, son nombre de fiches et le texte d’attribution requis.",
          },
          {
            type: "note",
            text: "Les fiches importées d’une source indiquent leur provenance sur la page de la fiche. Elles sont soumises à la même vérification communautaire que toute autre fiche et ne sont jamais exemptées d’examen.",
          },
        ],
      },
    ],
  },

  accessibility: {
    eyebrow: "Informations · Accessibilité",
    title: "Déclaration d’accessibilité",
    intro:
      "OpenSurveillanceDB est une base de données citoyenne d’intérêt public. La présente déclaration décrit notre engagement en matière d’accessibilité, notre état de conformité actuel et la manière dont vous pouvez signaler un obstacle.",
    versionNote:
      "Version 0.2 — 8 août 2026. En vigueur (projet open source personnel). La copie du dépôt (docs/ACCESSIBILITY_STATEMENT.md) reste la version canonique.",
    sections: [
      {
        heading: "1. Engagement",
        blocks: [
          {
            type: "paragraph",
            text: "Les parcours essentiels — consulter, rechercher, envoyer et corriger/supprimer — doivent être utilisables au clavier, avec des technologies d’assistance et sur de petits écrans, dans la langue pilote et en anglais. L’objectif du produit est le niveau **WCAG 2.2 AA** pour le site web public, avec des tests manuels par des personnes en situation de handicap avant l’élargissement de la phase pilote.",
          },
        ],
      },
      {
        heading: "2. État de conformité",
        blocks: [
          {
            type: "paragraph",
            text: "**Partiellement conforme.** Le projet met en œuvre un socle d’accessibilité significatif et exécute des **contrôles d’accessibilité automatisés (Lighthouse ≥ 0.95) sur chaque pull request** ; un audit manuel complet de conformité WCAG 2.2 A/AA par des utilisateurs de technologies d’assistance reste prévu. Les limites connues sont énumérées ci-dessous.",
          },
        ],
      },
      {
        heading: "3. Ce qui est déjà mis en œuvre",
        blocks: [
          {
            type: "list",
            items: [
              "Un lien d’évitement et une cible de contenu principal sur chaque page.",
              "Des états de focus clavier visibles et un ordre de focus logique.",
              "La prise en charge de `prefers-reduced-motion` (animations réduites sur demande).",
              "Un répertoire textuel consultable et des pages de détail des fiches qui fonctionnent **sans interaction avec la carte** ; la carte et le répertoire présentent les mêmes champs publics.",
              "Sélection de l’emplacement du signalement par une demande explicite de localisation de l’appareil (lorsque le navigateur l’autorise), par un clic sur la carte **ou** par des coordonnées saisies manuellement et validées ; les alternatives carte/saisie manuelle restent disponibles.",
              "Une interface en anglais/italien avec une préférence de langue enregistrée localement sur l’appareil ; le choix de la langue n’affecte pas les données de l’API.",
              "Un guide bilingue intégré à l’application, à l’adresse [/guide](/guide), expliquant les états des données et le processus de publication.",
              "Les informations de statut ne sont jamais transmises par la seule couleur (des libellés textuels et des icônes sont utilisés).",
            ],
          },
        ],
      },
      {
        heading: "4. Limites connues",
        blocks: [
          {
            type: "list",
            items: [
              "**Les tâches sur la carte sont utilisables au clavier.** Les marqueurs de la carte peuvent recevoir le focus et réagissent aux touches Entrée/Espace (ouverture/fermeture de la fenêtre contextuelle) ; l’alternative sous forme de liste textuelle permet de parcourir et de rechercher les fiches sans la carte.",
              "**Pas encore d’audit manuel de conformité.** Un audit manuel complet avec des lecteurs d’écran, un zoom à 200 %, une vérification des contrastes et de petits écrans n’a pas encore été réalisé ; des contrôles automatisés s’exécutent sur chaque pull request et l’audit manuel est prévu.",
              "**Certaines chaînes visibles par l’utilisateur sont encore définies directement** dans les composants, le temps que l’externalisation des chaînes de l’interface et la relecture de la langue pilote soient achevées.",
              "**La page dédiée aux retours (/feedback) n’est pas encore proposée.** Les obstacles se signalent via les canaux de la section 5.",
            ],
          },
        ],
      },
      {
        heading: "5. Signaler un obstacle",
        blocks: [
          {
            type: "paragraph",
            text: "Le projet propose des **canaux de retour d’utilisabilité non sensibles** afin que chacun puisse signaler un obstacle dans l’interface **sans créer de compte et sans fournir de données personnelles**. Ces canaux demandent uniquement :",
          },
          {
            type: "list",
            items: [
              "le type d’obstacle (navigation/clavier, lecteur d’écran, couleur/contraste, zoom/mise en page, autre) ;",
              "une description en langage simple de ce qui s’est passé ;",
              "facultativement, l’URL de la page où l’obstacle s’est produit ;",
              "facultativement, une adresse de contact, **uniquement si** vous souhaitez une réponse (jamais obligatoire, jamais utilisée à d’autres fins, et supprimée une fois l’échange clos).",
            ],
          },
          {
            type: "paragraph",
            text: "Signalez les obstacles à l’accessibilité par l’un de ces canaux :",
          },
          {
            type: "list",
            items: [
              "ouvrir une issue sur le dépôt du projet (contenu public et non sensible uniquement — n’incluez pas de données personnelles ni de lieux privés) ;",
              "utiliser le [formulaire de correction](/) de la page publique pour les problèmes liés à une fiche précise ;",
              "écrire au contact confidentialité indiqué dans la [politique de confidentialité](/privacy) : [privacy@opensurveillancedb.org](mailto:privacy@opensurveillancedb.org).",
            ],
          },
          {
            type: "paragraph",
            text: "**Engagement de réponse :** les retours sont traités selon les mêmes délais que les demandes de correction et de retrait — un accusé de réception sous **48 heures** et une réponse sur le fond sous **14 jours**, dans la langue du message lorsque cela est possible.",
          },
        ],
      },
      {
        heading: "6. Calendrier de révision",
        blocks: [
          {
            type: "paragraph",
            text: "La présente déclaration est révisée après chaque version qui modifie l’interface ou le comportement en matière d’accessibilité ; au moins une fois par trimestre une fois le service en fonctionnement ; et avant tout lancement public, les résultats finaux de conformité et les exceptions connues étant consignés ici.",
          },
        ],
      },
    ],
  },
};
