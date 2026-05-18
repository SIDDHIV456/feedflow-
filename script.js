// Articles Database
const articles = [
  { id:1, topic:'sports', title:'IPL Finals 2024' },
  { id:2, topic:'tech', title:'New AI Robot Breakthrough' },
  { id:3, topic:'movies', title:'Marvel Movie Release' },
  { id:4, topic:'sports', title:'Football World Cup' },
  { id:5, topic:'tech', title:'Advanced Chatbot Update' },
  { id:6, topic:'finance', title:'Stock Market Analysis' },
  { id:7, topic:'sports', title:'NBA Championship' },
  { id:8, topic:'tech', title:'Quantum Computing Milestone' },
  { id:9, topic:'movies', title:'Oscar Winners 2024' },
  { id:10, topic:'finance', title:'Cryptocurrency Trends' }
];

// User Preferences
const DEFAULT_USERS = {
  U1: ['sports'],
  U2: ['tech'],
  U3: ['movies'],
  U4: ['finance']
};

const USER_META = {
  U1: { name: 'Alex' },
  U2: { name: 'Sam' },
  U3: { name: 'Jordan' },
  U4: { name: 'Riley' }
};

const VALID_TOPICS = ['sports', 'tech', 'movies', 'finance'];

const TOPIC_KEYWORDS = {
  sports: ['sports', 'sport', 'cricket', 'ipl', 'football', 'nba', 'basketball', 'soccer', 'athletics'],
  tech: ['tech', 'technology', 'ai', 'robot', 'quantum', 'computer', 'software', 'chatbot', 'coding', 'gadget'],
  movies: ['movies', 'movie', 'film', 'marvel', 'oscar', 'cinema', 'hollywood', 'entertainment', 'series'],
  finance: ['finance', 'stock', 'crypto', 'cryptocurrency', 'market', 'investment', 'money', 'trading', 'economy']
};

let users = JSON.parse(JSON.stringify(DEFAULT_USERS));

let userRequestCounts = { U1: 0, U2: 0, U3: 0, U4: 0 };
let articlesServed = 0;
let chatHistory = [];

const STORAGE_KEY = 'feedflow_state';
const DEFAULT_AUTO_SEQUENCE = [
  'U1', 'U2', 'U3',
  'U4',
  'U1',
  'U1',
  'U3',
  'U2', 'U2',
  'U4', 'U3', 'U1', 'U4'
];

// Topic Index (Hash Table)
const topicIndex = {};

articles.forEach(article => {
  if(!topicIndex[article.topic]){
    topicIndex[article.topic] = [];
  }
  topicIndex[article.topic].push(article);
});

// Show Topic Index
const topicDiv = document.getElementById('topicIndex');

for(let topic in topicIndex){
  const div = document.createElement('div');
  div.className = 'topic-item';
  div.innerHTML = `
    <h4>${topic.charAt(0).toUpperCase() + topic.slice(1)}</h4>
    <div class="articles">${topicIndex[topic].map(a => a.title).join(', ')}</div>
  `;
  topicDiv.appendChild(div);
}

// LRU Cache
let CACHE_SIZE = 3;
let cache = [];
let lastUser = null;
let lastFeed = [];

// Statistics
let hits = 0;
let misses = 0;

// Automation
let autoIntervalId = null;
let autoStepIndex = 0;
let autoRunning = false;
let activeAutoSequence = [];

// ——— localStorage ———

function persistState(){
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      hits,
      misses,
      cacheSize: CACHE_SIZE,
      autoSpeed: document.getElementById('autoSpeed')?.value || '1500',
      customSequence: document.getElementById('customSequence')?.value || '',
      cache,
      lastUser,
      lastFeed,
      users,
      userRequestCounts,
      articlesServed,
      chatHistory
    }));
  } catch (e) {
    /* storage full or disabled */
  }
}

