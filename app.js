const LANGUAGES = {
  en: {
    name: "English",
    code: "en-US",
    systemPrompt: "You are a kind, encouraging language tutor. The user is practicing English. Correct their mistakes gently, explain the grammar rules briefly in French, and provide a natural native version."
  }
};

let currentLang = 'en';

const state = {
  apiKey: localStorage.getItem('linguacoach_key') || '',
  model: localStorage.getItem('linguacoach_model') || 'gemini-2.5-flash'
};

document.getElementById('apiKeyInput').value = state.apiKey;
document.getElementById('modelSelect').value = state.model;

document.querySelectorAll('nav button').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    button.classList.add('active');
    document.getElementById(button.dataset.target).classList.add('active');
  });
});

document.getElementById('globalLangSelect').addEventListener('change', (e) => {
  currentLang = e.target.value;
});

document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
  const key = document.getElementById('apiKeyInput').value.trim();
  const model = document.getElementById('modelSelect').value;
  const status = document.getElementById('settingsStatus');

  if (!key) {
    status.style.color = 'red';
    status.textContent = "Veuillez entrer une clé API valide.";
    return;
  }

  status.style.color = 'var(--text-muted)';
  status.textContent = "Test de la clé...";

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: "Say 'OK'" }] }] })
    });

    if (res.ok) {
      state.apiKey = key;
      state.model = model;
      localStorage.setItem('linguacoach_key', key);
      localStorage.setItem('linguacoach_model', model);
      status.style.color = 'green';
      status.textContent = "Clé validée et enregistrée avec succès !";
    } else {
      throw new Error("Erreur de clé API");
    }
  } catch (err) {
    status.style.color = 'red';
    status.textContent = "Échec de la validation. Vérifiez votre clé.";
  }
});

async function callGemini(promptText) {
  if (!state.apiKey) {
    return "⚠️ Veuillez configurer votre clé API Gemini dans l'onglet Réglages pour utiliser l'IA.";
  }

  const langConfig = LANGUAGES[currentLang];
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${state.model}:generateContent?key=${state.apiKey}`;

  const payload = {
    contents: [
      { role: "user", parts: [{ text: langConfig.systemPrompt + "\n\nUser input: " + promptText }] }
    ]
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "Erreur de réponse de l'IA.";
  } catch (e) {
    return "Erreur réseau lors de la communication avec Gemini.";
  }
}

const chatHistory = document.getElementById('chatHistory');
const userInput = document.getElementById('userInput');

document.getElementById('sendBtn').addEventListener('click', async () => {
  const text = userInput.value.trim();
  if (!text) return;

  appendChatBubble(text, 'user');
  userInput.value = '';

  const loadingId = appendChatBubble("Analyse en cours...", 'ai');
  const aiResponse = await callGemini(text);
  
  document.getElementById(loadingId).remove();
  appendChatBubble(aiResponse, 'ai');
});

function appendChatBubble(text, sender) {
  const div = document.createElement('div');
  div.className = `message ${sender}`;
  div.id = 'msg-' + Math.random().toString(36).substring(2);
  div.textContent = text;
  chatHistory.appendChild(div);
  chatHistory.scrollTop = chatHistory.scrollHeight;
  return div.id;
}

let currentListenPhrase = "";
document.getElementById('genListenBtn').addEventListener('click', async () => {
  const prompt = "Generate a short, natural sentence in English for a language learner to practice listening. Give ONLY the sentence, no quotes, no translation.";
  currentListenPhrase = await callGemini(prompt);
  
  document.getElementById('listenPromptText').textContent = "Phrase générée ! Écoutez-la attentivement.";
  document.getElementById('speakAudioBtn').style.display = 'block';
  document.getElementById('listenAnswer').style.display = 'block';
  document.getElementById('checkListenBtn').style.display = 'block';
  document.getElementById('listenFeedback').textContent = "";
});

document.getElementById('speakAudioBtn').addEventListener('click', () => {
  if (!currentListenPhrase) return;
  const utterance = new SpeechSynthesisUtterance(currentListenPhrase);
  utterance.lang = LANGUAGES[currentLang].code;
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
});

document.getElementById('checkListenBtn').addEventListener('click', () => {
  const userAns = document.getElementById('listenAnswer').value.trim();
  const feedback = document.getElementById('listenFeedback');
  
  if (userAns.toLowerCase() === currentListenPhrase.toLowerCase()) {
    feedback.style.color = 'green';
    feedback.textContent = "🎉 Excellent ! C'est parfaitement exact.";
  } else {
    feedback.style.color = 'red';
    feedback.textContent = `❌ Presque ! La phrase exacte était : "${currentListenPhrase}"`;
  }
});

const startMicBtn = document.getElementById('startMicBtn');
const sttResult = document.getElementById('sttResult');
const sttFeedback = document.getElementById('sttFeedback');

startMicBtn.addEventListener('click', () => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("La reconnaissance vocale n'est pas supportée par votre navigateur (essayez Chrome ou Safari).");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = LANGUAGES[currentLang].code;
  recognition.interimResults = false;

  startMicBtn.textContent = "Listening...";
  startMicBtn.style.backgroundColor = "#dc2626";

  recognition.onresult = async (event) => {
    const spokenText = event.results[0][0].transcript;
    sttResult.textContent = `Vous avez dit : "${spokenText}"`;
    
    sttFeedback.textContent = "Analyse de la prononciation par l'IA...";
    const evaluation = await callGemini(`Evaluate the pronunciation and accuracy of this spoken sentence by a learner: "${spokenText}". Give concise, encouraging feedback.`);
    sttFeedback.textContent = evaluation;
  };

  recognition.onerror = () => {
    sttFeedback.textContent = "Erreur de capture audio. Réessayez.";
  };

  recognition.onend = () => {
    startMicBtn.textContent = "🎤 Parler";
    startMicBtn.style.backgroundColor = "var(--primary)";
  };

  recognition.start();
});

document.getElementById('exportBtn').addEventListener('click', () => {
  const data = JSON.stringify({ key: state.apiKey, model: state.model }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'linguacoach-backup.json';
  a.click();
});

document.getElementById('importBtn').addEventListener('click', () => {
  document.getElementById('importFile').click();
});

document.getElementById('importFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const parsed = JSON.parse(event.target.result);
      if (parsed.key) {
        state.apiKey = parsed.key;
        state.model = parsed.model || 'gemini-2.5-flash';
        localStorage.setItem('linguacoach_key', state.apiKey);
        localStorage.setItem('linguacoach_model', state.model);
        document.getElementById('apiKeyInput').value = state.apiKey;
        document.getElementById('modelSelect').value = state.model;
        alert('Réglages restaurés avec succès !');
      }
    } catch (err) {
      alert('Fichier de sauvegarde invalide.');
    }
  };
  reader.readAsText(file);
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
});