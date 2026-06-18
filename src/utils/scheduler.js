const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { chat } = require('./claude-client');
const db = require('../db/database');

const SCHEDULES_FILE = path.join(__dirname, '../../data/schedules.json');

function loadSchedules() {
  if (!fs.existsSync(SCHEDULES_FILE)) return [];
  return JSON.parse(fs.readFileSync(SCHEDULES_FILE, 'utf8'));
}

function saveSchedules(schedules) {
  fs.mkdirSync(path.dirname(SCHEDULES_FILE), { recursive: true });
  fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(schedules, null, 2));
}

// Running cron tasks: Map<id, task>
const runningTasks = new Map();

function intervalToCron(intervalMinutes) {
  if (intervalMinutes < 60) return `*/${intervalMinutes} * * * *`;
  const hours = Math.floor(intervalMinutes / 60);
  return `0 */${hours} * * *`;
}

function startTask(schedule, client) {
  const cronExpr = intervalToCron(schedule.intervalMinutes);

  const task = cron.schedule(cronExpr, async () => {
    try {
      const channel = await client.channels.fetch(schedule.channelId);
      if (!channel) return;

      const apiKey =
        db.getUserKey(schedule.userId) ??
        db.getServerKey(schedule.guildId);

      if (!apiKey) {
        channel.send(`⚠️ スケジュール「${schedule.label}」: API キーが見つかりません。`);
        return;
      }

      // Use a dedicated history key for scheduled tasks
      const historyKey = `schedule_${schedule.id}`;
      const reply = await chat(apiKey, historyKey, schedule.prompt);

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

// Start all saved schedules on bot startup
function initSchedules(client) {
  const schedules = loadSchedules();
  for (const schedule of schedules) {
    startTask(schedule, client);
  }
  console.log(`📅 ${schedules.length} 件のスケジュールを開始しました`);
}

function addSchedule({ id, guildId, channelId, userId, label, prompt, intervalMinutes }, client) {
  const schedules = loadSchedules();
  const schedule = { id, guildId, channelId, userId, label, prompt, intervalMinutes, createdAt: Date.now() };
  schedules.push(schedule);
  saveSchedules(schedules);
  startTask(schedule, client);
  return schedule;
}

function removeSchedule(id) {
  const schedules = loadSchedules().filter(s => s.id !== id);
  saveSchedules(schedules);
  stopTask(id);
}

function getSchedulesByGuild(guildId) {
  return loadSchedules().filter(s => s.guildId === guildId);
}

module.exports = { initSchedules, addSchedule, removeSchedule, getSchedulesByGuild };
