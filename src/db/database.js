const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const DB_FILE = path.join(DATA_DIR, 'keys.json');

function load() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ servers: {}, users: {} }));
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function save(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

module.exports = {
  setServerKey(guildId, apiKey, userId) {
    const data = load();
    data.servers[guildId] = { apiKey, setBy: userId, setAt: Date.now() };
    save(data);
  },

  getServerKey(guildId) {
    return load().servers[guildId]?.apiKey ?? null;
  },

  setUserKey(userId, apiKey) {
    const data = load();
    data.users[userId] = { apiKey, setAt: Date.now() };
    save(data);
  },

  getUserKey(userId) {
    return load().users[userId]?.apiKey ?? null;
  },

  deleteUserKey(userId) {
    const data = load();
    delete data.users[userId];
    save(data);
  },

  deleteServerKey(guildId) {
    const data = load();
    delete data.servers[guildId];
    save(data);
  },
};
