const WEATHER_ICONS = {
  Thunderstorm: '⛈', Drizzle: '🌦', Rain: '🌧', Snow: '❄️',
  Mist: '🌫', Smoke: '🌫', Haze: '🌫', Dust: '🌫',
  Fog: '🌫', Sand: '🌫', Ash: '🌫', Squall: '🌫', Tornado: '🌪',
  Clear: '☀️', Clouds: '☁️',
};

function icon(main) { return WEATHER_ICONS[main] ?? '🌡'; }

function formatDate(date) {
  return date.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });
}

function buildBlock(label, date, tempMax, tempMin, description, humidity, wind) {
  return [
    `${icon(description.main ?? '')} **${label}**`,
    `━━━━━━━━━━━━━━━`,
    `📅 日付　：${formatDate(date)}`,
    `🌡 気温　：最高 ${Math.round(tempMax)}°C / 最低 ${Math.round(tempMin)}°C`,
    `🌂 天気　：${description.text}`,
    `💧 湿度　：${humidity}%`,
    `🌬 風　　：${wind} m/s`,
    `━━━━━━━━━━━━━━━`,
  ].join('\n');
}

/**
 * 天気を取得する
 * @param {string} city - 都市名（英語）
 * @param {number} day  - 0=今日, 1=明日, 2=明後日 ... 最大4
 */
async function fetchWeather(city, day = 0) {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) throw new Error('OPENWEATHER_API_KEY が設定されていません。');

  // 今日(day=0)は current API、それ以外は forecast API
  if (day === 0) {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric&lang=ja`
    );
    if (!res.ok) {
      if (res.status === 404) throw new Error(`「${city}」が見つかりません。都市名を英語で試してください（例: Tokyo）`);
      throw new Error(`天気の取得に失敗しました (${res.status})`);
    }
    const data = await res.json();
    const text = buildBlock(
      '今日の天気レポート', new Date(),
      data.main.temp_max, data.main.temp_min,
      { main: data.weather[0].main, text: data.weather[0].description },
      data.main.humidity, data.wind.speed,
    );
    return { text, raw: data };
  }

  // forecast API（3時間ごと・5日分）
  const res = await fetch(
    `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric&lang=ja`
  );
  if (!res.ok) {
    if (res.status === 404) throw new Error(`「${city}」が見つかりません。都市名を英語で試してください（例: Tokyo）`);
    throw new Error(`天気の取得に失敗しました (${res.status})`);
  }
  const data = await res.json();

  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + day);
  const targetStr = targetDate.toISOString().slice(0, 10);

  const entries = data.list.filter(e => e.dt_txt.startsWith(targetStr));
  if (entries.length === 0) throw new Error(`${day}日後の予報データが見つかりませんでした。`);

  const noon = entries.find(e => e.dt_txt.includes('12:00')) ?? entries[0];
  const temps = entries.map(e => e.main.temp);
  const labels = ['今日', '明日', '明後日', '3日後', '4日後'];
  const label = `${labels[day] ?? `${day}日後`}の天気予報`;

  const text = buildBlock(
    label, targetDate,
    Math.max(...temps), Math.min(...temps),
    { main: noon.weather[0].main, text: noon.weather[0].description },
    noon.main.humidity, noon.wind.speed,
  );
  return { text, raw: data };
}

module.exports = { fetchWeather };
