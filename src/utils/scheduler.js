const cron = require('node-cron');
const { chat } = require('./claude-client');
const { fetchWeather } = require('./weather');
const db = require('../db/database');

// {weather:東京} をリアルタイム天気データに置き換える
async function resolvePrompt(prompt) {
  const matches = [...prompt.matchAll(/\{weather:([^}]+)\}/g)];
  if (matches.length === 0) return prompt;

  let resolved = prompt;
  for (const match of matches) {
    const city = match[1];
    try {
      const { text } = await fetchWeather(city);
      resolved = resolved.replace(match[0], text);
    } catch (err) {
      resolved = resolved.replace(match[0], `（${city}の天気取得失敗: ${err.message}）`);
    }
  }
  return resolved;
}

// Running cron tasks: Map<id, task>
const runningTasks = new Map();

function intervalToCron(intervalMinutes) {
  if (intervalMinutes < 60) return `*/${intervalMinutes} * * * *`;
  if (intervalMinutes < 1440) {
    const hours = Math.floor(intervalMinutes / 60);
    return `0 */${hours} * * *`;
  }
  // 1440分以上（1日以上）は毎日0時に実行
  const days = Math.floor(intervalMinutes / 1440);
  return days <= 1 ? `0 0 * * *` : `0 0 */${days} * *`;
}

function startTask(schedule, client) {
  const cronExpr = intervalToCron(schedule.interval_minutes);

  const task = cron.schedule(cronExpr, async () => {
    try {
      const channel = await client.channels.fetch(schedule.channel_id);
      if (!channel) return;

      const apiKey =
        (await db.getUserKey(schedule.user_id)) ??
        (await db.getServerKey(schedule.guild_id));

      if (!apiKey) {
        await channel.send(`⚠️ スケジュール「${schedule.label}」: API キーが見つかりません。`);
        return;
      }

      const historyKey = `schedule_${schedule.id}`;
      const resolvedPrompt = await resolvePrompt(schedule.prompt);
      const reply = await chat(apiKey, historyKey, resolvedPrompt);
      await channel.send(`**[${schedule.label}]**\n${reply}`);
    } catch (err) {
      console.error(`Schedule ${schedule.id} error:`, err);
    }
  });

  runningTasks.set(schedule.id, task);
}

function stopTask(id) {
  const task = runningTasks.get(id);
  if (task) {
    task.stop();
    runningTasks.delete(id);
  }
}

async function initSchedules(client) {
  const schedules = await db.getAllSchedules();
  for (const schedule of schedules) {
    startTask(schedule, client);
  }
  console.log(`📅 ${schedules.length} 件のスケジュールを開始しました`);
}

async function addSchedule(schedule, client) {
  await db.addSchedule(schedule);
  startTask(schedule, client);
}

async function removeSchedule(id) {
  await db.removeSchedule(id);
  stopTask(id);
}

async function getSchedulesByGuild(guildId) {
  return db.getSchedulesByGuild(guildId);
}

module.exports = { initSchedules, addSchedule, removeSchedule, getSchedulesByGuild };
