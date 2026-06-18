const cron = require('node-cron');
const { chat } = require('./claude-client');
const db = require('../db/database');

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
