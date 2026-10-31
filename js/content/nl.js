/**
 * content/nl.js — Bibliothèque locale d'exercices de néerlandais (sans IA, hors ligne).
 * Mêmes exports et même format que content/en.js. Les mots marqués {clé} suivent la variante choisie :
 * nl-NL (Pays-Bas) ou nl-BE (Belgique, néerlandais standard — pas de dialecte).
 * Explications des questions en français.
 */

export const LEXICON = {
  mobile: { NL: 'mobiel', BE: 'gsm' },
  fries: { NL: 'friet', BE: 'frieten' },
  platform: { NL: 'spoor', BE: 'perron' },
  sandwich: { NL: 'broodje', BE: 'pistolet' },
};

export const PHRASES = [
  // Vie quotidienne
  { id: 'd1', topic: 'daily', level: 'A1', text: 'Ik sta om zeven uur op en drink een kop koffie.' },
  { id: 'd2', topic: 'daily', level: 'A2', text: 'Mijn appartement ligt op de derde verdieping, dus ik neem de lift.' },
  { id: 'd6', topic: 'daily', level: 'A2', text: 'Ik bestel een {sandwich} met {fries} bij de snackbar.' },
  { id: 'd3', topic: 'daily', level: 'B1', text: 'Meestal doe ik op zaterdagochtend boodschappen, want dan is het rustiger in de winkel.' },
  { id: 'd7', topic: 'daily', level: 'B1', text: 'Ik ben mijn {mobile} vergeten, dus ik kan je nu niet bellen.' },
  { id: 'd4', topic: 'daily', level: 'B2', text: 'Hoewel ik doodmoe was, lukte het me om voor het hele gezin te koken.' },
  { id: 'd5', topic: 'daily', level: 'C1', text: 'Had ik geweten dat het vuilnis zo vroeg werd opgehaald, dan had ik het de avond ervoor buitengezet.' },
  // Voyage
  { id: 't1', topic: 'travel', level: 'A1', text: 'Waar is het station, alstublieft?' },
  { id: 't2', topic: 'travel', level: 'A2', text: 'Ik wil graag een kamer voor twee nachten met uitzicht op zee.' },
  { id: 't6', topic: 'travel', level: 'A2', text: 'De trein naar Brussel vertrekt van {platform} drie.' },
  { id: 't3', topic: 'travel', level: 'B1', text: 'Pardon, kunt u me vertellen hoe ik naar het centrum kom?' },
  { id: 't4', topic: 'travel', level: 'B2', text: 'We moesten onze hele vakantie herplannen nadat de luchtvaartmaatschappij onze aansluitende vlucht had geannuleerd.' },
  { id: 't5', topic: 'travel', level: 'C1', text: 'Het programma was zo vol dat we nauwelijks tijd hadden om de bezienswaardigheden echt te waarderen.' },
  // Business
  { id: 'b1', topic: 'business', level: 'A1', text: 'De vergadering begint om negen uur.' },
  { id: 'b2', topic: 'business', level: 'A2', text: 'Kunt u mij het verslag per e-mail sturen, alstublieft?' },
  { id: 'b3', topic: 'business', level: 'B1', text: 'Ik wil graag een gesprek inplannen om de volgende stappen van het project te bespreken.' },
  { id: 'b4', topic: 'business', level: 'B2', text: 'Gezien de krappe deadline moeten we prioriteit geven aan de taken met de grootste impact.' },
  { id: 'b5', topic: 'business', level: 'C1', text: 'Ondanks de aanvankelijke tegenslagen leverde het team een oplossing die de verwachtingen van de klant overtrof.' },
  // Hobbies
  { id: 'h1', topic: 'hobbies', level: 'A1', text: 'Ik voetbal graag met mijn vrienden.' },
  { id: 'h2', topic: 'hobbies', level: 'A2', text: 'Mijn favoriete film gaat over een hond die door het hele land reist.' },
  { id: 'h3', topic: 'hobbies', level: 'B1', text: 'Ik leer al zes maanden gitaar spelen en ik oefen elke avond.' },
  { id: 'h4', topic: 'hobbies', level: 'B2', text: 'Wat ik het leukst vind aan wandelen, is het gevoel van vrijheid dat je op de top van een heuvel krijgt.' },
  { id: 'h5', topic: 'hobbies', level: 'C1', text: 'Ze begon op latere leeftijd met schilderen, en dat bleek een verrassend louterende bezigheid.' },
  // Actualités
  { id: 'n1', topic: 'news', level: 'A1', text: 'Het weer is vandaag erg slecht.' },
  { id: 'n2', topic: 'news', level: 'A2', text: 'De regering heeft een nieuw plan voor het openbaar vervoer aangekondigd.' },
  { id: 'n3', topic: 'news', level: 'B1', text: 'Veel mensen vinden dat sociale media de manier waarop we het nieuws volgen, hebben veranderd.' },
  { id: 'n4', topic: 'news', level: 'B2', text: 'Critici beweren dat het nieuwe beleid de kloof tussen arm en rijk zal vergroten.' },
  { id: 'n5', topic: 'news', level: 'C1', text: 'Het debat draait om de vraag of technologische vooruitgang strenger gereguleerd moet worden.' },
];

