const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
);

module.exports = {
  async setServerKey(guildId, apiKey, userId) {
    const { error } = await supabase.from('server_keys').upsert(
      { guild_id: guildId, api_key: apiKey, set_by: userId, set_at: Date.now() },
      { onConflict: 'guild_id' },
    );
    if (error) throw error;
  },

  async getServerKey(guildId) {
    const { data, error } = await supabase
      .from('server_keys')
      .select('api_key')
      .eq('guild_id', guildId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data?.api_key ?? null;
  },

  async setUserKey(userId, apiKey) {
    const { error } = await supabase.from('user_keys').upsert(
      { user_id: userId, api_key: apiKey, set_at: Date.now() },
      { onConflict: 'user_id' },
    );
    if (error) throw error;
  },

  async getUserKey(userId) {
    const { data, error } = await supabase
      .from('user_keys')
      .select('api_key')
      .eq('user_id', userId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data?.api_key ?? null;
  },

  async deleteUserKey(userId) {
    const { error } = await supabase.from('user_keys').delete().eq('user_id', userId);
    if (error) throw error;
  },

  async deleteServerKey(guildId) {
    const { error } = await supabase.from('server_keys').delete().eq('guild_id', guildId);
    if (error) throw error;
  },

  async addSchedule(schedule) {
    const { error } = await supabase.from('schedules').insert(schedule);
    if (error) throw error;
  },

  async getSchedulesByGuild(guildId) {
    const { data, error } = await supabase
      .from('schedules')
      .select('*')
      .eq('guild_id', guildId);
    if (error) throw error;
    return data ?? [];
  },

  async getAllSchedules() {
    const { data, error } = await supabase.from('schedules').select('*');
    if (error) throw error;
    return data ?? [];
  },

  async removeSchedule(id) {
    const { error } = await supabase.from('schedules').delete().eq('id', id);
    if (error) throw error;
  },
};
