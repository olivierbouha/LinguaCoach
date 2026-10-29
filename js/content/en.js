/**
 * content/en.js — Bibliothèque locale d'exercices d'anglais (fonctionne sans IA, hors ligne).
 *
 * Les textes sont neutres ; les mots marqués {clé} sont résolus selon l'accent choisi grâce à LEXICON
 * (ex. {lift} → « elevator » en en-US, « lift » en en-GB/en-AU). Ainsi les exemples suivent la variante.
 * Format des questions : { q, options[], answer (index), explanation (en français) }.
 */

export const LEXICON = {
  lift: { US: 'elevator', GB: 'lift', AU: 'lift' },
  flat: { US: 'apartment', GB: 'flat', AU: 'apartment' },
  holiday: { US: 'vacation', GB: 'holiday', AU: 'holiday' },
  biscuit: { US: 'cookie', GB: 'biscuit', AU: 'biscuit' },
  underground: { US: 'subway', GB: 'Underground', AU: 'train' },
  lorry: { US: 'truck', GB: 'lorry', AU: 'truck' },
  petrol: { US: 'gas', GB: 'petrol', AU: 'petrol' },
  pavement: { US: 'sidewalk', GB: 'pavement', AU: 'footpath' },
  mobile: { US: 'cell phone', GB: 'mobile', AU: 'mobile' },
  autumn: { US: 'fall', GB: 'autumn', AU: 'autumn' },
  colour: { US: 'color', GB: 'colour', AU: 'colour' },
  favourite: { US: 'favorite', GB: 'favourite', AU: 'favourite' },
  centre: { US: 'center', GB: 'centre', AU: 'centre' },
  queue: { US: 'line', GB: 'queue', AU: 'queue' },
  rubbish: { US: 'trash', GB: 'rubbish', AU: 'rubbish' },
  takeaway: { US: 'takeout', GB: 'takeaway', AU: 'takeaway' },
  trainers: { US: 'sneakers', GB: 'trainers', AU: 'runners' },
  film: { US: 'movie', GB: 'film', AU: 'movie' },
  chemist: { US: 'drugstore', GB: 'chemist', AU: 'chemist' },
  cinema: { US: 'movie theater', GB: 'cinema', AU: 'cinema' },
};

/** Phrases courtes (écoute « phrase », dictée, expression orale). */
export const PHRASES = [
  // Vie quotidienne
  { id: 'd1', topic: 'daily', level: 'A1', text: 'I wake up at seven and drink a cup of tea.' },
  { id: 'd2', topic: 'daily', level: 'A2', text: 'My {flat} is on the third floor, so I take the {lift}.' },
  { id: 'd3', topic: 'daily', level: 'B1', text: 'I usually do the shopping on Saturday morning because the shops are quieter.' },
  { id: 'd4', topic: 'daily', level: 'B2', text: 'Although I was exhausted, I managed to cook dinner for the whole family.' },
  { id: 'd5', topic: 'daily', level: 'C1', text: 'Had I known the {rubbish} was collected so early, I would have put it out the night before.' },
  // Voyage
  { id: 't1', topic: 'travel', level: 'A1', text: 'Where is the train station, please?' },
  { id: 't2', topic: 'travel', level: 'A2', text: 'I would like a room for two nights with a view of the sea.' },
  { id: 't3', topic: 'travel', level: 'B1', text: 'Excuse me, could you tell me how to get to the city {centre} from here?' },
  { id: 't4', topic: 'travel', level: 'B2', text: 'We had to rearrange our whole {holiday} after the airline cancelled our connecting flight.' },
  { id: 't5', topic: 'travel', level: 'C1', text: 'The itinerary was so packed that we scarcely had time to appreciate the places we visited.' },
  // Business
  { id: 'b1', topic: 'business', level: 'A1', text: 'The meeting starts at nine o\'clock.' },
  { id: 'b2', topic: 'business', level: 'A2', text: 'Could you send me the report by email, please?' },
  { id: 'b3', topic: 'business', level: 'B1', text: 'I would like to schedule a call to discuss the next steps of the project.' },
  { id: 'b4', topic: 'business', level: 'B2', text: 'Given the tight deadline, we should prioritise the tasks that have the greatest impact.' },
  { id: 'b5', topic: 'business', level: 'C1', text: 'Notwithstanding the initial setbacks, the team delivered a solution that exceeded the client\'s expectations.' },
  // Hobbies
  { id: 'h1', topic: 'hobbies', level: 'A1', text: 'I like playing football with my friends.' },
  { id: 'h2', topic: 'hobbies', level: 'A2', text: 'My {favourite} {film} is about a dog that travels across the country.' },
  { id: 'h3', topic: 'hobbies', level: 'B1', text: 'I have been learning the guitar for six months, and I practise every evening.' },
  { id: 'h4', topic: 'hobbies', level: 'B2', text: 'What I enjoy most about hiking is the sense of freedom you get at the top of a hill.' },
  { id: 'h5', topic: 'hobbies', level: 'C1', text: 'She took up painting late in life, and it proved to be a surprisingly cathartic pursuit.' },
  // Actualités
  { id: 'n1', topic: 'news', level: 'A1', text: 'The weather is very bad today.' },
  { id: 'n2', topic: 'news', level: 'A2', text: 'The government has announced a new plan for public transport.' },
  { id: 'n3', topic: 'news', level: 'B1', text: 'Many people think that social media has changed the way we get the news.' },
  { id: 'n4', topic: 'news', level: 'B2', text: 'Critics argue that the new policy will widen the gap between rich and poor.' },
  { id: 'n5', topic: 'news', level: 'C1', text: 'The debate hinges on whether technological progress should be regulated more stringently.' },
];

