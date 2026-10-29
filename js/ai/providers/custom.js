/**
 * Fournisseur personnalisé : serveur compatible avec le protocole « OpenAI Chat Completions »
 * (POST {baseUrl}/chat/completions, GET {baseUrl}/models, SSE `data: [DONE]`).
 *
 * Seul ce protocole est pris en charge. Un serveur qui parle un autre protocole ne fonctionnera pas.
 * - L'URL de base est obligatoire (ex. http://localhost:11434/v1 pour Ollama).
 * - La clé est facultative (serveurs locaux).
 * - Le navigateur impose le CORS : le serveur doit autoriser l'origine de l'application.
 * - Le mode JSON natif n'est pas supposé (la robustesse repose sur l'analyse tolérante du texte).
 * - Un site en HTTPS ne peut pas appeler un serveur HTTP non local (contenu mixte).
 */
import { createOpenAICompatible } from './openai.js';

export const custom = createOpenAICompatible({
  id: 'custom', label: 'Fournisseur personnalisé (compatible OpenAI)', defaultBaseUrl: '',
  requiresKey: false, requiresBaseUrl: true, tokenParam: 'max_tokens', supportsJsonMode: false,
});