export const DIALOGUES = [
  {
    id: 'dl-daily', topic: 'daily', level: 'B1', title: 'Au supermarché',
    lines: [
      { speaker: 'A', text: 'Pardon, waar kan ik de koffie vinden?' },
      { speaker: 'B', text: 'Die staat in gang vijf, naast de thee.' },
      { speaker: 'A', text: 'Dank u. Is het druk bij de kassa vandaag?' },
      { speaker: 'B', text: 'Niet echt. Na vijf uur is het meestal drukker.' },
    ],
    questions: [
      { q: 'Waar staat de koffie?', options: ['In gang vijf', 'Naast de kassa', 'In gang drie'], answer: 0, explanation: 'B répond : « Die staat in gang vijf, naast de thee. »' },
      { q: 'Wanneer is het meestal drukker?', options: ['\'s Ochtends', 'Na vijf uur', 'Tijdens de lunch'], answer: 1, explanation: 'B précise : « Na vijf uur is het meestal drukker. »' },
    ],
  },
  {
    id: 'dl-travel', topic: 'travel', level: 'B1', title: 'À la réception de l\'hôtel',
    lines: [
      { speaker: 'A', text: 'Goedenavond. Ik heb een reservering op naam van Peeters.' },
      { speaker: 'B', text: 'Ja, een tweepersoonskamer voor drie nachten. Het ontbijt is van zeven tot tien uur.' },
      { speaker: 'A', text: 'Prima. Is er een lift? Ik heb twee zware koffers.' },
      { speaker: 'B', text: 'Natuurlijk, die is net achter u. Uw kamer is op de vierde verdieping.' },
    ],
    questions: [
      { q: 'Hoe lang blijft de gast?', options: ['Twee nachten', 'Drie nachten', 'Vier nachten'], answer: 1, explanation: 'La réceptionniste dit « voor drie nachten ».' },
      { q: 'Waarom vraagt de gast naar de lift?', options: ['De kamer is ver weg', 'Hij heeft zware koffers', 'Hij is moe'], answer: 1, explanation: 'Il dit : « Ik heb twee zware koffers. »' },
    ],
  },
  {
    id: 'dl-business', topic: 'business', level: 'B1', title: 'Planifier une réunion',
    lines: [
      { speaker: 'A', text: 'Hoi Sam, ben je donderdag vrij om het budget door te nemen?' },
      { speaker: 'B', text: 'Ik heb \'s ochtends een gesprek met een klant, maar \'s middags kan het wel.' },
      { speaker: 'A', text: 'Mooi. Zullen we om twee uur afspreken in de kleine vergaderzaal?' },
      { speaker: 'B', text: 'Prima. Ik neem de nieuwste cijfers mee.' },
    ],
    questions: [
      { q: 'Wat gaan ze bespreken?', options: ['Een klantgesprek', 'Het budget', 'Een nieuw kantoor'], answer: 1, explanation: '« het budget door te nemen » = passer le budget en revue.' },
      { q: 'Hoe laat is de vergadering?', options: ['Twee uur', 'Tien uur', 'Vier uur'], answer: 0, explanation: 'A propose « om twee uur » et B accepte.' },
    ],
  },
  {
    id: 'dl-hobbies', topic: 'hobbies', level: 'B1', title: 'Projet de week-end',
    lines: [
      { speaker: 'A', text: 'Zin om zaterdag naar de bioscoop te gaan?' },
      { speaker: 'B', text: 'Graag, maar ik heb mijn broer beloofd dat ik hem help verhuizen.' },
      { speaker: 'A', text: 'Geen probleem. Wat dacht je van zondagavond?' },
      { speaker: 'B', text: 'Zondag past perfect. Ik kijk even welke films er draaien.' },
    ],
    questions: [
      { q: 'Waarom kan B zaterdag niet?', options: ['B moet werken', 'B helpt de broer bij een verhuizing', 'B is ziek'], answer: 1, explanation: '« ik heb mijn broer beloofd dat ik hem help verhuizen ».' },
      { q: 'Wanneer spreken ze uiteindelijk af?', options: ['Zaterdag', 'Zondagavond', 'Vrijdag'], answer: 1, explanation: 'Ils conviennent de dimanche soir.' },
    ],
  },
  {
    id: 'dl-news', topic: 'news', level: 'B2', title: 'Discussion sur les réseaux sociaux',
    lines: [
      { speaker: 'A', text: 'Heb je dat artikel gelezen over tieners en sociale media?' },
      { speaker: 'B', text: 'Ja. Er staat dat minder schermtijd de concentratie verbetert, maar ik ben er niet helemaal van overtuigd.' },
      { speaker: 'A', text: 'Waarom niet? De studie leek me best grondig.' },
      { speaker: 'B', text: 'De steekproef was klein, dus ik zou voorzichtig zijn met stellige conclusies.' },
    ],
    questions: [
      { q: 'Wat beweert het artikel?', options: ['Sociale media zijn onschadelijk', 'Minder schermtijd verbetert de concentratie', 'Tieners lezen minder'], answer: 1, explanation: 'B résume : « minder schermtijd de concentratie verbetert ».' },
      { q: 'Waarom is B sceptisch?', options: ['De steekproef was klein', 'Het artikel was oud', 'De auteur was bevooroordeeld'], answer: 0, explanation: '« De steekproef was klein, dus ik zou voorzichtig zijn… »' },
    ],
  },
];