/** Dialogues (écoute) — deux interlocuteurs. */
export const DIALOGUES = [
  {
    id: 'dl-daily', topic: 'daily', level: 'B1', title: 'Au supermarché',
    lines: [
      { speaker: 'A', text: 'Excuse me, where can I find the {biscuit}s?' },
      { speaker: 'B', text: 'They are in aisle five, next to the tea and coffee.' },
      { speaker: 'A', text: 'Thanks. Is there a long {queue} at the checkout today?' },
      { speaker: 'B', text: 'Not really. It is usually busier after five o\'clock.' },
    ],
    questions: [
      { q: 'Where are the {biscuit}s?', options: ['In aisle five', 'Next to the checkout', 'In aisle three'], answer: 0, explanation: 'B répond : « They are in aisle five, next to the tea and coffee. »' },
      { q: 'When is the shop usually busier?', options: ['In the morning', 'After five o\'clock', 'At lunchtime'], answer: 1, explanation: 'B précise : « It is usually busier after five o\'clock. »' },
    ],
  },
  {
    id: 'dl-travel', topic: 'travel', level: 'B1', title: 'À la réception de l\'hôtel',
    lines: [
      { speaker: 'A', text: 'Good evening. I have a reservation under the name Martin.' },
      { speaker: 'B', text: 'Yes, a double room for three nights. Breakfast is served from seven to ten.' },
      { speaker: 'A', text: 'Perfect. Is there a {lift}? I have two heavy suitcases.' },
      { speaker: 'B', text: 'Of course, it is just behind you. Your room is on the fourth floor.' },
    ],
    questions: [
      { q: 'How long is the stay?', options: ['Two nights', 'Three nights', 'Four nights'], answer: 1, explanation: 'La réceptionniste dit « for three nights ».' },
      { q: 'Why does the guest ask about the {lift}?', options: ['The room is far away', 'He has heavy suitcases', 'He is tired'], answer: 1, explanation: 'Il dit : « I have two heavy suitcases. »' },
    ],
  },
  {
    id: 'dl-business', topic: 'business', level: 'B1', title: 'Planifier une réunion',
    lines: [
      { speaker: 'A', text: 'Hi Sam, are you free on Thursday to go over the budget?' },
      { speaker: 'B', text: 'I have a client call in the morning, but the afternoon is fine.' },
      { speaker: 'A', text: 'Great. Shall we say two o\'clock in the small meeting room?' },
      { speaker: 'B', text: 'Works for me. I will bring the latest figures.' },
    ],
    questions: [
      { q: 'What will they discuss?', options: ['A client call', 'The budget', 'A new office'], answer: 1, explanation: '« to go over the budget » = passer le budget en revue.' },
      { q: 'What time is the meeting?', options: ['Two o\'clock', 'Ten o\'clock', 'Four o\'clock'], answer: 0, explanation: 'A propose « two o\'clock » et B accepte.' },
    ],
  },
  {
    id: 'dl-hobbies', topic: 'hobbies', level: 'B1', title: 'Projet de week-end',
    lines: [
      { speaker: 'A', text: 'Do you fancy going to the {cinema} on Saturday?' },
      { speaker: 'B', text: 'I would love to, but I promised my brother I would help him move house.' },
      { speaker: 'A', text: 'No problem. What about Sunday evening instead?' },
      { speaker: 'B', text: 'Sunday is perfect. Let me check which {film}s are showing.' },
    ],
    questions: [
      { q: 'Why can\'t B go on Saturday?', options: ['B is working', 'B is helping their brother move', 'B is ill'], answer: 1, explanation: '« I promised my brother I would help him move house. »' },
      { q: 'When do they finally plan to go?', options: ['Saturday', 'Sunday evening', 'Friday'], answer: 1, explanation: 'Ils conviennent de dimanche soir.' },
    ],
  },
  {
    id: 'dl-news', topic: 'news', level: 'B2', title: 'Discussion sur les réseaux sociaux',
    lines: [
      { speaker: 'A', text: 'Did you read that article about teenagers and social media?' },
      { speaker: 'B', text: 'I did. It claims that limiting screen time improves concentration, but I am not fully convinced.' },
      { speaker: 'A', text: 'Why not? The study seemed quite thorough to me.' },
      { speaker: 'B', text: 'The sample was small, so I would be cautious about drawing firm conclusions.' },
    ],
    questions: [
      { q: 'What does the article claim?', options: ['Social media is harmless', 'Limiting screen time helps concentration', 'Teenagers read less'], answer: 1, explanation: 'B résume : « limiting screen time improves concentration ».' },
      { q: 'Why is B sceptical?', options: ['The sample was small', 'The article was old', 'The author was biased'], answer: 0, explanation: '« The sample was small, so I would be cautious… »' },
    ],
  },
];