function loadState(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return;

    const data = JSON.parse(raw);
    if(typeof data.hits === 'number') hits = data.hits;
    if(typeof data.misses === 'number') misses = data.misses;
    if(data.cache && Array.isArray(data.cache)) cache = data.cache;
    if(data.lastUser) lastUser = data.lastUser;
    if(data.lastFeed && Array.isArray(data.lastFeed)) lastFeed = data.lastFeed;

    if(data.cacheSize){
      setCacheSize(data.cacheSize, { silent: true, skipPersist: true });
    }

    const speedSelect = document.getElementById('autoSpeed');
    if(speedSelect && data.autoSpeed) speedSelect.value = data.autoSpeed;

    const seqInput = document.getElementById('customSequence');
    if(seqInput && data.customSequence) seqInput.value = data.customSequence;

    if(data.users && typeof data.users === 'object'){
      users = data.users;
      VALID_TOPICS.forEach(t => {
        Object.keys(users).forEach(u => {
          if(!Array.isArray(users[u])) users[u] = [...DEFAULT_USERS[u]];
          users[u] = users[u].filter(topic => VALID_TOPICS.includes(topic));
          if(users[u].length === 0) users[u] = [...DEFAULT_USERS[u]];
        });
      });
    }

    if(data.userRequestCounts) userRequestCounts = { ...userRequestCounts, ...data.userRequestCounts };
    if(typeof data.articlesServed === 'number') articlesServed = data.articlesServed;
    if(data.chatHistory && Array.isArray(data.chatHistory)) chatHistory = data.chatHistory;
  } catch (e) {
    /* corrupt storage */
  }
}

// ——— Cache size ———

function updateCacheSizeLabel(){
  const label = document.getElementById('cacheSizeLabel');
  if(label) label.textContent = `${CACHE_SIZE} frame${CACHE_SIZE === 1 ? '' : 's'}`;
}

function setCacheSize(size, options = {}){
  const { silent = false, skipPersist = false } = options;
  const newSize = Math.max(2, Math.min(6, parseInt(size, 10) || 3));
  CACHE_SIZE = newSize;

  const select = document.getElementById('cacheSizeSelect');
  if(select) select.value = String(CACHE_SIZE);
  updateCacheSizeLabel();

  while(cache.length > CACHE_SIZE){
    const removed = cache.shift();
    if(!silent){
      addLog(`Cache resized — LRU evicted ${removed.user}`, 'remove');
    }
  }

  if(!skipPersist) persistState();
  renderCacheFrames();
  updateStatsDisplay();
}

function onCacheSizeChange(){
  if(autoRunning) return;
  setCacheSize(document.getElementById('cacheSizeSelect').value);
  addLog(`Cache size set to ${CACHE_SIZE} frames`, 'hit');
}

// ——— Custom automation sequence ———

function parseAutoSequence(str){
  const raw = (str || '').trim();
  if(!raw) return [...DEFAULT_AUTO_SEQUENCE];

  const parts = raw.split(/[,;\s]+/).filter(Boolean);
  const valid = parts.filter(u => /^U[1-4]$/i.test(u)).map(u => u.toUpperCase());

  if(valid.length === 0) return [...DEFAULT_AUTO_SEQUENCE];
  return valid;
}

function getCustomSequenceInput(){
  return document.getElementById('customSequence')?.value || '';
}

function applyCustomSequence(){
  const parsed = parseAutoSequence(getCustomSequenceInput());
  const input = document.getElementById('customSequence');
  const usingDefault = !getCustomSequenceInput().trim();

  if(usingDefault){
    setAutoStatus(`Using default demo sequence (${parsed.length} steps)`);
    addLog(`Automation sequence: default (${parsed.length} steps)`, 'hit');
  } else {
    const normalized = parsed.join(',');
    if(input) input.value = normalized;
    setAutoStatus(`Custom sequence applied: ${parsed.length} steps`);
    addLog(`Automation sequence updated: ${normalized}`, 'hit');
  }

  persistState();
  return parsed;
}

function onCustomSequenceChange(){
  persistState();
}

// ——— Reset ———

function resetSession(){
  stopAutomation({ silent: true });

  cache = [];
  hits = 0;
  misses = 0;
  lastUser = null;
  lastFeed = [];
  users = JSON.parse(JSON.stringify(DEFAULT_USERS));
  userRequestCounts = { U1: 0, U2: 0, U3: 0, U4: 0 };
  articlesServed = 0;

  const statusDiv = document.getElementById('cacheStatus');
  if(statusDiv){
    statusDiv.style.display = 'none';
    statusDiv.innerHTML = '';
  }

  const feedDisplay = document.getElementById('feedDisplay');
  if(feedDisplay){
    feedDisplay.innerHTML = '<p style="color:#888; text-align:center; padding:20px;">Session reset. Click a user request or start automation.</p>';
  }

  const logs = document.getElementById('logs');
  if(logs){
    logs.innerHTML = '<div class="log-item" style="color:#888;">Session reset. Waiting for requests...</div>';
  }

  highlightActiveUser(null);
  renderCacheFrames();
  renderUserPreferences();
  updateStatsDisplay();
  setAutoStatus('Automation idle — enter a custom sequence or use the default demo');
  persistState();
  addLog('Session reset — stats, cache, preferences, and logs cleared', 'remove');
}

