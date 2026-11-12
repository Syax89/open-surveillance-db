/**
 * api — FR translation. Parity-checked against the English pilot
 * bundle (../../api.ts) via Translation<typeof en>.
 */
import type { Translation } from "../../types";
import type { en } from "../../api";

export const fr: Translation<typeof en> = {
  navigation: "Navigation principale",
  homeAria: "Accueil OpenSurveillanceDB",
  title: "API publique",
  intro:
    "Chaque caméra de la base de données est disponible via une API publique. La lecture se fait sans clé ni inscription : les endpoints ci-dessous sont à vous sous l’Open Database Licence. Les contributeurs vérifiés peuvent aussi écrire via l’API avec des clés privées.",
  apiNote:
    "Sans clé par conception pour la lecture : l’annuaire reste simple à consommer. L’écriture est possible via l’API, mais uniquement avec une clé privée délivrée à un compte vérifié. Les réponses sont en JSON (sauf les tuiles et les exports) et les coordonnées sont arrondies à ~10 m.",
  endpointsTitle: "Endpoints de lecture",
  endpointsIntro:
    "Tous les endpoints de lecture acceptent GET et renvoient du JSON (sauf les tuiles et les exports). Les paramètres de chemin sont indiqués entre {accolades} ; tous les autres sont des paramètres de la query string.",
  endpointMethod: "Méthode",
  endpointPath: "Chemin",
  endpointDescription: "Description",
  endpointExample: "Essayer",
  queryParams: "Paramètres de requête",
  endpointParamsNone: "Aucun : l’id de la fiche est la seule entrée.",
  endpointParamsList:
    "limit (taille de page, max 2000) · offset (début de page) · kind (Fixed dome, Bullet, PTZ, Traffic / licence plate reader, Other / unknown) · freshness (7d, 30d, 90d) · sort (useful, recent, confirmations).",
  endpointParamsBbox:
    "bbox=ouest,sud,est,nord (séparés par des virgules) · kind · freshness · count=false. Renvoie les caméras publiques situées dans la zone affichée : c’est ce qu’utilise la carte interactive. count=false évite le COUNT sur l’ensemble complet et répond total: null (le client pagine via nextOffset). Avec format=geojson, les mêmes filtres kind et freshness s’appliquent, la zone peut couvrir au maximum 50 degrés carrés (au-delà, la réponse est 400) et la FeatureCollection contient au maximum 10 000 features ; s’il y en a davantage, elle porte truncated: true (zoomez pour voir le reste).",
  endpointParamsExport:
    "format=geojson ou format=csv (geojson par défaut). Pas de pagination : l’export contient le jeu de données complet. Les exports sont soumis à une limite de débit plus stricte.",
  endpointParamsRecord:
    "Chemin uniquement. Renvoie 404 lorsque la fiche n’est pas publiquement à jour.",
  endpointParamsSearch:
    "q (texte libre, comparé aux titres, adresses et types). Les résultats sont classés par pertinence.",
  endpointParamsNearby:
    "latitude · longitude (degrés décimaux, obligatoires) · radius (mètres, 100 par défaut, max 5000). Triés par distance.",
  endpointParamsRevisions:
    "cameraId (obligatoire). Renvoie l’historique public des modifications d’une fiche, de la plus ancienne à la plus récente.",
  endpointParamsGeocode:
    "q (nom de lieu, obligatoire). Autocomplétion des lieux relayée vers OpenStreetMap Nominatim, avec cache côté serveur.",
  endpointParamsReverse:
    "lat · lng (obligatoires, degrés décimaux). Renvoie l’adresse la plus proche, mise en cache dès la première recherche.",
  endpointParamsTiles:
    "z (zoom 0-19) · x · y (coordonnées de tuile). Tuiles raster relayées depuis OpenStreetMap.",
  endpoints: {
    list: { method: "GET", path: "/api/cameras", example: "/api/cameras?kind=Fixed%20dome&limit=20", description: "Liste JSON paginée de toutes les caméras publiques. Le point d’entrée principal : filtrez par type ou par fraîcheur, triez et parcourez le jeu de données page par page. Ajoutez count=false pour éviter le COUNT complet (répond total: null, pagine via nextOffset)." },
    bbox: { method: "GET", path: "/api/cameras?bbox=…", example: "/api/cameras?bbox=8.5,47.3,8.6,47.5", description: "Toutes les caméras publiques dans la zone affichée de la carte, en GeoJSON. C’est l’endpoint qu’appelle la carte interactive lorsque vous la déplacez ou zoomez." },
    exportGeojson: { method: "GET", path: "/api/cameras?format=geojson", example: "/api/cameras?format=geojson", description: "Le jeu de données complet en GeoJSON : une seule requête, sans pagination. Idéal pour les outils SIG et l’analyse de données." },
    exportCsv: { method: "GET", path: "/api/cameras?format=csv", example: "/api/cameras?format=csv", description: "Le jeu de données complet en CSV, prêt pour les tableurs. Même contenu que l’export GeoJSON, sous forme de tableau." },
    record: { method: "GET", path: "/api/cameras/{id}", example: "/api/cameras/1", description: "Une fiche de caméra par id numérique, avec tous ses détails publics : position, adresse, état de vérification et historique des modifications." },
    search: { method: "GET", path: "/api/cameras/search?q=…", example: "/api/cameras/search?q=zurich", description: "Recherche textuelle dans les titres, adresses et types. Le moyen rapide de trouver une caméra précise sans parcourir la carte." },
    nearby: { method: "GET", path: "/api/cameras/nearby?latitude=&longitude=", example: "/api/cameras/nearby?latitude=47.41&longitude=8.57&radius=200", description: "Caméras proches d’une position, triées par distance. C’est la vérification des doublons qu’utilise le formulaire de signalement." },
    revisions: { method: "GET", path: "/api/cameras/revisions?cameraId=", example: "/api/cameras/revisions?cameraId=1", description: "Historique public des modifications d’une fiche : ce qui a changé, quand et par qui (anonyme ou contributeur)." },
    geocode: { method: "GET", path: "/api/geocode?q=…", example: "/api/geocode?q=zurich+hb", description: "Autocomplétion des lieux pour les champs de recherche, relayée vers OpenStreetMap Nominatim. Les résultats sont mis en cache : les requêtes répétées ne sollicitent jamais le service amont." },
    geocodeReverse: { method: "GET", path: "/api/geocode/reverse?lat=&lng=", example: "/api/geocode/reverse?lat=47.4123&lng=8.5709", description: "Adresse la plus proche d’une position : la même recherche qui remplit le champ adresse du formulaire de signalement." },
    tiles: { method: "GET", path: "/api/tiles/{z}/{x}/{y}.png", example: "/api/tiles/14/8570/5694.png", description: "Tuiles raster OpenStreetMap, relayées et mises en cache. Utilisez-les pour construire votre propre carte à partir des données des caméras." },
  },
  // API keys (epic api-keys, T19 + t_10e3585e): the write API. The read
  // endpoints above stay keyless — private keys unlock WRITE access only.
  keysTitle: "Clés API",
  keysIntro:
    "Les contributeurs vérifiés peuvent créer des clés privées pour écrire depuis des scripts et des outils : envoyer des signalements et des corrections, confirmer des caméras, modifier des fiches et effectuer des actions communautaires. Les clés sont créées depuis votre compte, affichées une seule fois à la création, expirent par défaut après 365 jours et peuvent être révoquées à tout moment ; chaque compte peut détenir jusqu’à 5 clés actives.",
  keysNote:
    "Les clés privées donnent un accès en écriture à l’API : traitez-les comme un mot de passe. Ne les partagez jamais, ne les publiez jamais dans des dépôts publics, ne les journalisez jamais. Une clé divulguée permet à n’importe qui d’écrire en votre nom : révoquez-la et créez-en une nouvelle.",
  authHeaderTitle: "Authentification",
  authHeaderIntro:
    "Envoyez la clé dans l’en-tête Authorization de la requête. Une clé reste valide jusqu’à son expiration ou jusqu’à ce que vous la révoquiez depuis votre compte. Ne placez jamais la clé dans la query string : les identifiants présents dans les URL fuient dans les journaux des proxys et des serveurs ainsi que dans les en-têtes Referer, et l’API les refuse avec une erreur 400.",
  authHeaderExample:
    'curl -X POST /api/cameras -H "Authorization: Bearer osdb_…" -H "Content-Type: application/json" -d \'{ "title": "…" }\'',
  keysCreateCta: "Créez vos clés API depuis votre compte.",
  writeEndpointsTitle: "Endpoints d’écriture",
  writeEndpointsIntro:
    "Ces endpoints modifient les données publiques et nécessitent un compte vérifié. Authentifiez-vous avec une clé privée dans l’en-tête Authorization ; chaque endpoint requiert le scope indiqué sur sa carte.",
  scopeRequiredLabel: "Scope requis",
  writeEndpoints: {
    cameras: { method: "POST", path: "/api/cameras", scope: "submit", description: "Publier un nouveau signalement de caméra." },
    corrections: { method: "POST", path: "/api/corrections", scope: "submit", description: "Envoyer une correction ou une demande de suppression." },
    confirmation: { method: "PUT / DELETE", path: "/api/cameras/{id}/confirmation", scope: "confirm", description: "Activer ou retirer la confirmation communautaire d’une caméra." },
    actions: { method: "PUT / DELETE", path: "/api/cameras/{id}/actions", scope: "action", description: "Effectuer ou retirer une action communautaire : utile, disparue, problème, vie privée." },
    edit: { method: "PATCH", path: "/api/cameras/{id}", scope: "edit", description: "Mettre à jour les détails d’une caméra : modifications du propriétaire et demandes de modification." },
  },
  scopesTitle: "Autorisations",
  scopesIntro:
    "Chaque clé a une portée limitée : vous choisissez ce qu’elle peut faire, et vous pouvez la révoquer à tout moment depuis votre compte.",
  scopes: {
    submit: { name: "Envoyer", grants: "Publier des signalements de caméras et des corrections.", endpoints: "POST /api/cameras · POST /api/corrections" },
    confirm: { name: "Confirmer", grants: "Marquer des caméras comme confirmées.", endpoints: "PUT/DELETE /api/cameras/{id}/confirmation" },
    edit: { name: "Modifier", grants: "Mettre à jour les détails des caméras (modifications du propriétaire et demandes de modification).", endpoints: "PATCH /api/cameras/{id}" },
    action: { name: "Actions communautaires", grants: "Effectuer des actions communautaires : utile, disparue, problème, vie privée.", endpoints: "PUT/DELETE /api/cameras/{id}/actions" },
  },
  lifecycleTitle: "Cycle de vie des clés",
  lifecycleIntro:
    "Les clés se gèrent depuis votre compte. La clé complète n’est affichée qu’une seule fois, à la création : copiez-la immédiatement, elle n’est jamais conservée sur nos serveurs.",
  lifecycle: {
    create: { name: "Création", body: "Les clés se créent depuis votre compte, dans la section Clés API. L’expiration par défaut est de 365 jours ; à la création, vous pouvez restreindre les autorisations, jamais les élargir ensuite." },
    reveal: { name: "Affichée une fois", body: "La clé complète n’apparaît que dans la fenêtre de création. Ensuite, le compte n’affiche qu’un court préfixe (osdb_…)." },
    expire: { name: "Expiration", body: "Une clé cesse de fonctionner à sa date d’expiration (365 jours après la création par défaut). Les clés expirées répondent 401 à chaque écriture." },
    revoke: { name: "Révocation", body: "La révocation prend effet immédiatement : les scripts qui utilisent la clé échouent aussitôt avec une erreur 401." },
    cap: { name: "Limite", body: "Jusqu’à 5 clés actives par compte. Une fois la limite atteinte, la réponse est 409 : révoquez une clé pour libérer de la place." },
  },
  securityTitle: "Sécurité",
  securityIntro: "Les clés API sont des identifiants de votre compte : manipulez-les comme des mots de passe.",
  security: {
    queryString: { name: "Jamais dans les URL", body: "Les clés vont uniquement dans l’en-tête Authorization. Une clé dans la query string (paramètres api_key, apikey ou key) est refusée avec une erreur 400 sur les requêtes d’écriture, avant tout traitement : les identifiants présents dans les URL fuient dans les journaux des proxys et des serveurs ainsi que dans les en-têtes Referer." },
    logging: { name: "Ne jamais journaliser ni partager les clés", body: "N’affichez pas les clés, ne les stockez pas dans des fichiers publiés dans des dépôts publics et ne les collez pas dans des rapports de bug ou des messages de discussion. Si une clé fuite, révoquez-la et créez-en une nouvelle." },
    storage: { name: "Seule l’empreinte est conservée", body: "Seule une empreinte SHA-256 de la clé est conservée. La clé complète n’existe que dans une seule réponse, celle de la création, et ne peut pas être récupérée." },
  },
  errorsTitle: "Réponses d’erreur",
  errorsIntro:
    "Les requêtes d’écriture échouent avec un code de statut explicite et un format de réponse canonique unique. Les endpoints de lecture continuent de renvoyer 404 pour les fiches qui ne sont pas publiquement à jour.",
  errors: {
    "400": "Requête mal formée : champ manquant ou invalide, ou identifiants dans la query string.",
    "401": "Clé manquante, invalide, expirée ou révoquée.",
    "403": "La clé est valide mais n’inclut pas l’autorisation requise.",
    "404": "Fiche introuvable : l’API ne révèle jamais si un identifiant existe.",
    "409": "Limite atteinte : trop de clés actives (max 5) ou état en conflit.",
    "429": "Limite de débit dépassée, par clé et par adresse IP.",
    "503": "Service temporairement indisponible.",
  },
  keysLimitsTitle: "Limites de débit par clé",
  keysLimitsIntro:
    "Chaque clé est limitée individuellement, en plus des limites par IP ci-dessus : un script ne peut pas épuiser le quota partagé de tous les autres appelants depuis la même adresse.",
  limitsTitle: "Limites de débit",
  limitsIntro:
    "Chaque endpoint est limité par appelant (adresse IP) sur une fenêtre de 60 secondes. Les limites protègent le service et les fournisseurs en amont (OpenStreetMap) : généreuses pour un usage interactif, strictes pour les scrapers.",
  limits: {
    read: { name: "Liste, bbox, fiche, recherche", requests: "300 requêtes / minute" },
    export: { name: "Exports CSV / GeoJSON", requests: "10 requêtes / minute" },
    nearby: { name: "À proximité (vérification des doublons)", requests: "30 requêtes / minute" },
    revisions: { name: "Historique des modifications", requests: "30 requêtes / minute" },
    geocode: { name: "Géocodage (direct + inverse)", requests: "30 requêtes / minute" },
    tiles: { name: "Tuiles de carte", requests: "1200 requêtes / minute" },
  },
  licenseTitle: "Licence et attribution",
  licenseBody:
    "La base de données et ses exports sont publiés sous Open Database Licence (ODbL) 1.0 : vous pouvez partager et adapter les données à condition de citer la source et de publier toute base de données dérivée sous la même licence.",
  attribution: "Données et tuiles cartographiques © contributeurs OpenStreetMap, sous licence ODbL.",
  backToHome: "Retour à l’accueil",
};
