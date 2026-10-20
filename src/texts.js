// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors, the "Test the connection" report, the scene
// action errors and the summary sentence. Four languages, the four of the
// Gladys interface; German says "du", Spanish "usted". test/i18n.test.js
// checks every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './arr/client.js';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noInstance: {
    en: 'Enter the address and API key of your Sonarr, Radarr, Lidarr, Prowlarr or Bazarr in the configuration.',
    fr: "Saisissez l'adresse et la clé d'API de votre Sonarr, Radarr, Lidarr, Prowlarr ou Bazarr dans la configuration.",
    de: 'Gib die Adresse und den API-Schlüssel deines Sonarr, Radarr, Lidarr, Prowlarr oder Bazarr in der Konfiguration ein.',
    es: 'Introduzca la dirección y la clave de API de su Sonarr, Radarr, Lidarr, Prowlarr o Bazarr en la configuración.',
  },
  invalid: {
    en: 'An instance is incomplete: address (e.g. http://192.168.1.2:8989) and API key.',
    fr: 'Une instance est incomplète : adresse (ex. http://192.168.1.2:8989) et clé d’API.',
    de: 'Eine Instanz ist unvollständig: Adresse (z. B. http://192.168.1.2:8989) und API-Schlüssel.',
    es: 'Una instancia está incompleta: dirección (p. ej. http://192.168.1.2:8989) y clave de API.',
  },
};

// One short explanation per error kind (src/arr/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'does not answer',
    fr: 'ne répond pas',
    de: 'antwortet nicht',
    es: 'no responde',
  },
  [ERROR_KINDS.TLS]: {
    en: 'certificate refused: use the http:// address on your network',
    fr: 'certificat refusé : utilisez l’adresse en http:// de votre réseau',
    de: 'Zertifikat abgelehnt: Verwende die http://-Adresse in deinem Netzwerk',
    es: 'certificado rechazado: use la dirección http:// de su red',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'API key refused',
    fr: "clé d'API refusée",
    de: 'API-Schlüssel abgelehnt',
    es: 'clave de API rechazada',
  },
  [ERROR_KINDS.WRONG_APP]: {
    en: 'this address is another application (Sonarr, Radarr, Lidarr…): check the slot',
    fr: "cette adresse est une autre application (Sonarr, Radarr, Lidarr…) : vérifiez l'emplacement",
    de: 'diese Adresse ist eine andere Anwendung (Sonarr, Radarr, Lidarr…): Prüfe den Platz',
    es: 'esta dirección es otra aplicación (Sonarr, Radarr, Lidarr…): compruebe la ranura',
  },
  [ERROR_KINDS.NOT_ARR]: {
    en: 'no Sonarr, Radarr, Lidarr, Prowlarr or Bazarr API at this address',
    fr: 'aucune API Sonarr, Radarr, Lidarr, Prowlarr ou Bazarr à cette adresse',
    de: 'keine Sonarr-, Radarr-, Lidarr-, Prowlarr- oder Bazarr-API unter dieser Adresse',
    es: 'no hay ninguna API de Sonarr, Radarr, Lidarr, Prowlarr o Bazarr en esta dirección',
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'the address redirects: enter the final address, with its URL base',
    fr: "l'adresse redirige : saisissez l'adresse finale, avec sa base d'URL",
    de: 'die Adresse leitet um: Gib die endgültige Adresse mit ihrer URL-Basis ein',
    es: 'la dirección redirige: introduzca la dirección final, con su base de URL',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'unexpected answer, see the logs',
    fr: 'réponse inattendue, voir les logs',
    de: 'unerwartete Antwort, sieh in den Protokollen nach',
    es: 'respuesta inesperada, consulte los registros',
  },
};

// The "Test the connection" report, one line per instance.
export const REPORT_TEXT = {
  en: {
    ok: (version) => `OK, version ${version}`,
    indexers: (enabled, failing) =>
      `${enabled} indexer(s) enabled${failing ? `, ${failing} failing` : ''}`,
    subtitles: (episodes, movies) =>
      `${episodes} episode(s) and ${movies} movie(s) missing subtitles`,
    queue: (count) => `${count} in queue`,
    missing: (count) => `${count} missing`,
    health: (count) => `${count} health issue(s)`,
  },
  fr: {
    ok: (version) => `OK, version ${version}`,
    indexers: (enabled, failing) =>
      `${enabled} indexeur(s) actif(s)${failing ? `, ${failing} en échec` : ''}`,
    subtitles: (episodes, movies) => `${episodes} épisode(s) et ${movies} film(s) sans sous-titres`,
    queue: (count) => `${count} en file`,
    missing: (count) => `${count} manquant(s)`,
    health: (count) => `${count} alerte(s) de santé`,
  },
  de: {
    ok: (version) => `OK, Version ${version}`,
    indexers: (enabled, failing) =>
      `${enabled} aktive(r) Indexer${failing ? `, ${failing} fehlerhaft` : ''}`,
    subtitles: (episodes, movies) => `${episodes} Episode(n) und ${movies} Film(e) ohne Untertitel`,
    queue: (count) => `${count} in der Warteschlange`,
    missing: (count) => `${count} fehlend`,
    health: (count) => `${count} Zustandsmeldung(en)`,
  },
  es: {
    ok: (version) => `OK, versión ${version}`,
    indexers: (enabled, failing) =>
      `${enabled} indexador(es) activo(s)${failing ? `, ${failing} con error` : ''}`,
    subtitles: (episodes, movies) =>
      `${episodes} episodio(s) y ${movies} película(s) sin subtítulos`,
    queue: (count) => `${count} en cola`,
    missing: (count) => `${count} pendiente(s)`,
    health: (count) => `${count} aviso(s) de estado`,
  },
};

