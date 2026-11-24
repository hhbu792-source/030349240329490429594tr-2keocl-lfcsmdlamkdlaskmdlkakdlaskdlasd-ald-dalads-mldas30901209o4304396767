const assert = require("assert");
const { ChannelType, PermissionFlagsBits } = require("discord.js");

const { TicketManager } = require("../src/tickets/ticketManager");
const {
  DEFAULT_TICKET_PANEL_CHANNEL_ID,
  DEFAULT_MANAGEMENT_ROLE_ID,
  DEFAULT_DISCORD_STAFF_ROLE_ID,
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

function hasOverwrite(overwrites, targetId, kind, permBit) {
  const ow = overwrites.find((o) => o.id === targetId);
  if (!ow) return false;
  const arr = ow[kind] || [];
  return arr.includes(permBit);
}

function createTicketMockEnv() {
  const channelsCache = new MockCollection();
  const rolesCache = new MockCollection();
  const usersMap = new Map();

  const everyoneRole = { id: "everyone-1", name: "@everyone" };
  rolesCache.set(everyoneRole.id, everyoneRole);

  const mgmtRole = { id: DEFAULT_MANAGEMENT_ROLE_ID, name: "Yonetim" };
  const staffRole = { id: DEFAULT_DISCORD_STAFF_ROLE_ID, name: "Discord Staff" };
  rolesCache.set(mgmtRole.id, mgmtRole);
  rolesCache.set(staffRole.id, staffRole);

  const ownerUser = createUser("owner-999", "SunucuSahibi");
  const mgmtUser = createUser("mgmt-100", "YoneticiAli");
  const staffUser = createUser("staff-101", "YetkiliCan");
  const playerUser = createUser("player-202", "OyuncuMert");
  const otherPlayerUser = createUser("player-303", "OyuncuSelin");

  for (const u of [ownerUser, mgmtUser, staffUser, playerUser, otherPlayerUser]) {
    usersMap.set(u.id, u);
  }

  const mgmtRoles = new MockCollection([[mgmtRole.id, mgmtRole]]);
  const staffRoles = new MockCollection([[staffRole.id, staffRole]]);

  const mgmtMember = {
    id: mgmtUser.id,
    displayName: "Yonetici Ali",
    user: mgmtUser,
    roles: { cache: mgmtRoles },
    permissions: { has: () => false },
  };
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
      async fetch(id) {
        return channelsCache.get(id) || null;
      },
      async create(opts) {
        return makeChannel(opts);
      },
    },
    members: {
      me: { id: "bot-self" },
      cache: new MockCollection([
        [ownerUser.id, { id: ownerUser.id, user: ownerUser }],
        [mgmtUser.id, mgmtMember],
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

  // Pre-create ALL 11 Discord category channels with exact IDs provided by user
  const categoryChannels = {};
  for (const cat of Object.values(TICKET_CATEGORIES)) {
    categoryChannels[cat.id] = makeChannel({
      id: cat.parentCategoryId,
      name: cat.label,
      type: ChannelType.GuildCategory,
    });
  }

  const client = {
    user: { id: "bot-self" },
    guilds: {
      cache: new MockCollection([[guild.id, guild]]),
    },
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
    categoryChannels,
    ownerUser,
    mgmtUser,
    mgmtMember,
    staffUser,
    staffMember,
    playerUser,
    playerMember,
    otherPlayerUser,
  };
}

async function runTicketTests() {
  console.log("=== THE COMPLEX Destek Merkezi (Ticket) Test Suite ===");

  const env = createTicketMockEnv();
  const manager = new TicketManager({
    persist: false,
    deleteDelayMs: 0,
  });

  // 1. Panel auto-post to channel 1573522477655654544: NO "Teknik Destek", NO "Kurallar", HAS "Bug Raporu" & "Blacklist Kaldırma"
  const panelMsg1 = await manager.ensurePanelMessage(env.client);
  assert(panelMsg1);
  assert.strictEqual(env.panelChannel._sent.length, 1);
  assert.strictEqual(panelMsg1.embeds[0].data.title, PANEL_TITLE);
  const desc = panelMsg1.embeds[0].data.description;
  assert(desc.includes("THE COMPLEX destek merkezine hoş geldiniz."));
  assert.strictEqual(desc.includes("Teknik Destek"), false);
  assert.strictEqual(desc.includes("**Kurallar**"), false);
  assert(desc.includes("Bug Raporu"));
  assert(desc.includes("Blacklist Kaldırma"));
  assert.strictEqual(panelMsg1.components[0].components[0].data.label, "Destek Aç");
  assert.strictEqual(panelMsg1.components[0].components[0].data.custom_id, "ticket:open");

  const panelMsg2 = await manager.ensurePanelMessage(env.client);
  assert.strictEqual(panelMsg2.id, panelMsg1.id);
  assert.strictEqual(env.panelChannel._sent.length, 1);
  assert.strictEqual(panelMsg1.editedCount, 1);
  console.log("[OK] Destek paneli: Teknik Destek kaldirildi, 11 kategori metni ve Destek Ac butonu dogrulandi.");

  // 2. Sync category permissions on ALL 11 Discord categories
  const syncedCatCount = await manager.syncCategoryPermissions(env.client);
  assert.strictEqual(syncedCatCount, 11);

  const expectedStaffCatIds = new Set(["text_rp", "discord", "sorun"]);
  for (const cat of Object.values(TICKET_CATEGORIES)) {
    const ch = env.categoryChannels[cat.id];
    // Every category hides from @everyone (so regular users only see categories with their own open tickets)
    assert(
      hasOverwrite(ch._overwrites, "everyone-1", "deny", PermissionFlagsBits.ViewChannel),
      `Category ${cat.id} must deny @everyone ViewChannel`
    );
    // Management (1573521638241345726) can view all 11 categories
    assert(
      hasOverwrite(ch._overwrites, DEFAULT_MANAGEMENT_ROLE_ID, "allow", PermissionFlagsBits.ViewChannel),
      `Category ${cat.id} must allow Management ViewChannel`
    );
    if (expectedStaffCatIds.has(cat.id)) {
      // Discord Staff (1573521880147820594) sees ONLY Text RP, Discord, Sorunum Var
      assert(
        hasOverwrite(ch._overwrites, DEFAULT_DISCORD_STAFF_ROLE_ID, "allow", PermissionFlagsBits.ViewChannel),
        `Staff category ${cat.id} must allow Discord Staff`
      );
    } else {
      // Discord Staff explicitly DENIED on all 8 management/anonymous categories!
      assert(
        hasOverwrite(ch._overwrites, DEFAULT_DISCORD_STAFF_ROLE_ID, "deny", PermissionFlagsBits.ViewChannel),
        `Management category ${cat.id} must deny Discord Staff`
      );
    }
  }
  console.log("[OK] 11 Discord kategori gizliligi: @everyone gizli, 3 staff + 8 yonetim kategori izinleri dogrulandi.");

  // 3. Category select menu: exact 11 categories, NO "teknik"
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
  const catOptions = replyPayload.components[0].components[0].options;
  assert.strictEqual(catOptions.length, 11);
  assert.strictEqual(catOptions.some((o) => o.data.value === "teknik"), false);
  assert(catOptions.some((o) => o.data.value === "bug_raporu"));
  assert(catOptions.some((o) => o.data.value === "blacklist_kaldirma"));

  // Selecting Text RP -> opens standard 3-field modal
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
  const modalFields = shownModal.components.map((r) => r.components[0].data);
  assert.strictEqual(modalFields.length, 3);
  assert.strictEqual(modalFields[0].custom_id, "discord_user_id");
  assert.strictEqual(modalFields[1].custom_id, "issue_description");
  assert.strictEqual(modalFields[2].custom_id, "reported_username");

  // Selecting Anonim Şikayet -> shows visibility chooser menu first
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
  assert.strictEqual(
    updatedVisibility.components[0].components[0].data.custom_id,
    "ticket:anon_visibility"
  );
  console.log("[OK] Menu ve Modal akisi: 11 kategori (Teknik Destek yok) + 3 alanli form + anonim gorunurluk dogrulandi.");

  // 4. Verify ALL 11 categories map to exact parentCategoryId & exact role permissions!
  const expectedParentMap = {
    text_rp: "1574482182020403210",
    discord: "1574482318737801216",
    sorun: "1574482768346357790",
    bug_raporu: "1574482604936134807",
    perma_ban: "1574482908746616893",
    yonetim: "1574483052590006413",
    yetkili_sikayet: "1574483508166922321",
    anonim_sikayet: "1574483609677602987",
    oneri_itirazi: "1574483714837053530",
    yonetim_sikayet: "1574483976624541697",
    blacklist_kaldirma: "1574484077069738174",
  };

  const createdTickets = {};
  for (const [catId, expectedParentId] of Object.entries(expectedParentMap)) {
    const res = await manager.createTicketFromSubmission({
      guild: env.guild,
      client: env.client,
      openerUser: env.playerUser,
      categoryId: catId,
      visibilityId: catId === "anonim_sikayet" ? "management_all" : null,
      formDiscordUserId: env.playerUser.id,
      issueDescription: `${catId} test talebi`,
      blacklistReason: catId === "blacklist_kaldirma" ? "Kural ihlali" : "",
      blacklistAppealReason: catId === "blacklist_kaldirma" ? "Pismanim" : "",
    });
    createdTickets[catId] = res;

    // Exact Discord category channel ID!
    assert.strictEqual(
      res.channel.parentId,
      expectedParentId,
      `${catId} must be created inside category ${expectedParentId}`
    );
    // @everyone denied ViewChannel
    assert(
      hasOverwrite(res.channel._overwrites, "everyone-1", "deny", PermissionFlagsBits.ViewChannel)
    );
    // Other regular players NEVER get access
    assert.strictEqual(
      res.channel._overwrites.some((o) => o.id === env.otherPlayerUser.id),
      false
    );
    // Management (1573521638241345726) ALWAYS allowed (for default management_all)
    assert(
      hasOverwrite(res.channel._overwrites, DEFAULT_MANAGEMENT_ROLE_ID, "allow", PermissionFlagsBits.ViewChannel),
      `${catId} must allow Management`
    );

    if (catId === "anonim_sikayet") {
      // Opener NOT in channel overwrites, Discord Staff DENIED
      assert.strictEqual(
        res.channel._overwrites.some((o) => o.id === env.playerUser.id),
        false
      );
      assert(
        hasOverwrite(res.channel._overwrites, DEFAULT_DISCORD_STAFF_ROLE_ID, "deny", PermissionFlagsBits.ViewChannel)
      );
    } else {
      // Opener ALLOWED to see ONLY their own ticket
      assert(
        hasOverwrite(res.channel._overwrites, env.playerUser.id, "allow", PermissionFlagsBits.ViewChannel)
      );
      if (expectedStaffCatIds.has(catId)) {
        // Discord Staff (1573521880147820594) ALLOWED on Text RP, Discord, Sorunum Var
        assert(
          hasOverwrite(res.channel._overwrites, DEFAULT_DISCORD_STAFF_ROLE_ID, "allow", PermissionFlagsBits.ViewChannel),
          `${catId} must allow Discord Staff`
        );
      } else {
        // Discord Staff (1573521880147820594) EXPLICITLY DENIED on all 7 non-anon management categories!
        assert(
          hasOverwrite(res.channel._overwrites, DEFAULT_DISCORD_STAFF_ROLE_ID, "deny", PermissionFlagsBits.ViewChannel),
          `${catId} must deny Discord Staff`
        );
      }
    }
  }
  console.log("[OK] 11 kategori yonlendirmesi: Tum kategoriler tam Discord ID altinda ve dogru Yonetim/Staff izinleriyle acildi.");

  // 5. Role enforcement on Admin Control Menu:
  // Normal Discord Staff CANNOT use admin menu on Management ticket (e.g. bug_raporu / blacklist_kaldirma)!
  const bugTicket = createdTickets.bug_raporu;
  let staffDeniedMgmt = null;
  await manager.handleInteraction({
    customId: `ticket:admin_action:${bugTicket.channel.id}`,
    values: ["claim"],
    guild: env.guild,
    client: env.client,
    channel: bugTicket.channel,
    user: env.staffUser,
    member: env.staffMember,
    memberPermissions: { has: () => false },
    isButton: () => false,
    isStringSelectMenu: () => true,
    isModalSubmit: () => false,
    async reply(p) {
      staffDeniedMgmt = p;
    },
  });
  assert(staffDeniedMgmt && staffDeniedMgmt.content.includes("yetkili ekip"));

  // Management CAN use admin menu on bug_raporu!
  let mgmtReply = null;
  await manager.handleInteraction({
    customId: `ticket:admin_action:${bugTicket.channel.id}`,
    values: ["claim"],
    guild: env.guild,
    client: env.client,
    channel: bugTicket.channel,
    user: env.mgmtUser,
    member: env.mgmtMember,
    memberPermissions: { has: () => false },
    isButton: () => false,
    isStringSelectMenu: () => true,
    isModalSubmit: () => false,
    async deferReply() {},
    async editReply(msg) {
      mgmtReply = msg;
    },
  });
  assert(mgmtReply && mgmtReply.includes("üzerinize alındı"));

  // Normal Discord Staff CAN manage Text RP ticket, and escalating removes Discord Staff access!
  const trp = createdTickets.text_rp;
  const prevPlayerDms = env.playerUser._dms.length;
  for (const act of ["escalate", "hold", "reopen", "resolve", "close"]) {
    const res = await manager.executeAdminAction({
      guild: env.guild,
      client: env.client,
      channel: trp.channel,
      actorMember: env.mgmtMember,
      actorUser: env.mgmtUser,
      action: act,
    });
    assert.strictEqual(res.ok, true);
  }
  assert.strictEqual(trp.ticket.escalated, true);
  // After escalation, Discord Staff is explicitly denied ViewChannel on trp-1!
  assert(
    hasOverwrite(trp.channel._overwrites, DEFAULT_DISCORD_STAFF_ROLE_ID, "deny", PermissionFlagsBits.ViewChannel)
  );
  assert(
    hasOverwrite(trp.channel._overwrites, DEFAULT_MANAGEMENT_ROLE_ID, "allow", PermissionFlagsBits.ViewChannel)
  );
  assert.strictEqual(env.playerUser._dms.length, prevPlayerDms + 5);

  const delRes = await manager.executeAdminAction({
    guild: env.guild,
    client: env.client,
    channel: trp.channel,
    actorMember: env.mgmtMember,
    actorUser: env.mgmtUser,
    action: "delete",
  });
  assert.strictEqual(delRes.ok, true);
  assert.strictEqual(trp.channel.deleted, true);
  console.log("[OK] Yetki ayrimi & Yonetim menusu: Discord Staff yonetim taleplerine erisemez, aktarimda erisimi kesilir.");

  // 6. Anonymous Ticket DM Bridge + Owner-only identity reveal
  const anon = createdTickets.anonim_sikayet;
  assert.strictEqual(anon.openerDmSent, true);
  const anonEmbedJson = JSON.stringify(anon.controlMsg.embeds[0].data);
  assert(!anonEmbedJson.includes(env.playerUser.id));
  assert(anonEmbedJson.includes("Anonim Kullanıcı"));

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

  const beforePlayerReplySent = anon.channel._sent.length;
  await manager.handleDirectMessage(
    {
      guild: null,
      author: env.playerUser,
      content: "Anonim kanit mesaji",
      attachments: new Map(),
      reference: null,
      async reply() {},
    },
    env.client
  );
  assert.strictEqual(anon.channel._sent.length, beforePlayerReplySent + 1);
  console.log("[OK] Anonim Sikayet (1574483609677602987): DM koprusu ve sahip-ozel kimlik dogrulandi.");

  // 7. Claim + 12-Hour Auto-Ping Reminder on Discord ticket (dc)
  const dc = createdTickets.discord;
  const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
  const claimRes = await manager.executeAdminAction({
    guild: env.guild,
    client: env.client,
    channel: dc.channel,
    actorMember: env.staffMember,
    actorUser: env.staffUser,
    action: "claim",
  });
  assert.strictEqual(claimRes.ok, true);
  const t0 = dc.ticket.awaitingStaffSince;
  // Both claimed open tickets (bug_raporu by mgmtUser + discord by staffUser) trigger 12h reminder!
  const rem12h = await manager.checkClaimReminders(
    env.client,
    t0 + TWELVE_HOURS_MS + 60_000
  );
  assert.strictEqual(rem12h.remindedCount, 2);
  assert.strictEqual(
    dc.channel._sent[dc.channel._sent.length - 1].content,
    `<@${env.staffUser.id}>`
  );
  assert.strictEqual(
    bugTicket.channel._sent[bugTicket.channel._sent.length - 1].content,
    `<@${env.mgmtUser.id}>`
  );

  await manager.handleGuildMessage(
    {
      guild: env.guild,
      channel: dc.channel,
      author: env.staffUser,
      content: "Inceliyorum.",
      attachments: new Map(),
    },
    env.client
  );
  assert.strictEqual(dc.ticket.awaitingStaffSince, null);

  // 8. Blacklist Kaldirma custom 3-field modal + syncExistingTickets across all 11 categories!
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
  const blFields = blModal.components.map((r) => r.components[0].data);
  assert.strictEqual(blFields.length, 3);
  assert.strictEqual(blFields[0].custom_id, "discord_user_id");
  assert.strictEqual(blFields[1].custom_id, "blacklist_reason");
  assert.strictEqual(blFields[2].custom_id, "blacklist_appeal_reason");

  // Startup recovery sync across all 11 categories (10 remaining open tickets after trp deleted)
  const syncedCount = await manager.syncExistingTickets(env.client);
  assert.strictEqual(syncedCount, 10);
  console.log("[OK] Ustlenme, 12 saat hatirlatici, Blacklist formu ve 11 kategori acilis senkronizasyonu dogrulandi.");

  console.log("\nTUM TICKET TESTLERI BASARIYLA GECTI.");
}

runTicketTests().catch((err) => {
  console.error("\nTICKET TEST HATASI:", err);
  process.exit(1);
});
