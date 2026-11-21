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
  assert.strictEqual(catOptions.length, 8);

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
  console.log("\nTUM TICKET TESTLERI BASARIYLA GECTI.");
}

runTicketTests().catch((err) => {
  console.error("\nTICKET TEST HATASI:", err);
  process.exit(1);
});