export const STORIES = [
  {
    id: 'st-daily-a2', topic: 'daily', level: 'A2', title: 'Un matin chargé',
    text: 'Anna staat om half zeven op. Ze maakt ontbijt voor haar twee kinderen en pakt hun lunch in. Daarna brengt ze hen met de bus naar school. Vervolgens loopt ze naar haar werk. Ze werkt in een kleine boekhandel vlakbij het centrum van de stad.',
    questions: [
      { q: 'Hoe brengt Anna de kinderen naar school?', options: ['Met de auto', 'Met de bus', 'Te voet'], answer: 1, explanation: 'Le texte dit : « Daarna brengt ze hen met de bus naar school. »' },
      { q: 'Waar werkt Anna?', options: ['In een boekhandel', 'In een school', 'In een bank'], answer: 0, explanation: '« Ze werkt in een kleine boekhandel. »' },
    ],
  },
  {
    id: 'st-daily-b2', topic: 'daily', level: 'B2', title: 'Un voisin bruyant',
    text: 'Tom werd al weken wakker gehouden door luide muziek uit het appartement boven hem. In plaats van boos te klagen schreef hij een vriendelijk briefje en stak het onder de deur. Tot zijn verrassing bood de buurman de volgende dag zijn excuses aan en gaf hem zelfs een bordje zelfgebakken koekjes.',
    questions: [
      { q: 'Hoe pakte Tom het probleem aan?', options: ['Hij belde de politie', 'Hij schreef een vriendelijk briefje', 'Hij verhuisde'], answer: 1, explanation: '« schreef hij een vriendelijk briefje en stak het onder de deur ».' },
      { q: 'Hoe reageerde de buurman?', options: ['Hij negeerde het', 'Hij werd boos', 'Hij bood zijn excuses aan'], answer: 2, explanation: '« bood de buurman de volgende dag zijn excuses aan ».' },
    ],
  },
  {
    id: 'st-travel-a2', topic: 'travel', level: 'A2', title: 'Un week-end à Bruxelles',
    text: 'Vorig weekend bezocht Maria Brussel met haar zus. Ze namen overal de metro omdat dat snel en goedkoop was. Op zondag wandelden ze langs het kanaal en aten ze wafels. Ze willen in het najaar terugkomen.',
    questions: [
      { q: 'Waarom namen ze de metro?', options: ['Het was snel en goedkoop', 'Ze hadden geen auto', 'Het was gratis'], answer: 0, explanation: '« omdat dat snel en goedkoop was ».' },
      { q: 'Wanneer willen ze terugkomen?', options: ['In de zomer', 'In het najaar', 'Volgend weekend'], answer: 1, explanation: '« Ze willen in het najaar terugkomen. »' },
    ],
  },
  {
    id: 'st-travel-b2', topic: 'travel', level: 'B2', title: 'Un vol annulé',
    text: 'Toen de luchtvaartmaatschappij aankondigde dat onze vlucht was geannuleerd, stormden de meeste passagiers naar de balie. In plaats van in de lange rij te gaan staan, belde ik het bedrijf met mijn {mobile} en boekte ik een plaats voor de volgende ochtend. Ik kwam een dag te laat aan, maar zo hoefde ik tenminste de nacht niet op de luchthaven door te brengen.',
    questions: [
      { q: 'Wat deed de verteller in plaats van in de rij te staan?', options: ['Hij ging naar huis', 'Hij belde de luchtvaartmaatschappij', 'Hij nam de trein'], answer: 1, explanation: '« belde ik het bedrijf met mijn mobiel / gsm ».' },
      { q: 'Wat was het gevolg?', options: ['Hij kwam een dag te laat aan', 'Hij verloor zijn bagage', 'Hij kreeg een terugbetaling'], answer: 0, explanation: '« Ik kwam een dag te laat aan ».' },
    ],
  },
  {
    id: 'st-business-a2', topic: 'business', level: 'A2', title: 'Premier jour de travail',
    text: 'Vandaag is Karims eerste werkdag. Hij ontmoet zijn manager, Julia, om negen uur. Ze toont hem zijn bureau en stelt hem voor aan het team. Tijdens de middagpauze eten ze allemaal samen in de kantine.',
    questions: [
      { q: 'Wie toont Karim zijn bureau?', options: ['Julia', 'Het team', 'Een klant'], answer: 0, explanation: '« Ze toont hem zijn bureau » — « Ze » = Julia.' },
      { q: 'Waar lunchen ze?', options: ['In een restaurant', 'In de kantine', 'Aan hun bureau'], answer: 1, explanation: '« eten ze allemaal samen in de kantine ».' },
    ],
  },
  {
    id: 'st-business-b2', topic: 'business', level: 'B2', title: 'Une négociation délicate',
    text: 'De leverancier stond erop zijn prijzen met tien procent te verhogen. In plaats van meteen akkoord te gaan, stelde Elena een langer contract voor in ruil voor een kleinere verhoging. Na enig aarzelen ging hij akkoord met vijf procent, en beide partijen verlieten de vergadering tevreden.',
    questions: [
      { q: 'Wat stelde Elena voor?', options: ['Een langer contract', 'Een directe betaling', 'Een nieuwe leverancier'], answer: 0, explanation: '« stelde Elena een langer contract voor in ruil voor een kleinere verhoging ».' },
      { q: 'Wat was de uiteindelijke verhoging?', options: ['Tien procent', 'Vijf procent', 'Geen verhoging'], answer: 1, explanation: '« ging hij akkoord met vijf procent ».' },
    ],
  },
  {
    id: 'st-hobbies-a2', topic: 'hobbies', level: 'A2', title: 'Le club de lecture',
    text: 'Elke tweede dinsdag gaat Paul naar een leesclub in de plaatselijke bibliotheek. De groep leest één roman per maand en praat erover onder het genot van thee en koekjes. Paul zegt dat het het beste deel van zijn week is.',
    questions: [
      { q: 'Hoe vaak komt de club samen?', options: ['Elke dag', 'Elke tweede dinsdag', 'Eén keer per jaar'], answer: 1, explanation: '« Elke tweede dinsdag ».' },
      { q: 'Wat doet de groep?', options: ['Films kijken', 'Een roman lezen en bespreken', 'Muziek maken'], answer: 1, explanation: '« leest één roman per maand en praat erover ».' },
    ],
  },
  {
    id: 'st-hobbies-b2', topic: 'hobbies', level: 'B2', title: 'Le marathon',
    text: 'Sophie had nooit gedacht dat ze een marathon zou lopen. Ze begon met vijf minuten per keer te joggen om af te vallen, en geleidelijk werden de afstanden groter. Achttien maanden later liep ze, uitgeput maar trots, over de finish, met dezelfde oude sportschoenen die ze impulsief had gekocht.',
    questions: [
      { q: 'Waarom begon Sophie te lopen?', options: ['Om af te vallen', 'Om een wedstrijd te winnen', 'Om vrienden te ontmoeten'], answer: 0, explanation: '« om af te vallen ».' },
      { q: 'Hoe lang duurde het voor ze de marathon liep?', options: ['Zes maanden', 'Achttien maanden', 'Drie jaar'], answer: 1, explanation: '« Achttien maanden later ».' },
    ],
  },
  {
    id: 'st-news-a2', topic: 'news', level: 'A2', title: 'Nouvelle ligne de bus',
    text: 'De gemeente heeft een nieuwe buslijn geopend tussen de luchthaven en het centrum van de stad. De reis duurt dertig minuten en een ticket kost drie euro. Veel mensen zeggen dat de nieuwe lijn goedkoper is dan een taxi.',
    questions: [
      { q: 'Hoe lang duurt de reis?', options: ['Tien minuten', 'Dertig minuten', 'Een uur'], answer: 1, explanation: '« De reis duurt dertig minuten ».' },
      { q: 'Wat zeggen veel mensen?', options: ['Het is te traag', 'Het is goedkoper dan een taxi', 'Het is gevaarlijk'], answer: 1, explanation: '« goedkoper is dan een taxi ».' },
    ],
  },
  {
    id: 'st-news-b2', topic: 'news', level: 'B2', title: 'Travail à distance',
    text: 'Uit een recente enquête blijkt dat thuiswerken voor bijna een derde van de kantoormedewerkers de norm is geworden. Hoewel velen de flexibiliteit waarderen, maken leidinggevenden zich zorgen dat de teamgeest eronder lijdt. Experts raden bedrijven aan een evenwicht te vinden door vaste dagen op kantoor in te voeren.',
    questions: [
      { q: 'Waar maken leidinggevenden zich zorgen over?', options: ['Hogere kosten', 'De teamgeest', 'Lagere salarissen'], answer: 1, explanation: '« maken leidinggevenden zich zorgen dat de teamgeest eronder lijdt ».' },
      { q: 'Wat raden experts aan?', options: ['Thuiswerken stopzetten', 'Vaste dagen op kantoor', 'Langere vakanties'], answer: 1, explanation: '« vaste dagen op kantoor in te voeren ».' },
    ],
  },
];

export const WRITING_PROMPTS = {
  daily: ['Beschrijf in vijf zinnen je typische ochtend.', 'Wat heb je gisteren gegeten? Schrijf een kort dagboekfragment.', 'Beschrijf je huis aan een nieuwe buur.'],
  travel: ['Schrijf een ansichtkaart vanuit een plaats die je hebt bezocht.', 'Je bagage is zoekgeraakt op de luchthaven. Schrijf een kort bericht aan de maatschappij.', 'Plan een driedaagse reis naar een stad die je graag zou bezoeken.'],
  business: ['Schrijf een korte e-mail om een collega te vragen een vergadering te verplaatsen.', 'Stel jezelf voor in drie zinnen voor een sollicitatiegesprek.', 'Vat een recent project samen waaraan je hebt gewerkt.'],
  hobbies: ['Leg een hobby die je leuk vindt uit aan iemand die het nog nooit heeft geprobeerd.', 'Raad een film of een boek aan en zeg waarom.', 'Beschrijf je perfecte weekend.'],
  news: ['Vind je dat sociale media goed zijn voor de samenleving? Geef twee argumenten.', 'Schrijf je mening over thuiswerken.', 'Vat een nieuwsbericht van deze week samen.'],
};
