const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { randomUUID } = require('crypto');
const db = require('../db/database');
const { chat, clearHistory } = require('../utils/claude-client');
const { addSchedule, removeSchedule, getSchedulesByGuild } = require('../utils/scheduler');

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
            .setRequired(true)
            .setMinValue(5)
            .setMaxValue(10080)
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
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ── /gemini setup ──────────────────────────────────────────────
    if (sub === 'setup') {
      const apiKey = interaction.options.getString('api_key');
      await db.setUserKey(interaction.user.id, apiKey);
      return interaction.reply({
        content: '個人 API キーを登録しました。',
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── /gemini admin-setup ────────────────────────────────────────
    if (sub === 'admin-setup') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
          content: 'このコマンドはサーバー管理者のみ使用できます。',
          flags: MessageFlags.Ephemeral,
        });
      }
      const apiKey = interaction.options.getString('api_key');
      await db.setServerKey(interaction.guildId, apiKey, interaction.user.id);
      return interaction.reply({
        content: 'サーバー共通 API キーを設定しました。',
        flags: MessageFlags.Ephemeral,
      });
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
      await db.deleteUserKey(interaction.user.id);
      return interaction.reply({
        content: '個人 API キーを削除しました。',
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── /gemini schedule-add ───────────────────────────────────────
    if (sub === 'schedule-add') {
      const apiKey =
        (await db.getUserKey(interaction.user.id)) ??
        (await db.getServerKey(interaction.guildId));

      if (!apiKey) {
        return interaction.reply({
          content: 'API キーが設定されていません。先に `/gemini setup` または `/gemini admin-setup` でキーを登録してください。',
          flags: MessageFlags.Ephemeral,
        });
      }

      const label = interaction.options.getString('label');
      const prompt = interaction.options.getString('prompt');
      const interval_minutes = interaction.options.getInteger('interval');
      const channel = interaction.options.getChannel('channel') ?? interaction.channel;
      const id = randomUUID().slice(0, 8);

      await addSchedule({
        id,
        guild_id: interaction.guildId,
        channel_id: channel.id,
        user_id: interaction.user.id,
        label,
        prompt,
        interval_minutes,
      }, interaction.client);

      return interaction.reply({
        content: [
          `✅ スケジュールを登録しました。`,
          `- **名前**: ${label}`,
          `- **プロンプト**: ${prompt}`,
          `- **間隔**: ${interval_minutes} 分ごと`,
          `- **チャンネル**: <#${channel.id}>`,
          `- **ID**: \`${id}\`（削除時に使用）`,
        ].join('\n'),
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── /gemini schedule-list ──────────────────────────────────────
    if (sub === 'schedule-list') {
      const schedules = await getSchedulesByGuild(interaction.guildId);

      if (schedules.length === 0) {
        return interaction.reply({
          content: 'このサーバーに登録されたスケジュールはありません。',
          flags: MessageFlags.Ephemeral,
        });
      }

      const lines = schedules.map(s =>
        `**${s.label}** (ID: \`${s.id}\`)\n  📍 <#${s.channel_id}> | ⏱ ${s.interval_minutes}分ごと\n  💬 ${s.prompt}`
      );

      return interaction.reply({
        content: `📅 **スケジュール一覧 (${schedules.length}件)**\n\n${lines.join('\n\n')}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── /gemini schedule-remove ────────────────────────────────────
    if (sub === 'schedule-remove') {
      const id = interaction.options.getString('id');
      const schedules = await getSchedulesByGuild(interaction.guildId);
      const target = schedules.find(s => s.id === id);

      if (!target) {
        return interaction.reply({
          content: `ID \`${id}\` のスケジュールが見つかりません。`,
          flags: MessageFlags.Ephemeral,
        });
      }

      await removeSchedule(id);
      return interaction.reply({
        content: `✅ スケジュール「${target.label}」を削除しました。`,
        flags: MessageFlags.Ephemeral,
      });
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
