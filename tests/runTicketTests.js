const assert = require("assert");
const { ChannelType, PermissionFlagsBits } = require("discord.js");

const { TicketManager } = require("../src/tickets/ticketManager");
const {
  DEFAULT_TICKET_PANEL_CHANNEL_ID,
  DEFAULT_TICKET_STAFF_ROLE_IDS,
  PANEL_TITLE,
  TICKET_CATEGORIES,
} = require("../src/tickets/constants");

class MockCollection extends Map {
  find(fn) {
    for (const v of this.values()) {
      if (fn(v)) return v;
    }
    return undefined;
  }
}

let seq = 5000;

function createUser(id, username) {
  const dms = [];
  return {
    id,
    username,
    tag: `${username}#0001`,
    bot: false,
    _dms: dms,
    async send(payload) {
      const msg = { id: `dm-${++seq}`, payload, embeds: payload.embeds || [] };
      dms.push(msg);
      return msg;
    },
  };
}

function createTicketMockEnv() {
  const channelsCache = new MockCollection();
  const rolesCache = new MockCollection();
  const usersMap = new Map();

  const everyoneRole = { id: "everyone-1", name: "@everyone" };
  rolesCache.set(everyoneRole.id, everyoneRole);

  for (const rid of DEFAULT_TICKET_STAFF_ROLE_IDS) {
    rolesCache.set(rid, { id: rid, name: `Staff-${rid.slice(-4)}` });
  }

  const ownerUser = createUser("owner-999", "SunucuSahibi");
  const staffUser = createUser("staff-101", "YetkiliCan");
  const playerUser = createUser("player-202", "OyuncuMert");
  usersMap.set(ownerUser.id, ownerUser);
  usersMap.set(staffUser.id, staffUser);
  usersMap.set(playerUser.id, playerUser);

  const staffRoles = new MockCollection();
  staffRoles.set(
    DEFAULT_TICKET_STAFF_ROLE_IDS[0],
    rolesCache.get(DEFAULT_TICKET_STAFF_ROLE_IDS[0])
  );
  const staffMember = {
    id: staffUser.id,
    displayName: "Yetkili Can",
    user: staffUser,
    roles: { cache: staffRoles },
    permissions: { has: () => false },
  };
  const playerMember = {
    id: playerUser.id,
    displayName: "Oyuncu Mert",
    user: playerUser,
    roles: { cache: new MockCollection() },
    permissions: { has: () => false },
  };

  function makeChannel(opts) {
    const id = opts.id || `ch-${++seq}`;
    const messagesMap = new Map();
    const sent = [];
    let overwrites = [...(opts.permissionOverwrites || [])];

    const ch = {
      id,
      guild,
      name: opts.name,
      type: opts.type ?? ChannelType.GuildText,
      parentId: opts.parent || null,
      topic: opts.topic || null,
      deleted: false,
      _sent: sent,
      _overwrites: overwrites,
      _edits: [],
      permissionOverwrites: {
        async set(newList) {
          overwrites = [...newList];
          ch._overwrites = overwrites;
        },
        async edit(targetId, patch) {
          ch._edits.push({ targetId, patch });
        },
      },
      messages: {
        async fetch(arg) {
          if (typeof arg === "string") {
            return messagesMap.get(arg) || null;
          }
          const col = new MockCollection();
          for (const [k, v] of messagesMap.entries()) col.set(k, v);
          return col;
        },
      },
      async send(payload) {
        const msg = {
          id: `msg-${++seq}`,
          author: { id: "bot-self" },
          embeds: payload.embeds || [],
          components: payload.components || [],
          content: payload.content || "",
          pinned: false,
          editedCount: 0,
          async pin() {
            msg.pinned = true;
          },
          async edit(nextPayload) {
            msg.editedCount += 1;
            if (nextPayload.embeds) msg.embeds = nextPayload.embeds;
            if (nextPayload.components) msg.components = nextPayload.components;
            return msg;
          },
        };
        messagesMap.set(msg.id, msg);
        sent.push(msg);
        return msg;
      },
      async delete() {
        ch.deleted = true;
        channelsCache.delete(ch.id);
      },
    };
    channelsCache.set(id, ch);
    return ch;
  }

  const guild = {
    id: "guild-complex-1",
    name: "THE COMPLEX",
    ownerId: ownerUser.id,
    roles: { everyone: everyoneRole, cache: rolesCache },
    channels: {
      cache: channelsCache,
      async create(opts) {
        return makeChannel(opts);
      },
    },
    members: {
      me: { id: "bot-self" },
      cache: new MockCollection([
        [ownerUser.id, { id: ownerUser.id, user: ownerUser }],
        [staffUser.id, staffMember],
        [playerUser.id, playerMember],
      ]),
    },
  };

  // Pre-create panel channel with exact ID 1573522477655654544
  const panelChannel = makeChannel({
    id: DEFAULT_TICKET_PANEL_CHANNEL_ID,
    name: "destek-ac",
    type: ChannelType.GuildText,
  });

  const client = {
    user: { id: "bot-self" },
    channels: {
      cache: channelsCache,
      async fetch(id) {
        return channelsCache.get(id) || null;
      },
    },
    users: {
      cache: usersMap,
      async fetch(id) {
        return usersMap.get(id) || null;
      },
    },
  };

  return {
    guild,
    client,
    panelChannel,
    ownerUser,
    staffUser,
    staffMember,
    playerUser,
    playerMember,
  };
}