// ——— Request Feed ———

function requestFeed(user){
  if(!users[user]) return;

  userRequestCounts[user] = (userRequestCounts[user] || 0) + 1;

  let found = cache.find(item => item.user === user);
  let feed = [];

  if(found){
    hits++;
    feed = found.feed;
    cache = cache.filter(item => item.user !== user);
    cache.push(found);
    addLog(`Request ${user} → CACHE HIT`, 'hit');
    showCacheStatus('HIT', user);
  } else {
    misses++;
    users[user].forEach(topic => {
      if(topicIndex[topic]){
        feed = feed.concat(topicIndex[topic]);
      }
    });

    if(cache.length >= CACHE_SIZE){
      const removed = cache.shift();
      addLog(`LRU Removed ${removed.user}`, 'remove');
    }

    cache.push({
      user: user,
      feed: feed,
      timestamp: new Date().toLocaleTimeString()
    });

    addLog(`Request ${user} → CACHE MISS`, 'miss');
    showCacheStatus('MISS', user);
  }

  lastUser = user;
  lastFeed = feed;
  articlesServed += feed.length;
  updateUI(feed, user);
  persistState();
}

function showCacheStatus(status, user){
  const statusDiv = document.getElementById('cacheStatus');
  statusDiv.style.display = 'block';
  statusDiv.className = 'cache-status ' + (status === 'HIT' ? 'cache-hit' : 'cache-miss');
  statusDiv.innerHTML = `Request ${user} → CACHE ${status}`;
}

function renderCacheFrames(){
  const cacheDisplay = document.getElementById('cacheDisplay');
  if(!cacheDisplay) return;

  cacheDisplay.innerHTML = '';

  for(let i = 0; i < CACHE_SIZE; i++){
    const frame = document.createElement('div');
    if(cache[i]){
      frame.className = 'cache-frame';
      frame.innerHTML = `
        <h3>${cache[i].user}</h3>
        <div class="articles">${cache[i].feed.slice(0, 2).map(a => a.title.substring(0, 20) + '...').join(', ')}</div>
        <div class="timestamp">${cache[i].timestamp || 'Just now'}</div>
      `;
    } else {
      frame.className = 'cache-frame empty';
      frame.innerHTML = `
        <h3>Empty</h3>
        <p class="articles">No data</p>
      `;
    }
    cacheDisplay.appendChild(frame);
  }
}

function updateStatsDisplay(){
  const total = hits + misses;
  const ratio = total === 0 ? 0 : ((hits / total) * 100).toFixed(1);
  const fillPct = CACHE_SIZE === 0 ? 0 : Math.round((cache.length / CACHE_SIZE) * 100);

  let mostActive = '—';
  let maxReq = 0;
  Object.keys(userRequestCounts).forEach(u => {
    if(userRequestCounts[u] > maxReq){
      maxReq = userRequestCounts[u];
      mostActive = u;
    }
  });
  if(maxReq === 0) mostActive = '—';

  const allTopics = new Set();
  Object.values(users).forEach(topics => topics.forEach(t => allTopics.add(t)));

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if(el) el.innerText = text;
  };

  setText('total', total);
  setText('hits', hits);
  setText('misses', misses);
  setText('ratio', ratio + '%');
  setText('cacheFill', fillPct + '%');
  setText('articlesServed', articlesServed);
  setText('mostActiveUser', mostActive);
  setText('uniqueTopics', allTopics.size);

  renderUserPreferences();
}

