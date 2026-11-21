require("dotenv").config();
const {
  DEFAULT_TICKET_PANEL_CHANNEL_ID,
  DEFAULT_TICKET_STAFF_ROLE_IDS,
} = require("./tickets/constants");

function parsePositiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseRoleIds(raw, fallback = []) {
  if (!raw || !String(raw).trim()) return [...fallback];
  const ids = String(raw)
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return ids.length > 0 ? [...new Set(ids)] : [...fallback];
}

const ticketStaffRoleIds = parseRoleIds(
  process.env.TICKET_STAFF_ROLE_IDS,
  DEFAULT_TICKET_STAFF_ROLE_IDS
);

const config = {
  token: process.env.DISCORD_TOKEN || "",
  clientId: process.env.CLIENT_ID || "",
  guildId: process.env.GUILD_ID || "",

  // Defender settings
  quarantineRoleName: (process.env.QUARANTINE_ROLE_NAME || "KARANTINA").trim(),
  defaultLogChannelName: (
    process.env.DEFAULT_LOG_CHANNEL_NAME || "defender-log"
  ).trim(),
  snapshotIntervalMinutes: parsePositiveNumber(
    process.env.SNAPSHOT_INTERVAL_MINUTES,
    15
  ),

  // Ticket (THE COMPLEX Destek Merkezi) settings
  ticketPanelChannelId: (
    process.env.TICKET_PANEL_CHANNEL_ID || DEFAULT_TICKET_PANEL_CHANNEL_ID
  ).trim(),
  ticketCategoryName: (
    process.env.TICKET_CATEGORY_NAME || "DESTEK TALEPLERİ"
  ).trim(),
  ticketStaffRoleIds,
  ticketManagementRoleIds: parseRoleIds(
    process.env.TICKET_MANAGEMENT_ROLE_IDS,
    ticketStaffRoleIds
  ),
  ticketUpperManagementRoleIds: parseRoleIds(
    process.env.TICKET_UPPER_MANAGEMENT_ROLE_IDS,
    []
  ),
  ticketClaimReminderHours: parsePositiveNumber(
    process.env.TICKET_CLAIM_REMINDER_HOURS,
    12
  ),
};

config.snapshotIntervalMs = Math.round(
  config.snapshotIntervalMinutes * 60 * 1000
);
config.ticketClaimReminderMs = Math.round(
  config.ticketClaimReminderHours * 60 * 60 * 1000
);

module.exports = config;
