/**
 * tutors.js — Tuteurs-personnages (personnalité + variante + avatar) et scénarios de jeu de rôle.
 * Tous les personnages et avatars sont des créations originales (SVG générique), sans lien avec un produit tiers.
 * La voix réellement utilisée dépend de l'appareil : le tuteur ne garantit ni voix ni accent (voir speech.js › pickVoice).
 */

/** `persona` est envoyé tel quel à l'IA (en anglais). `accents` : variantes proposées pour ce tuteur par langue. */
export const TUTORS = [
  { id: 'emma', name: 'Emma', role: 'Prof bienveillante', persona: 'Your name is Emma. You are a warm, patient teacher who encourages the learner and celebrates small progress. Speak calmly and clearly.', colors: { skin: '#f2c9a5', hair: '#6b3f2a', shirt: '#e0707a', bg: '#fde8ea' }, hair: 'long', pitch: 1.1 },
  { id: 'lucas', name: 'Lucas', role: 'Partenaire décontracté', persona: 'Your name is Lucas. You are a relaxed, funny friend of the learner. Use simple everyday expressions, light humour and keep the chat informal but clear.', colors: { skin: '#e3b48c', hair: '#2f2a28', shirt: '#4a7fc1', bg: '#e3eefb' }, hair: 'short', pitch: 0.95 },
  { id: 'sofie', name: 'Sofie', role: 'Coach professionnelle', persona: 'Your name is Sofie. You are a polished, efficient coach who works on professional communication. You are polite, precise and gently push the learner to be more precise.', colors: { skin: '#f6d7bd', hair: '#c79a3c', shirt: '#3d8f7a', bg: '#e1f4ee' }, hair: 'bob', pitch: 1.05 },
  { id: 'omar', name: 'Omar', role: 'Curieux et patient', persona: 'Your name is Omar. You are a curious, patient conversation partner who loves asking about the learner\'s life, culture and opinions, and listens carefully before answering.', colors: { skin: '#b9815a', hair: '#1f1a18', shirt: '#c98b2b', bg: '#fbf0d9' }, hair: 'short', pitch: 0.9 },
];

export const getTutor = (id) => TUTORS.find((t) => t.id === id) ?? TUTORS[0];

/**
 * Scénarios. `goal` (affiché, français) ; `setup` (anglais, envoyé à l'IA : situation + rôle de l'IA) ;
 * `levels` : niveaux conseillés ; la conversation libre n'a pas de scénario.
 */
export const SCENARIOS = [
  { id: 'free', title: 'Conversation libre', goal: 'Discuter de tout et de rien, selon le thème choisi.', setup: '' },
  { id: 'cafe', title: 'Au café', goal: 'Commander une boisson et quelque chose à manger, poser une question sur le menu.', topic: 'daily', levels: ['A1', 'A2', 'B1'], setup: 'Role-play: you are a friendly waiter/waitress in a café. The learner is a customer. Take their order, ask one clarifying question at a time and react naturally.' },
  { id: 'directions', title: 'Demander son chemin', goal: 'Demander et comprendre un itinéraire en ville.', topic: 'travel', levels: ['A1', 'A2', 'B1'], setup: 'Role-play: you are a local passer-by in a city. The learner is a lost tourist asking how to get somewhere. Give short step-by-step directions and check they understood.' },
  { id: 'hotel', title: 'À l\'hôtel', goal: 'Enregistrer sa réservation et régler un petit problème (bruit, serviette…).', topic: 'travel', levels: ['A2', 'B1', 'B2'], setup: 'Role-play: you are a hotel receptionist. The learner is a guest checking in, then reporting a small problem with the room. Be polite and propose solutions.' },
  { id: 'interview', title: 'Entretien d\'embauche', goal: 'Se présenter, parler de son parcours et de ses points forts.', topic: 'business', levels: ['B1', 'B2', 'C1'], setup: 'Role-play: you are a recruiter interviewing the learner for a job. Ask one interview question at a time, follow up on their answers, stay professional and encouraging.' },
  { id: 'meeting', title: 'Réunion de travail', goal: 'Donner son avis, proposer un plan et être d\'accord ou non poliment.', topic: 'business', levels: ['B1', 'B2', 'C1'], setup: 'Role-play: you are a colleague in a project meeting. Discuss a deadline problem with the learner; ask for their opinion and politely disagree sometimes so they must justify themselves.' },
  { id: 'doctor', title: 'Chez le médecin', goal: 'Décrire des symptômes et comprendre les conseils.', topic: 'daily', levels: ['A2', 'B1', 'B2'], setup: 'Role-play: you are a doctor in a consultation. The learner is a patient describing mild symptoms. Ask simple questions and give general, non-alarming advice (this is a language exercise, not medical advice).' },
  { id: 'debate', title: 'Petit débat', goal: 'Défendre une opinion et répondre à un contre-argument.', topic: 'news', levels: ['B2', 'C1', 'C2'], setup: 'Role-play: you are a friendly debate partner on a light, non-controversial everyday topic (e.g. remote work, city vs countryside). Take the opposite side from the learner, with respectful counter-arguments.' },
  { id: 'hobby', title: 'Parler de ses loisirs', goal: 'Raconter ce qu\'on aime faire et poser des questions en retour.', topic: 'hobbies', levels: ['A1', 'A2', 'B1', 'B2'], setup: 'Role-play: you are a new friend at a social event. Chat about hobbies and free time; share a little about yourself too so the conversation goes both ways.' },
];

export const getScenario = (id) => SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];

/** Scénarios conseillés pour un niveau (la conversation libre est toujours en premier). */
export function scenariosForLevel(level) {
  return SCENARIOS.filter((s) => s.id === 'free' || !s.levels || s.levels.includes(level));
}
