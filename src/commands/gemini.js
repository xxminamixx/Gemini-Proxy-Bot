const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { randomUUID } = require('crypto');
const db = require('../db/database');
const { chat, clearHistory } = require('../utils/claude-client');
const { addSchedule, removeSchedule, getSchedulesByGuild } = require('../utils/scheduler');
const { fetchWeather } = require('../utils/weather');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gemini')
    .setDescription('Gemini AI と会話する')
    .addSubcommand(sub =>
      sub.setName('chat')
        .setDescription('Gemini にメッセージを送る')
        .addStringOption(opt =>
          opt.setName('message')
            .setDescription('送りたいメッセージ')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('setup')
        .setDescription('自分の Gemini API キーを登録する')
        .addStringOption(opt =>
          opt.setName('api_key')
            .setDescription('Google AI Studio の API キー')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('admin-setup')
        .setDescription('サーバー共通の Gemini API キーを設定する（管理者専用）')
        .addStringOption(opt =>
          opt.setName('api_key')
            .setDescription('Google AI Studio の API キー')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('clear')
        .setDescription('自分の会話履歴をリセットする')
    )
    .addSubcommand(sub =>
      sub.setName('remove-key')
        .setDescription('自分の個人 API キーを削除する')
    )
    .addSubcommand(sub =>
      sub.setName('schedule-add')
        .setDescription('定期実行スケジュールを追加する')
        .addStringOption(opt =>
          opt.setName('label')
            .setDescription('スケジュールの名前（例: 朝のニュース）')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('prompt')
            .setDescription('Gemini に送るプロンプト')
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('interval')
            .setDescription('実行間隔（分）例: 60 = 1時間ごと、1440 = 1日ごと')
            .setRequired(false)
            .setMinValue(5)
            .setMaxValue(10080)
        )
        .addStringOption(opt =>
          opt.setName('time')
            .setDescription('毎日実行する時刻（HH:MM 形式、例: 08:00）。interval と同時指定不可')
            .setRequired(false)
        )
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('結果を投稿するチャンネル（省略時: このチャンネル）')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName('schedule-list')
        .setDescription('このサーバーの定期実行スケジュール一覧を表示する')
    )
    .addSubcommand(sub =>
      sub.setName('schedule-remove')
        .setDescription('定期実行スケジュールを削除する')
        .addStringOption(opt =>
          opt.setName('id')
            .setDescription('削除するスケジュールのID（schedule-list で確認）')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('weather')
        .setDescription('指定した都市の天気を表示する')
        .addStringOption(opt =>
          opt.setName('city')
            .setDescription('都市名（例: Tokyo, Kawasaki, Osaka）')
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('day')
            .setDescription('何日後の天気か（0=今日, 1=明日, 2=明後日, 最大4）')
            .setRequired(false)
            .setMinValue(0)
            .setMaxValue(4)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ── /gemini setup ──────────────────────────────────────────────
    if (sub === 'setup') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const apiKey = interaction.options.getString('api_key');
      await db.setUserKey(interaction.user.id, apiKey);
      return interaction.editReply('個人 API キーを登録しました。');
    }

    // ── /gemini admin-setup ────────────────────────────────────────
    if (sub === 'admin-setup') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
          content: 'このコマンドはサーバー管理者のみ使用できます。',
          flags: MessageFlags.Ephemeral,
        });
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const apiKey = interaction.options.getString('api_key');
      await db.setServerKey(interaction.guildId, apiKey, interaction.user.id);
      return interaction.editReply('サーバー共通 API キーを設定しました。');
    }

    // ── /gemini clear ──────────────────────────────────────────────
    if (sub === 'clear') {
      clearHistory(interaction.user.id);
      return interaction.reply({
        content: '会話履歴をリセットしました。',
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── /gemini remove-key ─────────────────────────────────────────
    if (sub === 'remove-key') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await db.deleteUserKey(interaction.user.id);
      return interaction.editReply('個人 API キーを削除しました。');
    }

    // ── /gemini schedule-add ───────────────────────────────────────
    if (sub === 'schedule-add') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const apiKey =
        (await db.getUserKey(interaction.user.id)) ??
        (await db.getServerKey(interaction.guildId));

      if (!apiKey) {
        return interaction.editReply('API キーが設定されていません。先に `/gemini setup` または `/gemini admin-setup` でキーを登録してください。');
      }

      const label = interaction.options.getString('label');
      const prompt = interaction.options.getString('prompt');
      const interval_minutes = interaction.options.getInteger('interval');
      const cron_time = interaction.options.getString('time');

      if (!interval_minutes && !cron_time) {
        return interaction.editReply('`interval` か `time` のどちらかを指定してください。');
      }
      if (interval_minutes && cron_time) {
        return interaction.editReply('`interval` と `time` は同時に指定できません。どちらか一方を使ってください。');
      }
      if (cron_time && !/^\d{1,2}:\d{2}$/.test(cron_time)) {
        return interaction.editReply('`time` は `HH:MM` 形式で指定してください（例: `08:00`）。');
      }

      const channel = interaction.options.getChannel('channel') ?? interaction.channel;
      if (!channel) {
        return interaction.editReply('チャンネルを特定できませんでした。`channel` オプションで明示的に指定してください。');
      }
      const id = randomUUID().slice(0, 8);

      await addSchedule({
        id,
        guild_id: interaction.guildId,
        channel_id: channel.id,
        user_id: interaction.user.id,
        label,
        prompt,
        interval_minutes: interval_minutes ?? null,
        cron_time: cron_time ?? null,
      }, interaction.client);

      const scheduleDesc = cron_time ? `毎日 ${cron_time}` : `${interval_minutes} 分ごと`;
      return interaction.editReply([
        `✅ スケジュールを登録しました。`,
        `- **名前**: ${label}`,
        `- **プロンプト**: ${prompt}`,
        `- **実行タイミング**: ${scheduleDesc}`,
        `- **チャンネル**: <#${channel.id}>`,
        `- **ID**: \`${id}\`（削除時に使用）`,
      ].join('\n'));
    }

    // ── /gemini schedule-list ──────────────────────────────────────
    if (sub === 'schedule-list') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const schedules = await getSchedulesByGuild(interaction.guildId);

      if (schedules.length === 0) {
        return interaction.editReply('このサーバーに登録されたスケジュールはありません。');
      }

      const lines = schedules.map(s => {
        const timing = s.cron_time ? `毎日 ${s.cron_time}` : `${s.interval_minutes}分ごと`;
        return `**${s.label}** (ID: \`${s.id}\`)\n  📍 <#${s.channel_id}> | ⏱ ${timing}\n  💬 ${s.prompt}`;
      });

      return interaction.editReply(`📅 **スケジュール一覧 (${schedules.length}件)**\n\n${lines.join('\n\n')}`);
    }

    // ── /gemini schedule-remove ────────────────────────────────────
    if (sub === 'schedule-remove') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const id = interaction.options.getString('id');
      const schedules = await getSchedulesByGuild(interaction.guildId);
      const target = schedules.find(s => s.id === id);

      if (!target) {
        return interaction.editReply(`ID \`${id}\` のスケジュールが見つかりません。`);
      }

      await removeSchedule(id);
      return interaction.editReply(`✅ スケジュール「${target.label}」を削除しました。`);
    }

    // ── /gemini weather ───────────────────────────────────────────────
    if (sub === 'weather') {
      await interaction.deferReply();
      const city = interaction.options.getString('city');
      const day = interaction.options.getInteger('day') ?? 0;
      try {
        const { text } = await fetchWeather(city, day);
        await interaction.editReply(text);
      } catch (err) {
        await interaction.editReply(`❌ ${err.message}`);
      }
      return;
    }

    // ── /gemini chat ───────────────────────────────────────────────
    if (sub === 'chat') {
      const message = interaction.options.getString('message');

      const apiKey =
        (await db.getUserKey(interaction.user.id)) ??
        (await db.getServerKey(interaction.guildId));

      if (!apiKey) {
        return interaction.reply({
          content: [
            'API キーが設定されていません。',
            '- 個人キーを登録: `/gemini setup <api_key>`',
            '- 管理者がサーバーキーを設定: `/gemini admin-setup <api_key>`',
          ].join('\n'),
          flags: MessageFlags.Ephemeral,
        });
      }

      await interaction.deferReply();

      try {
        const reply = await chat(apiKey, interaction.user.id, message);

        if (reply.length <= 2000) {
          await interaction.editReply(reply);
        } else {
          const chunks = reply.match(/[\s\S]{1,2000}/g) ?? [];
          await interaction.editReply(chunks[0]);
          for (const chunk of chunks.slice(1)) {
            await interaction.followUp(chunk);
          }
        }
      } catch (err) {
        console.error('Gemini API error:', err);
        const msg = err.status === 400 || err.message?.includes('API key')
          ? 'API キーが無効です。`/gemini setup` で正しいキーを再登録してください。'
          : `Gemini との通信中にエラーが発生しました: ${err.message}`;
        await interaction.editReply({ content: msg });
      }
    }
  },
};
