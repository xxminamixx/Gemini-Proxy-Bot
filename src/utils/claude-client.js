const { GoogleGenerativeAI } = require('@google/generative-ai');

// Per-user conversation histories (in-memory)
const histories = new Map();

function getHistory(userId) {
  if (!histories.has(userId)) histories.set(userId, []);
  return histories.get(userId);
}

function clearHistory(userId) {
  histories.delete(userId);
}

async function chat(apiKey, userId, userMessage) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });

  const history = getHistory(userId);

  // Build full contents array: previous history + current user message
  const contents = [
    ...history,
    { role: 'user', parts: [{ text: userMessage }] },
  ];

  const result = await model.generateContent({ contents });
  const responseText = result.response.text();

  // Save this exchange to history
  history.push({ role: 'user', parts: [{ text: userMessage }] });
  history.push({ role: 'model', parts: [{ text: responseText }] });

  // Keep last 40 entries (20 exchanges)
  if (history.length > 40) history.splice(0, history.length - 40);

  return responseText;
}

module.exports = { chat, clearHistory };
