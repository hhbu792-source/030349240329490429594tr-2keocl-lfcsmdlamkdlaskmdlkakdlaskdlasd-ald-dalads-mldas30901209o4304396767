const fs = require("fs");
const path = require("path");

const DEFAULT_TICKET_STATE_FILE = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "tickets-state.json"
);

function createDefaultGuildTickets() {
  return {
    counter: 0,
    panelChannelId: null,
    panelMessageId: null,
    tickets: {}, // channelId -> ticket record
  };
}

class TicketStore {
  /**
   * @param {object} options
   * @param {string} [options.filePath]
   * @param {boolean} [options.persist=true]
   */
  constructor(options = {}) {
    this.filePath = options.filePath || DEFAULT_TICKET_STATE_FILE;
    this.persist = options.persist !== false;
    /** @type {Record<string, ReturnType<typeof createDefaultGuildTickets>>} */
    this.guilds = {};

    if (this.persist) {
      this._load();
    }
  }

  _load() {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const raw = fs.readFileSync(this.filePath, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.guilds === "object") {
        for (const [guildId, data] of Object.entries(parsed.guilds)) {
          this.guilds[guildId] = {
            ...createDefaultGuildTickets(),
            ...(data || {}),
            tickets: { ...(data?.tickets || {}) },
          };
        }
      }
    } catch (err) {
      console.error("[TICKET STORE] Durum dosyasi yuklenemedi:", err.message);
    }
  }

  save() {
    if (!this.persist) return;
    try {
      const dir = path.dirname(this.filePath);
      fs.mkdirSync(dir, { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(
        tmp,
        JSON.stringify({ guilds: this.guilds }, null, 2),
        "utf-8"
      );
      fs.renameSync(tmp, this.filePath);
    } catch (err) {
      console.error("[TICKET STORE] Durum dosyasi kaydedilemedi:", err.message);
    }
  }

  getGuild(guildId) {
    if (!this.guilds[guildId]) {
      this.guilds[guildId] = createDefaultGuildTickets();
      this.save();
    }
    return this.guilds[guildId];
  }

  nextTicketNumber(guildId) {
    const g = this.getGuild(guildId);
    g.counter += 1;
    this.save();
    return g.counter;
  }

  setPanelMessage(guildId, channelId, messageId) {
    const g = this.getGuild(guildId);
    g.panelChannelId = channelId;
    g.panelMessageId = messageId;
    this.save();
  }

  saveTicket(guildId, ticket) {
    const g = this.getGuild(guildId);
    g.tickets[ticket.channelId] = ticket;
    this.save();
    return ticket;
  }

  getTicketByChannel(guildId, channelId) {
    const g = this.getGuild(guildId);
    return g.tickets[channelId] || null;
  }

  findTicketByChannelAnyGuild(channelId) {
    for (const [guildId, g] of Object.entries(this.guilds)) {
      if (g.tickets[channelId]) {
        return { guildId, ticket: g.tickets[channelId] };
      }
    }
    return null;
  }

  deleteTicket(guildId, channelId) {
    const g = this.getGuild(guildId);
    if (!g.tickets[channelId]) return false;
    delete g.tickets[channelId];
    this.save();
    return true;
  }

  /**
   * Find active or latest anonymous ticket(s) belonging to a user across all guilds.
   */
  findAnonymousTicketsForUser(userId) {
    const matches = [];
    for (const [guildId, g] of Object.entries(this.guilds)) {
      for (const ticket of Object.values(g.tickets)) {
        if (ticket.anonymous && ticket.openerId === userId) {
          matches.push({ guildId, ticket });
        }
      }
    }
    matches.sort((a, b) => (b.ticket.createdAt || 0) - (a.ticket.createdAt || 0));
    return matches;
  }

  getGuildTickets(guildId) {
    const g = this.getGuild(guildId);
    return Object.values(g.tickets).sort((a, b) => a.number - b.number);
  }
}

module.exports = { TicketStore };