// The sentence of the "Read the summary" scene action, one part per instance.
export const SUMMARY_TEXT = {
  en: {
    episodes: (count) => `${count} episode(s) this week`,
    movies: (count) => `${count} movie(s) this week`,
    albums: (count) => `${count} album(s) this week`,
    queue: (count, errors) => `${count} in queue${errors ? ` (${errors} in error)` : ''}`,
    missing: (count) => `${count} missing`,
    health: (count) => `${count} health issue(s)`,
    down: 'not answering',
    indexers: (enabled, failing) =>
      `${enabled} indexer(s) enabled${failing ? `, ${failing} failing` : ''}`,
    subtitles: (episodes, movies) =>
      `${episodes} episode(s) and ${movies} movie(s) missing subtitles`,
    providers: (count) => `${count} provider(s) failing`,
  },
  fr: {
    episodes: (count) => `${count} épisode(s) cette semaine`,
    movies: (count) => `${count} film(s) cette semaine`,
    albums: (count) => `${count} album(s) cette semaine`,
    queue: (count, errors) => `${count} en file${errors ? ` (${errors} en erreur)` : ''}`,
    missing: (count) => `${count} manquant(s)`,
    health: (count) => `${count} alerte(s) de santé`,
    down: 'ne répond pas',
    indexers: (enabled, failing) =>
      `${enabled} indexeur(s) actif(s)${failing ? `, ${failing} en échec` : ''}`,
    subtitles: (episodes, movies) => `${episodes} épisode(s) et ${movies} film(s) sans sous-titres`,
    providers: (count) => `${count} fournisseur(s) en échec`,
  },
  de: {
    episodes: (count) => `${count} Episode(n) diese Woche`,
    movies: (count) => `${count} Film(e) diese Woche`,
    albums: (count) => `${count} Album/Alben diese Woche`,
    queue: (count, errors) =>
      `${count} in der Warteschlange${errors ? ` (${errors} mit Fehler)` : ''}`,
    missing: (count) => `${count} fehlend`,
    health: (count) => `${count} Zustandsmeldung(en)`,
    down: 'antwortet nicht',
    indexers: (enabled, failing) =>
      `${enabled} aktive(r) Indexer${failing ? `, ${failing} fehlerhaft` : ''}`,
    subtitles: (episodes, movies) => `${episodes} Episode(n) und ${movies} Film(e) ohne Untertitel`,
    providers: (count) => `${count} fehlerhafte(r) Anbieter`,
  },
  es: {
    episodes: (count) => `${count} episodio(s) esta semana`,
    movies: (count) => `${count} película(s) esta semana`,
    albums: (count) => `${count} álbum(es) esta semana`,
    queue: (count, errors) => `${count} en cola${errors ? ` (${errors} con error)` : ''}`,
    missing: (count) => `${count} pendiente(s)`,
    health: (count) => `${count} aviso(s) de estado`,
    down: 'no responde',
    indexers: (enabled, failing) =>
      `${enabled} indexador(es) activo(s)${failing ? `, ${failing} con error` : ''}`,
    subtitles: (episodes, movies) =>
      `${episodes} episodio(s) y ${movies} película(s) sin subtítulos`,
    providers: (count) => `${count} proveedor(es) con error`,
  },
};

// Errors of the scene actions and widget buttons (shown in Gladys).
export const ACTION_TEXT = {
  noInstance: {
    en: 'No Sonarr, Radarr, Lidarr, Prowlarr or Bazarr is configured.',
    fr: "Aucun Sonarr, Radarr, Lidarr, Prowlarr ni Bazarr n'est configuré.",
    de: 'Kein Sonarr, Radarr, Lidarr, Prowlarr oder Bazarr ist konfiguriert.',
    es: 'No hay ningún Sonarr, Radarr, Lidarr, Prowlarr ni Bazarr configurado.',
  },
  unknownInstance: {
    en: 'This instance is no longer in the configuration.',
    fr: "Cette instance n'est plus dans la configuration.",
    de: 'Diese Instanz ist nicht mehr in der Konfiguration.',
    es: 'Esta instancia ya no está en la configuración.',
  },
  unsupported: {
    en: 'Prowlarr has no library: choose a Sonarr, Radarr, Lidarr or Bazarr.',
    fr: "Prowlarr n'a pas de bibliothèque : choisissez un Sonarr, Radarr, Lidarr ou Bazarr.",
    de: 'Prowlarr hat keine Bibliothek: Wähle ein Sonarr, Radarr, Lidarr oder Bazarr.',
    es: 'Prowlarr no tiene biblioteca: elija un Sonarr, Radarr, Lidarr o Bazarr.',
  },
  failed: {
    en: 'No instance accepted the command.',
    fr: "Aucune instance n'a accepté la commande.",
    de: 'Keine Instanz hat den Befehl angenommen.',
    es: 'Ninguna instancia ha aceptado la orden.',
  },
};

export const LANGUAGE_FALLBACK = 'en';

/** "Name: text", with the space French puts before a colon. */
export const labelled = (name, text, language) =>
  `${name}${language === 'fr' ? ' : ' : ': '}${text}`;
export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];