function renderUserPreferences(){
  const container = document.getElementById('userPrefsList');
  if(!container) return;

  container.innerHTML = '';

  Object.keys(users).forEach(userId => {
    const topics = users[userId] || [];
    const meta = USER_META[userId];
    const reqCount = userRequestCounts[userId] || 0;

    const row = document.createElement('div');
    row.className = 'user-pref-row';

    const chips = topics.length
      ? topics.map(t => `<span class="topic-chip ${t}">${t}</span>`).join('')
      : '<span class="topic-chip empty">none</span>';

    row.innerHTML = `
      <span class="user-id">${userId}</span>
      <span class="user-name">${meta ? meta.name : ''}</span>
      <span class="pref-chips">${chips}</span>
      <span class="request-count">${reqCount} request${reqCount === 1 ? '' : 's'}</span>
    `;
    container.appendChild(row);
  });
}

function invalidateCacheForUser(user){
  const before = cache.length;
  cache = cache.filter(item => item.user !== user);
  if(cache.length < before){
    addLog(`Cache invalidated for ${user} — preferences changed`, 'remove');
    renderCacheFrames();
  }
}

function setUserPreferences(user, topics, mode = 'replace'){
  if(!users[user]) return false;

  let next = mode === 'add'
    ? [...new Set([...(users[user] || []), ...topics])]
    : [...topics];

  next = next.filter(t => VALID_TOPICS.includes(t));
  if(next.length === 0) return false;

  users[user] = next;
  invalidateCacheForUser(user);
  renderUserPreferences();
  updateStatsDisplay();
  persistState();
  return true;
}

// ——— AI Interest Assistant ———

function appendChatMessage(text, role){
  const entry = { role, text, time: new Date().toLocaleTimeString() };
  chatHistory.push(entry);
  if(chatHistory.length > 50) chatHistory = chatHistory.slice(-50);
  renderChatMessages();
  persistState();
}

function renderChatMessages(){
  const box = document.getElementById('chatMessages');
  if(!box) return;

  box.innerHTML = '';
  chatHistory.forEach(msg => {
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble ' + (msg.role === 'user' ? 'user' : 'bot');
    bubble.innerHTML = `
      ${escapeHtml(msg.text)}
      <span class="chat-meta">${msg.time}</span>
    `;
    box.appendChild(bubble);
  });
  box.scrollTop = box.scrollHeight;
}

function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function detectUserFromText(text){
  const match = text.match(/\bU[1-4]\b/i);
  return match ? match[0].toUpperCase() : null;
}

