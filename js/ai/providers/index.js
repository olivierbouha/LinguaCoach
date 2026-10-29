/** Registre des adaptateurs. Pour ajouter un fournisseur : créer son module puis l'ajouter ici. */
import { gemini } from './gemini.js';
import { openai } from './openai.js';
import { anthropic } from './anthropic.js';
import { custom } from './custom.js';

export const PROVIDERS = { gemini, openai, anthropic, custom };