/** Mini-histoires avec questions de compréhension. */
export const STORIES = [
  {
    id: 'st-daily-a2', topic: 'daily', level: 'A2', title: 'Un matin chargé',
    text: 'Anna gets up at six thirty. She makes breakfast for her two children and packs their lunch. Then she takes them to school by bus. After that, she walks to work. She works in a small bookshop near the {centre} of the town.',
    questions: [
      { q: 'How does Anna take the children to school?', options: ['By car', 'By bus', 'On foot'], answer: 1, explanation: 'Le texte dit : « She takes them to school by bus. »' },
      { q: 'Where does Anna work?', options: ['In a bookshop', 'In a school', 'In a bank'], answer: 0, explanation: '« She works in a small bookshop. »' },
    ],
  },
  {
    id: 'st-daily-b2', topic: 'daily', level: 'B2', title: 'Un voisin bruyant',
    text: 'For weeks, Tom had been kept awake by loud music coming from the {flat} upstairs. Rather than complain angrily, he wrote a polite note and slipped it under the door. To his surprise, the neighbour apologised the next day and even offered him a plate of home-made {biscuit}s.',
    questions: [
      { q: 'How did Tom deal with the problem?', options: ['He called the police', 'He wrote a polite note', 'He moved out'], answer: 1, explanation: '« he wrote a polite note and slipped it under the door ».' },
      { q: 'How did the neighbour react?', options: ['He ignored it', 'He got angry', 'He apologised'], answer: 2, explanation: '« the neighbour apologised the next day ».' },
    ],
  },
  {
    id: 'st-travel-a2', topic: 'travel', level: 'A2', title: 'Un week-end à Londres',
    text: 'Last weekend, Maria visited London with her sister. They took the {underground} everywhere because it was fast and cheap. On Sunday they walked along the river and ate fish and chips. They want to go back in the {autumn}.',
    questions: [
      { q: 'Why did they use public transport?', options: ['It was fast and cheap', 'They had no car', 'It was free'], answer: 0, explanation: '« because it was fast and cheap ».' },
      { q: 'When do they want to return?', options: ['In summer', 'In the {autumn}', 'Next weekend'], answer: 1, explanation: '« They want to go back in the autumn/fall » selon votre accent.' },
    ],
  },
  {
    id: 'st-travel-b2', topic: 'travel', level: 'B2', title: 'Un vol annulé',
    text: 'When the airline announced that our flight had been cancelled, most passengers rushed to the desk. Instead of joining the long {queue}, I called the company on my {mobile} and rebooked a seat for the following morning. I arrived a day late, but at least I avoided spending the night at the airport.',
    questions: [
      { q: 'What did the narrator do instead of waiting in line?', options: ['Went home', 'Phoned the airline', 'Took the train'], answer: 1, explanation: '« I called the company on my mobile ».' },
      { q: 'What was the consequence?', options: ['He arrived a day late', 'He lost his luggage', 'He got a refund'], answer: 0, explanation: '« I arrived a day late ».' },
    ],
  },
  {
    id: 'st-business-a2', topic: 'business', level: 'A2', title: 'Premier jour de travail',
    text: 'Today is Karim\'s first day at his new job. He meets his manager, Julia, at nine o\'clock. She shows him his desk and introduces him to the team. At lunchtime, everyone eats together in the canteen.',
    questions: [
      { q: 'Who shows Karim his desk?', options: ['Julia', 'The team', 'A client'], answer: 0, explanation: '« She shows him his desk » — « She » = Julia.' },
      { q: 'Where do they eat lunch?', options: ['At a restaurant', 'In the canteen', 'At their desks'], answer: 1, explanation: '« everyone eats together in the canteen ».' },
    ],
  },
  {
    id: 'st-business-b2', topic: 'business', level: 'B2', title: 'Une négociation délicate',
    text: 'The supplier insisted on raising his prices by ten per cent. Rather than accepting immediately, Elena proposed a longer contract in exchange for a smaller increase. After some hesitation, he agreed to five per cent, and both sides left the meeting satisfied.',
    questions: [
      { q: 'What did Elena offer?', options: ['A longer contract', 'An immediate payment', 'A new supplier'], answer: 0, explanation: '« proposed a longer contract in exchange for a smaller increase ».' },
      { q: 'What was the final increase?', options: ['Ten per cent', 'Five per cent', 'No increase'], answer: 1, explanation: '« he agreed to five per cent ».' },
    ],
  },
  {
    id: 'st-hobbies-a2', topic: 'hobbies', level: 'A2', title: 'Le club de lecture',
    text: 'Every second Tuesday, Paul goes to a book club at the local library. The group reads one novel a month and talks about it over tea and {biscuit}s. Paul says it is the best part of his week.',
    questions: [
      { q: 'How often does the club meet?', options: ['Every day', 'Every second Tuesday', 'Once a year'], answer: 1, explanation: '« Every second Tuesday ».' },
      { q: 'What does the group do?', options: ['Watch films', 'Read and discuss a novel', 'Play music'], answer: 1, explanation: '« reads one novel a month and talks about it ».' },
    ],
  },
  {
    id: 'st-hobbies-b2', topic: 'hobbies', level: 'B2', title: 'Le marathon',
    text: 'Sophie never thought she would run a marathon. She started jogging five minutes at a time to lose weight, and gradually the distances grew. Eighteen months later she crossed the finish line, exhausted but proud, wearing the same old {trainers} she had bought on a whim.',
    questions: [
      { q: 'Why did Sophie start running?', options: ['To lose weight', 'To win a race', 'To meet friends'], answer: 0, explanation: '« to lose weight ».' },
      { q: 'How long did it take her to reach the marathon?', options: ['Six months', 'Eighteen months', 'Three years'], answer: 1, explanation: '« Eighteen months later ».' },
    ],
  },
  {
    id: 'st-news-a2', topic: 'news', level: 'A2', title: 'Nouvelle ligne de bus',
    text: 'The city council has opened a new bus line between the airport and the town {centre}. The journey takes thirty minutes and a ticket costs three pounds or dollars. Many people say that the new line is cheaper than a taxi.',
    questions: [
      { q: 'How long is the journey?', options: ['Ten minutes', 'Thirty minutes', 'One hour'], answer: 1, explanation: '« The journey takes thirty minutes ».' },
      { q: 'What do many people say?', options: ['It is too slow', 'It is cheaper than a taxi', 'It is dangerous'], answer: 1, explanation: '« cheaper than a taxi ».' },
    ],
  },
  {
    id: 'st-news-b2', topic: 'news', level: 'B2', title: 'Travail à distance',
    text: 'A recent survey suggests that remote working has become the norm for nearly a third of office employees. While many welcome the flexibility, managers worry that team spirit is suffering. Experts recommend that companies find a balance by setting regular in-person days.',
    questions: [
      { q: 'What worries managers?', options: ['Higher costs', 'Declining team spirit', 'Lower salaries'], answer: 1, explanation: '« managers worry that team spirit is suffering ».' },
      { q: 'What do experts recommend?', options: ['Ending remote work', 'Regular in-person days', 'Longer holidays'], answer: 1, explanation: '« setting regular in-person days ».' },
    ],
  },
];

/** Sujets d'écriture hors ligne (utilisables sans IA). */
export const WRITING_PROMPTS = {
  daily: ['Describe your typical morning in five sentences.', 'What did you eat yesterday? Write a short diary entry.', 'Describe your home to a new neighbour.'],
  travel: ['Write a postcard from a place you have visited.', 'You lost your luggage at the airport. Write a short message to the airline.', 'Plan a three-day trip to a city you would like to visit.'],
  business: ['Write a short email asking a colleague to reschedule a meeting.', 'Introduce yourself in three sentences for a job interview.', 'Summarise a recent project you worked on.'],
  hobbies: ['Explain a hobby you enjoy to someone who has never tried it.', 'Recommend a film or a book and say why.', 'Describe your perfect weekend.'],
  news: ['Do you think social media is good for society? Give two arguments.', 'Write your opinion about remote working.', 'Summarise a piece of news you read this week.'],
};