function detectTopicsFromText(text){
  const lower = text.toLowerCase();
  const found = new Set();

  VALID_TOPICS.forEach(topic => {
    TOPIC_KEYWORDS[topic].forEach(kw => {
      const re = new RegExp('\\b' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
      if(re.test(lower)) found.add(topic);
    });
  });

  return [...found];
}

function isReplaceOnlyIntent(text){
  return /\b(only|just|exclusively)\b/i.test(text);
}

function isAddIntent(text){
  return /\b(add|also|plus|include|love|like|enjoy|interested|into|want|prefer)\b/i.test(text);
}

function isRemoveIntent(text){
  return /\b(remove|drop|unsubscribe|don'?t like|dislike|hate|no more|clear|reset)\b/i.test(text);
}

function isShowPrefsIntent(text){
  return /\b(show|what are|list|display|current)\b.*\b(pref|interest|topic)/i.test(text)
    || /\bmy interests\b/i.test(text);
}

function formatTopicsList(topics){
  if(!topics.length) return 'none';
  return topics.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(', ');
}

function processChatMessage(rawText){
  const text = rawText.trim();
  if(!text) return;

  const select = document.getElementById('chatUserSelect');
  let user = detectUserFromText(text) || (select ? select.value : 'U2');

  if(select && detectUserFromText(text)) select.value = user;

  appendChatMessage(text, 'user');

  const lower = text.toLowerCase();

  if(/\bhelp\b/i.test(lower) && text.length < 80){
    appendChatMessage(
      'I can update interests for U1–U4. Examples:\n' +
      '• "U1 loves cricket and the NBA"\n' +
      '• "Add tech and AI for U2"\n' +
      '• "Only finance for U4"\n' +
      '• "Remove movies from U3"\n' +
      '• "Show my interests"',
      'bot'
    );
    return;
  }

  if(isShowPrefsIntent(text)){
    const lines = Object.keys(users).map(u => {
      const name = USER_META[u]?.name || u;
      return `${u} (${name}): ${formatTopicsList(users[u])}`;
    });
    appendChatMessage('Current preferences:\n' + lines.join('\n'), 'bot');
    return;
  }

  const detected = detectTopicsFromText(text);

  if(isRemoveIntent(text) && detected.length === 0 && /\b(all|everything|interests)\b/i.test(lower)){
    users[user] = [...DEFAULT_USERS[user]];
    invalidateCacheForUser(user);
    renderUserPreferences();
    updateStatsDisplay();
    persistState();
    addLog(`Chat reset ${user} preferences to default`, 'hit');
    appendChatMessage(
      `Reset ${user} (${USER_META[user].name}) to default: ${formatTopicsList(users[user])}.`,
      'bot'
    );
    return;
  }

  if(isRemoveIntent(text) && detected.length > 0){
    users[user] = (users[user] || []).filter(t => !detected.includes(t));
    if(users[user].length === 0) users[user] = [...DEFAULT_USERS[user]];
    invalidateCacheForUser(user);
    renderUserPreferences();
    updateStatsDisplay();
    persistState();
    addLog(`Chat removed topics from ${user}: ${detected.join(', ')}`, 'remove');
    appendChatMessage(
      `Removed ${formatTopicsList(detected)} from ${user}. Now following: ${formatTopicsList(users[user])}.`,
      'bot'
    );
    return;
  }

  if(detected.length === 0){
    appendChatMessage(
      "I couldn't spot a topic (sports, tech, movies, finance). Try mentioning things like cricket, AI, Marvel, or stocks.",
      'bot'
    );
    return;
  }

  let mode = 'replace';
  if(isReplaceOnlyIntent(text)) mode = 'replace';
  else if(isAddIntent(text)) mode = 'add';

  let nextTopics;
  if(mode === 'add'){
    nextTopics = [...new Set([...(users[user] || []), ...detected])];
  } else {
    nextTopics = detected;
  }

  users[user] = nextTopics;
  invalidateCacheForUser(user);
  renderUserPreferences();
  updateStatsDisplay();
  persistState();

  const name = USER_META[user]?.name || user;
  addLog(`Chat updated ${user} preferences → ${nextTopics.join(', ')}`, 'hit');
  appendChatMessage(
    `Got it! ${user} (${name}) now follows: ${formatTopicsList(nextTopics)}. ` +
    `Request ${user}'s feed to see personalized articles.`,
    'bot'
  );
}

function submitChat(e){
  e.preventDefault();
  const input = document.getElementById('chatInput');
  if(!input) return;

  const text = input.value.trim();
  if(!text) return;

  processChatMessage(text);
  input.value = '';
  input.focus();
}

function clearChat(){
  chatHistory = [];
  renderChatMessages();
  persistState();
  appendChatMessage('Chat cleared. Tell me what topics you enjoy!', 'bot');
}

function initChatbot(){
  const form = document.getElementById('chatForm');
  if(form) form.addEventListener('submit', submitChat);

  if(chatHistory.length === 0){
    appendChatMessage(
      "Hi! I'm your FeedFlow assistant. Pick a profile above, then describe your interests — I'll tune that user's feed topics.",
      'bot'
    );
  } else {
    renderChatMessages();
  }
}

function updateUI(currentFeed, currentUser){
  renderCacheFrames();

  const feedDisplay = document.getElementById('feedDisplay');
  if(currentFeed && currentFeed.length > 0 && currentUser){
    feedDisplay.innerHTML = `
      <h3 style="margin-bottom:15px; color:#667eea;">Feed for ${currentUser}</h3>
      ${currentFeed.map(article => `
        <div class="feed-item">
          <h4>${article.title}</h4>
          <span class="topic">${article.topic}</span>
        </div>
      `).join('')}
    `;
  }

  updateStatsDisplay();
}

// ——— Logs ———

function addLog(message, type){
  const logs = document.getElementById('logs');
  const div = document.createElement('div');
  div.className = 'log-item ' + type;
  const timestamp = new Date().toLocaleTimeString();
  div.innerText = `[${timestamp}] ${message}`;
  logs.prepend(div);
}

// ——— Automation ———

function getAutoDelay(){
  const select = document.getElementById('autoSpeed');
  return select ? parseInt(select.value, 10) : 1500;
}

function setAutoStatus(text){
  const el = document.getElementById('autoStatus');
  if(el) el.textContent = text;
}

function setAutomationControls(running){
  autoRunning = running;
  const startBtn = document.getElementById('autoStartBtn');
  const stopBtn = document.getElementById('autoStopBtn');
  const speedSelect = document.getElementById('autoSpeed');
  const cacheSelect = document.getElementById('cacheSizeSelect');
  const seqInput = document.getElementById('customSequence');

  if(startBtn) startBtn.disabled = running;
  if(stopBtn) stopBtn.disabled = !running;
  if(speedSelect) speedSelect.disabled = running;
  if(cacheSelect) cacheSelect.disabled = running;
  if(seqInput) seqInput.disabled = running;

  document.querySelectorAll('.user-btn').forEach(btn => {
    btn.disabled = running;
  });
}

function highlightActiveUser(user){
  document.querySelectorAll('.user-btn').forEach(btn => {
    btn.classList.toggle('active', user && btn.dataset.user === user);
  });
}

function runAutomationStep(){
  if(!activeAutoSequence.length) return;

  const user = activeAutoSequence[autoStepIndex];
  highlightActiveUser(user);
  requestFeed(user);

  const stepNum = autoStepIndex + 1;
  const total = activeAutoSequence.length;
  setAutoStatus(`Automation running — step ${stepNum}/${total}: Request ${user}`);

  autoStepIndex = (autoStepIndex + 1) % activeAutoSequence.length;
  if(autoStepIndex === 0){
    addLog('Automation loop completed — restarting sequence', 'hit');
  }
}

function startAutomation(){
  if(autoRunning) return;

  activeAutoSequence = applyCustomSequence();
  autoStepIndex = 0;
  setAutomationControls(true);
  addLog(`Automation started (${activeAutoSequence.length} steps)`, 'hit');
  setAutoStatus('Automation starting…');
  runAutomationStep();
  autoIntervalId = setInterval(runAutomationStep, getAutoDelay());
  persistState();
}

function stopAutomation(options = {}){
  const { silent = false } = options;
  const wasRunning = autoRunning;

  if(autoIntervalId){
    clearInterval(autoIntervalId);
    autoIntervalId = null;
  }
  if(wasRunning && !silent){
    addLog('Automation stopped', 'remove');
  }
  setAutomationControls(false);
  highlightActiveUser(null);

  if(!silent){
    const seqLen = activeAutoSequence.length || DEFAULT_AUTO_SEQUENCE.length;
    setAutoStatus(`Automation idle — ${seqLen} steps in current sequence`);
  }
}

function onSpeedChange(){
  persistState();
  if(!autoRunning || !autoIntervalId) return;
  clearInterval(autoIntervalId);
  autoIntervalId = setInterval(runAutomationStep, getAutoDelay());
}

function toggleAutomation(){
  if(autoRunning) stopAutomation();
  else startAutomation();
}

// ——— Keyboard shortcuts ———

function isTypingTarget(el){
  if(!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function initKeyboardShortcuts(){
  document.addEventListener('keydown', (e) => {
    if(isTypingTarget(e.target)) return;

    const key = e.key;

    if(key >= '1' && key <= '4'){
      e.preventDefault();
      if(!autoRunning) requestFeed('U' + key);
      return;
    }

    if(key === ' '){
      e.preventDefault();
      toggleAutomation();
      return;
    }

    if(key === 'r' || key === 'R'){
      e.preventDefault();
      resetSession();
    }
  });
}

// ——— Init ———

document.addEventListener('DOMContentLoaded', () => {
  loadState();
  initKeyboardShortcuts();
  initChatbot();
  renderCacheFrames();
  renderUserPreferences();
  updateStatsDisplay();

  if(lastFeed.length && lastUser){
    updateUI(lastFeed, lastUser);
  } else {
    const feedDisplay = document.getElementById('feedDisplay');
    if(feedDisplay && !feedDisplay.querySelector('.feed-item')){
      feedDisplay.innerHTML = '<p style="color:#888; text-align:center; padding:20px;">No feed generated yet. Click a user request above.</p>';
    }
  }

  const total = hits + misses;
  if(total > 0){
    addLog(`Restored session from storage (${hits} hits, ${misses} misses)`, 'hit');
  }
});