async function runTicketTests() {
  console.log("=== THE COMPLEX Destek Merkezi (Ticket) Test Suite ===");

  const env = createTicketMockEnv();
  const manager = new TicketManager({
    persist: false,
    deleteDelayMs: 0,
  });

  // 1. Panel auto-post to channel 1573522477655654544 + anti-duplicate on restart
  const panelMsg1 = await manager.ensurePanelMessage(env.client);
  assert(panelMsg1);
  assert.strictEqual(env.panelChannel._sent.length, 1);
  assert.strictEqual(panelMsg1.embeds[0].data.title, PANEL_TITLE);
  assert(
    panelMsg1.embeds[0].data.description.includes(
      "THE COMPLEX destek merkezine hoş geldiniz."
    )
  );
  assert.strictEqual(
    panelMsg1.embeds[0].data.description.includes("**Kurallar**"),
    false
  );
  assert.strictEqual(
    panelMsg1.embeds[0].data.description.includes("Kimse var mı?"),
    false
  );
  assert(
    panelMsg1.embeds[0].data.description.includes("Blacklist Kaldırma")
  );
  assert.strictEqual(panelMsg1.components[0].components[0].data.label, "Destek Aç");
  assert.strictEqual(panelMsg1.components[0].components[0].data.custom_id, "ticket:open");

  // Running ensurePanelMessage again must edit in place (no duplicate!)
  const panelMsg2 = await manager.ensurePanelMessage(env.client);
  assert.strictEqual(panelMsg2.id, panelMsg1.id);
  assert.strictEqual(env.panelChannel._sent.length, 1);
  assert.strictEqual(panelMsg1.editedCount, 1);
  console.log("[OK] Destek paneli: 1573522477655654544 kanalina eksiksiz metin ve Destek Ac butonu ile gonderildi.");

  // 2. Menu Flow: Clicking "Destek Aç" -> shows all 8 categories
  let replyPayload = null;
  await manager.handleInteraction({
    customId: "ticket:open",
    isButton: () => true,
    isStringSelectMenu: () => false,
    isModalSubmit: () => false,
    async reply(p) {
      replyPayload = p;
    },
  });
  assert(replyPayload);
  const catOptions = replyPayload.components[0].components[0].options;
  assert.strictEqual(catOptions.length, Object.keys(TICKET_CATEGORIES).length);
  assert.strictEqual(catOptions.length, 12);
  assert(catOptions.some((o) => o.data.value === "oneri_itirazi"));
  assert(catOptions.some((o) => o.data.value === "bug_raporu"));
  assert(catOptions.some((o) => o.data.value === "yonetim_sikayet"));
  assert(catOptions.some((o) => o.data.value === "blacklist_kaldirma"));

  // Selecting Text RP -> opens Modal with exact 3 fields (Discord User ID, Sorun, Opsiyonel sikayet edilen)
  let shownModal = null;
  await manager.handleInteraction({
    customId: "ticket:select_category",
    values: ["text_rp"],
    user: env.playerUser,
    isButton: () => false,
    isStringSelectMenu: () => true,
    isModalSubmit: () => false,
    async showModal(m) {
      shownModal = m;
    },
  });
  assert(shownModal);
  const modalFields = shownModal.components.map((r) => r.components[0].data);
  assert.strictEqual(modalFields.length, 3);
  assert.strictEqual(modalFields[0].custom_id, "discord_user_id");
  assert.strictEqual(modalFields[0].required, true);
  assert.strictEqual(modalFields[1].custom_id, "issue_description");
  assert.strictEqual(modalFields[1].required, true);
  assert.strictEqual(modalFields[2].custom_id, "reported_username");
  assert.strictEqual(modalFields[2].required, false);

  // Selecting Anonim Şikayet -> shows visibility chooser menu first!
  let updatedVisibility = null;
  await manager.handleInteraction({
    customId: "ticket:select_category",
    values: ["anonim_sikayet"],
    user: env.playerUser,
    isButton: () => false,
    isStringSelectMenu: () => true,
    isModalSubmit: () => false,
    async update(p) {
      updatedVisibility = p;
    },
  });
  assert(updatedVisibility);
  assert.strictEqual(
    updatedVisibility.components[0].components[0].data.custom_id,
    "ticket:anon_visibility"
  );
  console.log("[OK] Menu ve Modal akisi: 8 kategori + 3 alanli form + anonim gorunurluk secimi dogrulandi.");

  // 3. Create standard tickets & verify exact channel name templates + 4 staff role IDs visibility!
  const trp = await manager.createTicketFromSubmission({
    guild: env.guild,
    client: env.client,
    openerUser: env.playerUser,
    categoryId: "text_rp",
    formDiscordUserId: env.playerUser.id,
    issueDescription: "Level 1 RP'sinde kural ihlali yapildi.",
    reportedUsername: "kuralbozan_99",
  });
  assert.strictEqual(trp.channel.name, "trp-1");
  assert.strictEqual(trp.controlMsg.pinned, true);
  // Check exact permission overwrites: @everyone denied, opener allowed, all 4 staff role IDs allowed!
  const owIds = trp.channel._overwrites.map((o) => o.id);
  assert(owIds.includes("everyone-1"));
  assert(owIds.includes(env.playerUser.id));
  for (const rid of DEFAULT_TICKET_STAFF_ROLE_IDS) {
    assert(owIds.includes(rid), `Staff role ${rid} must have access to ticket channel`);
  }

  const dc = await manager.createTicketFromSubmission({
    guild: env.guild,
    client: env.client,
    openerUser: env.playerUser,
    categoryId: "discord",
    formDiscordUserId: env.playerUser.id,
    issueDescription: "Rolum gelmedi.",
  });
  assert.strictEqual(dc.channel.name, "dc-2");

  const tek = await manager.createTicketFromSubmission({
    guild: env.guild,
    client: env.client,
    openerUser: env.playerUser,
    categoryId: "teknik",
    formDiscordUserId: env.playerUser.id,
    issueDescription: "Bot komutu calismiyor.",
  });
  assert.strictEqual(tek.channel.name, "teknik-3");

  const stf = await manager.createTicketFromSubmission({
    guild: env.guild,
    client: env.client,
    openerUser: env.playerUser,
    categoryId: "yetkili_sikayet",
    formDiscordUserId: env.playerUser.id,
    issueDescription: "Yetkili haksiz yere uyari verdi.",
    reportedUsername: "yetkili_x",
  });
  assert.strictEqual(stf.channel.name, "staff-4");
  console.log("[OK] Kanal sablonlari ve izinler: trp-1, dc-2, teknik-3, staff-4 ve 4 yetkili rol ID dogrulandi.");

  // 4. Top Admin Control Menu: block non-staff, test all 6 actions + opener DM notifications!
  let deniedReply = null;
  await manager.handleInteraction({
    customId: `ticket:admin_action:${trp.channel.id}`,
    values: ["close"],
    guild: env.guild,
    client: env.client,
    channel: trp.channel,
    user: env.playerUser,
    member: env.playerMember,
    memberPermissions: { has: () => false },
    isButton: () => false,
    isStringSelectMenu: () => true,
    isModalSubmit: () => false,
    async reply(p) {
      deniedReply = p;
    },
  });
  assert(deniedReply && deniedReply.content.includes("yalnızca yetkili ekip"));

  // Staff executes: escalate -> hold -> reopen -> resolve -> close -> delete
  const prevPlayerDms = env.playerUser._dms.length;
  for (const act of ["escalate", "hold", "reopen", "resolve", "close"]) {
    const res = await manager.executeAdminAction({
      guild: env.guild,
      client: env.client,
      channel: trp.channel,
      actorMember: env.staffMember,
      actorUser: env.staffUser,
      action: act,
    });
    assert.strictEqual(res.ok, true);
  }
  assert.strictEqual(trp.ticket.escalated, true);
  assert.strictEqual(trp.ticket.status, "closed");
  assert.strictEqual(env.playerUser._dms.length, prevPlayerDms + 5);
  assert(
    env.playerUser._dms[env.playerUser._dms.length - 1].embeds[0].data.title.includes(
      "Kapatıldı"
    )
  );

  // Delete action deletes channel and notifies opener via DM
  const delRes = await manager.executeAdminAction({
    guild: env.guild,
    client: env.client,
    channel: trp.channel,
    actorMember: env.staffMember,
    actorUser: env.staffUser,
    action: "delete",
  });
  assert.strictEqual(delRes.ok, true);
  assert.strictEqual(trp.channel.deleted, true);
  assert.strictEqual(manager.store.getTicketByChannel(env.guild.id, trp.channel.id), null);
  console.log("[OK] Yonetim menusu: 6 islem (aktar, aski, geri ac, cozuldu, kapat, sil) ve DM bildirimleri dogrulandi.");

  // 5. Anonymous Ticket (`anonim-5`): Admin-only channel, identity hidden except Owner, Two-Way DM Bridge!
  const prevOwnerDms = env.ownerUser._dms.length;
  const anon = await manager.createTicketFromSubmission({
    guild: env.guild,
    client: env.client,
    openerUser: env.playerUser,
    categoryId: "anonim_sikayet",
    visibilityId: "management_all",
    formDiscordUserId: env.playerUser.id,
    issueDescription: "Bir yonetici yetkisini kotuye kullaniyor.",
    reportedUsername: "yonetici_z",
  });
  assert.strictEqual(anon.channel.name, "anonim-5");
  assert.strictEqual(anon.openerDmSent, true);
  // Opener must NOT be in channel permission overwrites!
  assert.strictEqual(
    anon.channel._overwrites.some((o) => o.id === env.playerUser.id),
    false
  );
  // Top embed must NOT reveal player's username or ID!
  const anonEmbedJson = JSON.stringify(anon.controlMsg.embeds[0].data);
  assert(!anonEmbedJson.includes(env.playerUser.id));
  assert(!anonEmbedJson.includes(env.playerUser.username));
  assert(anonEmbedJson.includes("Anonim Kullanıcı"));
  // Server Owner received confidential identity DM!
  assert.strictEqual(env.ownerUser._dms.length, prevOwnerDms + 1);
  assert(
    JSON.stringify(env.ownerUser._dms[env.ownerUser._dms.length - 1].embeds[0].data).includes(
      env.playerUser.id
    )
  );

  // Reveal identity button: blocked for normal staff, allowed for Server Owner!
  let staffRevealReply = null;
  await manager.handleInteraction({
    customId: `ticket:reveal_identity:${anon.channel.id}`,
    guild: env.guild,
    user: env.staffUser,
    isButton: () => true,
    isStringSelectMenu: () => false,
    isModalSubmit: () => false,
    async reply(p) {
      staffRevealReply = p;
    },
  });
  assert(staffRevealReply.content.includes("yalnızca Sunucu Sahibi"));

  let ownerRevealReply = null;
  await manager.handleInteraction({
    customId: `ticket:reveal_identity:${anon.channel.id}`,
    guild: env.guild,
    user: env.ownerUser,
    isButton: () => true,
    isStringSelectMenu: () => false,
    isModalSubmit: () => false,
    async reply(p) {
      ownerRevealReply = p;
    },
  });
  assert(ownerRevealReply.content.includes(env.playerUser.id));

  // Admin writes in `anonim-5` -> player receives anonymous DM (no admin name leaked!)
  const beforeAdminMsgDms = env.playerUser._dms.length;
  await manager.handleGuildMessage(
    {
      guild: env.guild,
      channel: anon.channel,
      author: env.staffUser,
      content: "Konuyu incelemeye aldik, elinizde ekran goruntusu var mi?",
      attachments: new Map(),
    },
    env.client
  );
  assert.strictEqual(env.playerUser._dms.length, beforeAdminMsgDms + 1);
  const bridgedToPlayerJson = JSON.stringify(
    env.playerUser._dms[env.playerUser._dms.length - 1].embeds[0].data
  );
  assert(bridgedToPlayerJson.includes("ekran goruntusu var mi"));
  assert(!bridgedToPlayerJson.includes(env.staffUser.username));
  assert(!bridgedToPlayerJson.includes(env.staffUser.id));

  // Admin internal note with `//` -> NOT forwarded to player!
  await manager.handleGuildMessage(
    {
      guild: env.guild,
      channel: anon.channel,
      author: env.staffUser,
      content: "// arkadaslar loglari kontrol edelim",
      attachments: new Map(),
    },
    env.client
  );
  assert.strictEqual(env.playerUser._dms.length, beforeAdminMsgDms + 1);

  // Player writes in DM to bot -> forwarded anonymously to `anonim-5`!
  const beforePlayerReplySent = anon.channel._sent.length;
  const dmReplies = [];
  await manager.handleDirectMessage(
    {
      guild: null,
      author: env.playerUser,
      content: "Evet kanit linki burada.",
      attachments: new Map(),
      reference: null,
      async reply(txt) {
        dmReplies.push(txt);
      },
    },
    env.client
  );
  assert.strictEqual(anon.channel._sent.length, beforePlayerReplySent + 1);
  const bridgedToAdminsJson = JSON.stringify(
    anon.channel._sent[anon.channel._sent.length - 1].embeds[0].data
  );
  assert(bridgedToAdminsJson.includes("kanit linki burada"));
  assert(!bridgedToAdminsJson.includes(env.playerUser.id));
  assert(!bridgedToAdminsJson.includes(env.playerUser.username));

  // Close anonim-5 -> player gets DM notification AND subsequent player DM is rejected while closed!
  const dmsBeforeAnonClose = env.playerUser._dms.length;
  await manager.executeAdminAction({
    guild: env.guild,
    client: env.client,
    channel: anon.channel,
    actorMember: env.staffMember,
    actorUser: env.staffUser,
    action: "close",
  });
  assert.strictEqual(env.playerUser._dms.length, dmsBeforeAnonClose + 1);
  assert(
    env.playerUser._dms[env.playerUser._dms.length - 1].embeds[0].data.title.includes(
      "Kapatıldı"
    )
  );

  const closedReplies = [];
  const beforeClosedAttempt = anon.channel._sent.length;
  await manager.handleDirectMessage(
    {
      guild: null,
      author: env.playerUser,
      content: "kapaliyken mesaj",
      attachments: new Map(),
      reference: null,
      async reply(txt) {
        closedReplies.push(txt);
      },
    },
    env.client
  );
  assert.strictEqual(anon.channel._sent.length, beforeClosedAttempt);
  assert(closedReplies[0].includes("Kapalı"));

  console.log("[OK] Anonim Sikayet (anonim-5): Cift yonlu DM koprusu, sahip-ozel kimlik ve kapatma bildirimi dogrulandi.");

  // 6. Ticket Claim + 12-Hour Auto-Ping Reminder System (on dc-2)
  const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
  const staff2User = createUser("staff-102", "YetkiliEce");
  const staff2Member = {
    id: staff2User.id,
    displayName: "Yetkili Ece",
    user: staff2User,
    roles: { cache: env.staffMember.roles.cache },
    permissions: { has: () => false },
  };

  // Staff 1 claims dc-2
  const claimRes = await manager.executeAdminAction({
    guild: env.guild,
    client: env.client,
    channel: dc.channel,
    actorMember: env.staffMember,
    actorUser: env.staffUser,
    action: "claim",
  });
  assert.strictEqual(claimRes.ok, true);
  assert.strictEqual(dc.ticket.claimedById, env.staffUser.id);
  assert(dc.ticket.awaitingStaffSince > 0);
  // Top embed reflects claimed staff
  const claimedEmbedFields = dc.controlMsg.embeds[0].data.fields;
  const claimField = claimedEmbedFields.find((f) => f.name === "Üstlenen Yetkili");
  assert(claimField && claimField.value.includes(`<@${env.staffUser.id}>`));

  // Same staff trying to claim again -> ALREADY_CLAIMED_BY_YOU
  const dupClaim = await manager.executeAdminAction({
    guild: env.guild,
    client: env.client,
    channel: dc.channel,
    actorMember: env.staffMember,
    actorUser: env.staffUser,
    action: "claim",
  });
  assert.strictEqual(dupClaim.ok, false);
  assert.strictEqual(dupClaim.reason, "ALREADY_CLAIMED_BY_YOU");

  // Another non-admin staff trying to claim -> ALREADY_CLAIMED
  const stealClaim = await manager.executeAdminAction({
    guild: env.guild,
    client: env.client,
    channel: dc.channel,
    actorMember: staff2Member,
    actorUser: staff2User,
    action: "claim",
  });
  assert.strictEqual(stealClaim.ok, false);
  assert.strictEqual(stealClaim.reason, "ALREADY_CLAIMED");

  // 11 hours elapsed -> NO reminder yet
  const t0 = dc.ticket.awaitingStaffSince;
  const rem11h = await manager.checkClaimReminders(
    env.client,
    t0 + 11 * 60 * 60 * 1000
  );
  assert.strictEqual(rem11h.remindedCount, 0);

  // 12 hours + 1 min elapsed without staff replying -> bot PINGS <@staff-101>!
  const beforePingLen = dc.channel._sent.length;
  const rem12h = await manager.checkClaimReminders(
    env.client,
    t0 + TWELVE_HOURS_MS + 60_000
  );
  assert.strictEqual(rem12h.remindedCount, 1);
  assert.strictEqual(dc.channel._sent.length, beforePingLen + 1);
  const pingMsg = dc.channel._sent[dc.channel._sent.length - 1];
  assert.strictEqual(pingMsg.content, `<@${env.staffUser.id}>`);
  assert(pingMsg.embeds[0].data.description.includes("12 saattir"));

  // Checking again 5 minutes later -> NO duplicate spam!
  const remDup = await manager.checkClaimReminders(
    env.client,
    t0 + TWELVE_HOURS_MS + 6 * 60_000
  );
  assert.strictEqual(remDup.remindedCount, 0);

  // Claimed staff replies in dc-2 -> clock clears, NO reminder even 30 hours later while waiting for player!
  await manager.handleGuildMessage(
    {
      guild: env.guild,
      channel: dc.channel,
      author: env.staffUser,
      content: "Merhaba, rolunuzu hemen kontrol ediyorum.",
      attachments: new Map(),
    },
    env.client
  );
  assert.strictEqual(dc.ticket.awaitingStaffSince, null);
  const remAfterReply = await manager.checkClaimReminders(
    env.client,
    Date.now() + 30 * 60 * 60 * 1000
  );
  assert.strictEqual(remAfterReply.remindedCount, 0);

  // Player sends a new message in dc-2 -> 12h clock starts again -> ping after 12h!
  await manager.handleGuildMessage(
    {
      guild: env.guild,
      channel: dc.channel,
      author: env.playerUser,
      content: "Tesekkurler, hala gelmedi kontrol edebilir misiniz?",
      attachments: new Map(),
    },
    env.client
  );
  assert(dc.ticket.awaitingStaffSince > 0);
  const remSecondWave = await manager.checkClaimReminders(
    env.client,
    dc.ticket.awaitingStaffSince + TWELVE_HOURS_MS + 1000
  );
  assert.strictEqual(remSecondWave.remindedCount, 1);

  // Unclaim clears claimedById and prevents further reminders
  const unclaimRes = await manager.executeAdminAction({
    guild: env.guild,
    client: env.client,
    channel: dc.channel,
    actorMember: env.staffMember,
    actorUser: env.staffUser,
    action: "unclaim",
  });
  assert.strictEqual(unclaimRes.ok, true);
  assert.strictEqual(dc.ticket.claimedById, null);
  assert.strictEqual(dc.ticket.awaitingStaffSince, null);
  console.log("[OK] Talebi Ustlenme & 12 saat hatirlatici: Ustlenme, cevap sifirlama, 12 saatte etiket ve birakma dogrulandi.");

  // 7. New categories: Oneri Itirazi, Bug Raporu, Yonetim Sikayet
  const oneri = await manager.createTicketFromSubmission({
    guild: env.guild,
    client: env.client,
    openerUser: env.playerUser,
    categoryId: "oneri_itirazi",
    formDiscordUserId: env.playerUser.id,
    issueDescription: "Reddedilen onerime itiraz ediyorum.",
  });
  assert.strictEqual(oneri.channel.name, "oneri-6");

  const bug = await manager.createTicketFromSubmission({
    guild: env.guild,
    client: env.client,
    openerUser: env.playerUser,
    categoryId: "bug_raporu",
    formDiscordUserId: env.playerUser.id,
    issueDescription: "Rol verme komutu hata veriyor.",
  });
  assert.strictEqual(bug.channel.name, "bug-7");

  const ys = await manager.createTicketFromSubmission({
    guild: env.guild,
    client: env.client,
    openerUser: env.playerUser,
    categoryId: "yonetim_sikayet",
    formDiscordUserId: env.playerUser.id,
    issueDescription: "Yonetim uyesinden sikayetciyim.",
    reportedUsername: "yonetici_a",
  });
  assert.strictEqual(ys.channel.name, "yonetim-sikayet-8");

  // 8. Blacklist Kaldirma category: custom 3-field modal (ID, Blacklist Alma Sebebi, Blacklist Kaldirma Istegi Sebebi)
  let blModal = null;
  await manager.handleInteraction({
    customId: "ticket:select_category",
    values: ["blacklist_kaldirma"],
    user: env.playerUser,
    isButton: () => false,
    isStringSelectMenu: () => true,
    isModalSubmit: () => false,
    async showModal(m) {
      blModal = m;
    },
  });
  assert(blModal);
  const blFields = blModal.components.map((r) => r.components[0].data);
  assert.strictEqual(blFields.length, 3);
  assert.strictEqual(blFields[0].custom_id, "discord_user_id");
  assert.strictEqual(blFields[0].required, true);
  assert.strictEqual(blFields[1].custom_id, "blacklist_reason");
  assert.strictEqual(blFields[1].required, true);
  assert.strictEqual(blFields[2].custom_id, "blacklist_appeal_reason");
  assert.strictEqual(blFields[2].required, true);

  let blEditReply = null;
  await manager.handleInteraction({
    customId: "ticket:modal:blacklist_kaldirma:default",
    guild: env.guild,
    client: env.client,
    user: env.playerUser,
    isButton: () => false,
    isStringSelectMenu: () => false,
    isModalSubmit: () => true,
    fields: {
      getTextInputValue(k) {
        if (k === "discord_user_id") return env.playerUser.id;
        if (k === "blacklist_reason") return "Kural ihlali nedeniyle aldim.";
        if (k === "blacklist_appeal_reason") return "Hatami anladim, tekrarlamayacagim.";
        throw new Error(`Unexpected field: ${k}`);
      },
    },
    async deferReply() {},
    async editReply(msg) {
      blEditReply = msg;
    },
  });
  assert(blEditReply && blEditReply.includes("#9"));
  const blCh = env.guild.channels.cache.find((c) => c.name === "blacklist-9");
  assert(blCh);
  const blEmbedData = blCh._sent[0].embeds[0].data;
  assert(blEmbedData.description.includes("Blacklist Alma Sebebi"));
  assert(blEmbedData.description.includes("Kural ihlali nedeniyle aldim."));
  assert(blEmbedData.description.includes("Blacklist Kaldırma İsteği Sebebi"));
  assert(blEmbedData.description.includes("Hatami anladim"));
  assert.strictEqual(
    blEmbedData.fields.some((f) => f.name === "Şikayet Edilen Kişi"),
    false
  );
  console.log("[OK] Yeni kategoriler + Blacklist Kaldirma ozel formu (blacklist-9) ve Kurallar kaldirimi dogrulandi.");

  console.log("\nTUM TICKET TESTLERI BASARIYLA GECTI.");
}

runTicketTests().catch((err) => {
  console.error("\nTICKET TEST HATASI:", err);
  process.exit(1);
});
