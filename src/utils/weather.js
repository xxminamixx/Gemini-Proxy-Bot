const WEATHER_ICONS = {
  Thunderstorm: '⛈',
  Drizzle: '🌦',
  Rain: '🌧',
  Snow: '❄️',
  Mist: '🌫', Smoke: '🌫', Haze: '🌫', Dust: '🌫',
  Fog: '🌫', Sand: '🌫', Ash: '🌫', Squall: '🌫', Tornado: '🌪',
  Clear: '☀️',
  Clouds: '☁️',
};

async function fetchWeather(city) {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) throw new Error('OPENWEATHER_API_KEY が設定されていません。');

  const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric&lang=ja`;
  const res = await fetch(url);

  if (!res.ok) {
    if (res.status === 404) throw new Error(`「${city}」が見つかりません。都市名を英語で試してください（例: Tokyo）`);
    throw new Error(`天気の取得に失敗しました (${res.status})`);
  }

  const data = await res.json();
  const icon = WEATHER_ICONS[data.weather[0].main] ?? '🌡';
  const date = new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });

  return {
    text: [
      `${icon} **今日の天気レポート**`,
      `━━━━━━━━━━━━━━━`,
      `📅 日付　：${date}`,
      `🌡 気温　：最高 ${Math.round(data.main.temp_max)}°C / 最低 ${Math.round(data.main.temp_min)}°C`,
      `🌂 天気　：${data.weather[0].description}`,
      `💧 湿度　：${data.main.humidity}%`,
      `🌬 風　　：${data.wind.speed} m/s`,
      `━━━━━━━━━━━━━━━`,
    ].join('\n'),
    raw: data,
  };
}

module.exports = { fetchWeather };
