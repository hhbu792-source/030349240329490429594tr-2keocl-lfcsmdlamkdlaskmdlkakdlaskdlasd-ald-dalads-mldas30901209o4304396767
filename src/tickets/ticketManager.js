const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const {
  DEFAULT_TICKET_PANEL_CHANNEL_ID,
  DEFAULT_TICKET_STAFF_ROLE_IDS,
  PANEL_TITLE,
  PANEL_DESCRIPTION,
  TICKET_CATEGORIES,
  ANONYMOUS_VISIBILITY_OPTIONS,
  TICKET_STATUS_LABELS,
  TICKET_STATUS_COLORS,
  ADMIN_MENU_ACTIONS,
} = require("./constants");
const { TicketStore } = require("./ticketStore");

function truncate(text, max) {
  const s = String(text || "");
  return s.length > max ? `${s.slice(0, max - 3)}...` : s;
}

class TicketManager {
  constructor(options = {}) {
    this.store =
      options.store ||
      new TicketStore({
        persist: options.persist !== false,
        filePath: options.stateFilePath,
      });
    this.panelChannelId =
      options.panelChannelId || DEFAULT_TICKET_PANEL_CHANNEL_ID;
    this.ticketCategoryName = options.ticketCategoryName || "DESTEK TALEPLERİ";
    this.staffRoleIds =
      options.staffRoleIds && options.staffRoleIds.length > 0
        ? [...options.staffRoleIds]
        : [...DEFAULT_TICKET_STAFF_ROLE_IDS];
    this.managementRoleIds =
      options.managementRoleIds && options.managementRoleIds.length > 0
        ? [...options.managementRoleIds]
        : [...this.staffRoleIds];
    this.upperManagementRoleIds =
      options.upperManagementRoleIds && options.upperManagementRoleIds.length > 0
        ? [...options.upperManagementRoleIds]
        : [];
    this.deleteDelayMs = options.deleteDelayMs ?? 5000;
    this.snapshotManager = options.snapshotManager || null;
    this.logger = options.logger || console;

    /** Map<dmMessageId, { guildId: string, channelId: string }> */
    this.anonDmIndex = new Map();
  }

  isStaffMember(guild, member, permissions) {
    if (!guild) return false;
    const userId = member?.id || member?.user?.id;
    if (userId && guild.ownerId === userId) return true;
    if (permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
    if (member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
      return true;
    }

    const allowedRoles = new Set([
      ...this.staffRoleIds,
      ...this.managementRoleIds,
      ...this.upperManagementRoleIds,
    ]);

    if (member?.roles?.cache) {
      for (const rid of allowedRoles) {
        if (member.roles.cache.has(rid)) return true;
      }
    } else if (Array.isArray(member?.roles)) {
      for (const rid of allowedRoles) {
        if (member.roles.includes(rid)) return true;
      }
    }
    return false;
  }

  buildPanelPayload() {
    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle(PANEL_TITLE)
      .setDescription(PANEL_DESCRIPTION)
      .setFooter({ text: "THE COMPLEX Destek Merkezi" });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket:open")
        .setLabel("Destek Aç")
        .setStyle(ButtonStyle.Primary)
    );

    return { embeds: [embed], components: [row] };
  }

  async sendPanelToChannel(channel) {
    const payload = this.buildPanelPayload();
    const msg = await channel.send(payload);
    if (channel.guild) {
      this.store.setPanelMessage(channel.guild.id, channel.id, msg.id);
    }
    return msg;
  }

  /**
   * Ensure the THE COMPLEX Destek Merkezi panel exists in the configured channel (1573522477655654544)
   * without duplicating on restarts.
   */
  async ensurePanelMessage(client) {
    if (!this.panelChannelId) return null;

    let channel = client.channels?.cache?.get(this.panelChannelId);
    if (!channel && typeof client.channels?.fetch === "function") {
      channel = await client.channels
        .fetch(this.panelChannelId)
        .catch(() => null);
    }
    if (!channel || !channel.guild) {
      this.logger.warn(
        `[TICKET] Destek panel kanali bulunamadi: ${this.panelChannelId}`
      );
      return null;
    }

    const g = this.store.getGuild(channel.guild.id);
    const payload = this.buildPanelPayload();

    // 1. Try editing existing saved panel message
    if (g.panelChannelId === channel.id && g.panelMessageId && channel.messages?.fetch) {
      const existing = await channel.messages
        .fetch(g.panelMessageId)
        .catch(() => null);
      if (existing && typeof existing.edit === "function") {
        await existing.edit(payload).catch(() => {});
        return existing;
      }
    }

    // 2. Scan recent messages to avoid duplicating after fresh state
    if (channel.messages?.fetch) {
      const recent = await channel.messages.fetch({ limit: 15 }).catch(() => null);
      if (recent) {
        const botId = client.user?.id;
        for (const m of recent.values()) {
          if (
            m.author?.id === botId &&
            m.embeds?.[0]?.title === PANEL_TITLE
          ) {
            await m.edit(payload).catch(() => {});
            this.store.setPanelMessage(channel.guild.id, channel.id, m.id);
            return m;
          }
        }
      }
    }

    // 3. Send fresh panel message
    return this.sendPanelToChannel(channel);
  }

  buildCategorySelectRow() {
    const menu = new StringSelectMenuBuilder()
      .setCustomId("ticket:select_category")
      .setPlaceholder("Destek kategorisi seçin...")
      .addOptions(
        Object.values(TICKET_CATEGORIES).map((cat) => ({
          label: cat.label,
          value: cat.id,
          description: truncate(cat.description, 100),
        }))
      );
    return new ActionRowBuilder().addComponents(menu);
  }

  buildAnonVisibilityRow() {
    const menu = new StringSelectMenuBuilder()
      .setCustomId("ticket:anon_visibility")
      .setPlaceholder("Şikayeti kimlerin görebileceğini seçin...")
      .addOptions(
        Object.values(ANONYMOUS_VISIBILITY_OPTIONS).map((opt) => ({
          label: opt.label,
          value: opt.id,
          description: truncate(opt.description, 100),
        }))
      );
    return new ActionRowBuilder().addComponents(menu);
  }

  buildTicketModal(categoryId, visibilityId, userId) {
    const cat = TICKET_CATEGORIES[categoryId];
    const vis = visibilityId || "default";
    const modal = new ModalBuilder()
      .setCustomId(`ticket:modal:${categoryId}:${vis}`)
      .setTitle(truncate(`${cat.label} - Destek Formu`, 45));

    const userIdInput = new TextInputBuilder()
      .setCustomId("discord_user_id")
      .setLabel("Discord User ID")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder(`Örn: ${userId || "123456789012345678"}`)
      .setMaxLength(32);

    const issueInput = new TextInputBuilder()
      .setCustomId("issue_description")
      .setLabel("Sorununuz / Talebiniz")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setPlaceholder("Sorununuzu veya talebinizi açık ve detaylı şekilde yazın.")
      .setMaxLength(1500);

    const reportedInput = new TextInputBuilder()
      .setCustomId("reported_username")
      .setLabel("Şikayet Edilen Kişi Kullanıcı Adı (Opsiyonel)")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setPlaceholder("Varsa şikayet edilen kişinin kullanıcı adı (boş bırakılabilir)")
      .setMaxLength(100);

    modal.addComponents(
      new ActionRowBuilder().addComponents(userIdInput),
      new ActionRowBuilder().addComponents(issueInput),
      new ActionRowBuilder().addComponents(reportedInput)
    );
    return modal;
  }

  buildTicketControlEmbed(ticket) {
    const cat = TICKET_CATEGORIES[ticket.categoryId] || {
      label: ticket.categoryLabel || "Destek",
    };
    const statusLabel = TICKET_STATUS_LABELS[ticket.status] || ticket.status;
    const color = TICKET_STATUS_COLORS[ticket.status] || 0x2c3e50;

    const fields = [
      { name: "Talep No", value: `#${ticket.number}`, inline: true },
      { name: "Kategori", value: cat.label, inline: true },
      {
        name: "Durum",
        value: ticket.escalated
          ? `${statusLabel} (Yönetime Aktarıldı)`
          : statusLabel,
        inline: true,
      },
    ];

    if (ticket.anonymous) {
      const visObj =
        ANONYMOUS_VISIBILITY_OPTIONS[ticket.visibility] ||
        ANONYMOUS_VISIBILITY_OPTIONS.management_all;
      fields.push(
        {
          name: "Talebi Açan",
          value: "Anonim Kullanıcı (Kimliği yalnızca Sunucu Sahibi görebilir)",
          inline: true,
        },
        {
          name: "Seçilen Görünürlük",
          value: visObj.label,
          inline: true,
        }
      );
    } else {
      fields.push(
        {
          name: "Talebi Açan",
          value: `<@${ticket.openerId}> (\`${ticket.openerId}\`)`,
          inline: true,
        },
        {
          name: "Form Discord User ID",
          value: `\`${ticket.formDiscordUserId}\``,
          inline: true,
        }
      );
    }

    if (ticket.reportedUsername) {
      fields.push({
        name: "Şikayet Edilen Kişi",
        value: truncate(ticket.reportedUsername, 256),
        inline: true,
      });
    }

    const descLines = [
      "**Sorun / Talep Açıklaması:**",
      truncate(ticket.issueDescription, 2000),
    ];

    if (ticket.anonymous) {
      descLines.push(
        "",
        "**Anonim DM Köprüsü:**",
        "Bu kanala yazdığınız normal mesajlar bot üzerinden kullanıcıya anonim olarak DM iletilir. Kullanıcı bota DM yazdığında mesajı bu kanala anonim olarak düşer. Sadece ekip içi not bırakmak için mesajın başına `//` yazın."
      );
    }

    return new EmbedBuilder()
      .setColor(color)
      .setTitle(
        ticket.anonymous
          ? `Anonim Talep #${ticket.number} - ${cat.label}`
          : `Destek Talebi #${ticket.number} - ${cat.label}`
      )
      .setDescription(descLines.join("\n"))
      .addFields(fields)
      .setFooter({ text: `THE COMPLEX Destek Merkezi | Talep #${ticket.number}` })
      .setTimestamp(ticket.createdAt);
  }

  buildTicketControlComponents(ticket) {
    const adminMenu = new StringSelectMenuBuilder()
      .setCustomId(`ticket:admin_action:${ticket.channelId}`)
      .setPlaceholder("Yönetim Menüsü: İşlem seçin...")
      .addOptions(
        ADMIN_MENU_ACTIONS.map((a) => ({
          label: a.label,
          value: a.value,
          description: a.description,
        }))
      );

    const rows = [new ActionRowBuilder().addComponents(adminMenu)];

    if (ticket.anonymous) {
      const ownerBtn = new ButtonBuilder()
        .setCustomId(`ticket:reveal_identity:${ticket.channelId}`)
        .setLabel("Kimliği Gör (Sadece Sunucu Sahibi)")
        .setStyle(ButtonStyle.Secondary);
      rows.push(new ActionRowBuilder().addComponents(ownerBtn));
    }

    return rows;
  }

  async _ensureTicketCategory(guild) {
    const target = this.ticketCategoryName.toLowerCase();
    const existing = guild.channels.cache.find(
      (ch) =>
        ch.type === ChannelType.GuildCategory &&
        ch.name.trim().toLowerCase() === target
    );
    if (existing) return existing;

    this.snapshotManager?.markSelfAction(
      `channelCreate:${guild.id}:${this.ticketCategoryName}`,
      10_000
    );
    return guild.channels.create({
      name: this.ticketCategoryName,
      type: ChannelType.GuildCategory,
      reason: "THE COMPLEX Destek Merkezi kategorisi olusturuldu",
    });
  }

  _buildChannelOverwrites(guild, { openerId, category, visibility, escalated }) {
    const overwrites = [];

    if (guild.roles?.everyone?.id) {
      overwrites.push({
        id: guild.roles.everyone.id,
        deny: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
        ],
      });
    }

    const botId = guild.members?.me?.id || guild.client?.user?.id;
    if (botId) {
      overwrites.push({
        id: botId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
        ],
      });
    }

    const staffAllow = [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.ManageMessages,
    ];

    let roleIdsToGrant = [];

    if (category.anonymous) {
      // Opener NEVER gets channel access to anonim-numara
      if (visibility === "owner_only") {
        roleIdsToGrant = [];
      } else if (visibility === "upper_only") {
        roleIdsToGrant = this.upperManagementRoleIds;
      } else {
        roleIdsToGrant = this.managementRoleIds;
      }
    } else {
      // Standard ticket: opener sees the channel
      overwrites.push({
        id: openerId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
        ],
      });

      if (escalated) {
        // When escalated: if distinct management roles exist, keep only them; otherwise admin-only
        const isDistinctManagement =
          this.managementRoleIds.length < this.staffRoleIds.length ||
          this.managementRoleIds.some((r) => !this.staffRoleIds.includes(r));
        roleIdsToGrant = isDistinctManagement
          ? this.managementRoleIds
          : this.upperManagementRoleIds;
      } else if (category.accessTier === "management") {
        roleIdsToGrant = this.managementRoleIds;
      } else {
        roleIdsToGrant = this.staffRoleIds;
      }
    }

    const seen = new Set(overwrites.map((o) => o.id));
    for (const rid of roleIdsToGrant) {
      if (!rid || seen.has(rid)) continue;
      if (guild.roles?.cache && !guild.roles.cache.has(rid)) continue;
      seen.add(rid);
      overwrites.push({
        id: rid,
        allow: staffAllow,
      });
    }

    return overwrites;
  }

  async _notifyOpenerDm(client, ticket, { title, description, color }) {
    let user = null;
    if (client?.users?.fetch) {
      user = await client.users.fetch(ticket.openerId).catch(() => null);
    } else if (client?.users?.cache?.get) {
      user = client.users.cache.get(ticket.openerId) || null;
    }
    if (!user || typeof user.send !== "function") return null;

    const embed = new EmbedBuilder()
      .setColor(color || 0x2c3e50)
      .setTitle(title)
      .setDescription(description)
      .setFooter({
        text: `THE COMPLEX Destek Merkezi | Talep #${ticket.number}`,
      })
      .setTimestamp();

    const sent = await user.send({ embeds: [embed] }).catch(() => null);
    if (sent && ticket.anonymous) {
      this.anonDmIndex.set(sent.id, {
        guildId: ticket.guildId,
        channelId: ticket.channelId,
      });
    }
    return sent;
  }

  async _notifyOwnerAnonIdentity(guild, client, ticket) {
    if (!guild?.ownerId) return;
    let ownerUser = null;
    if (client?.users?.fetch) {
      ownerUser = await client.users.fetch(guild.ownerId).catch(() => null);
    } else if (guild.members?.cache?.get) {
      ownerUser = guild.members.cache.get(guild.ownerId)?.user || null;
    }
    if (!ownerUser || typeof ownerUser.send !== "function") return;

    const embed = new EmbedBuilder()
      .setColor(0x2c3e50)
      .setTitle(`Anonim Talep #${ticket.number} - Kimlik Kaydı (Sadece Sunucu Sahibi)`)
      .setDescription(
        `Yeni bir anonim şikayet açıldı: <#${ticket.channelId}>`
      )
      .addFields(
        {
          name: "Gerçek Kullanıcı",
          value: `<@${ticket.openerId}> (${ticket.openerTag || ticket.openerId})`,
          inline: true,
        },
        {
          name: "Form Discord User ID",
          value: `\`${ticket.formDiscordUserId}\``,
          inline: true,
        },
        {
          name: "Şikayet Edilen Kişi",
          value: ticket.reportedUsername || "Belirtilmedi",
          inline: true,
        }
      )
      .setFooter({ text: "Bu bilgi yalnızca Sunucu Sahibine iletilir." })
      .setTimestamp();

    await ownerUser.send({ embeds: [embed] }).catch(() => {});
  }

  async createTicketFromSubmission({
    guild,
    client,
    openerUser,
    categoryId,
    visibilityId = null,
    formDiscordUserId,
    issueDescription,
    reportedUsername = "",
  }) {
    const category = TICKET_CATEGORIES[categoryId];
    if (!category) {
      throw new Error(`Gecersiz kategori: ${categoryId}`);
    }

    const ticketNumber = this.store.nextTicketNumber(guild.id);
    const parentCategory = await this._ensureTicketCategory(guild);
    const channelName = `${category.channelPrefix}-${ticketNumber}`;
    const visibility = category.anonymous
      ? visibilityId || "management_all"
      : null;

    const overwrites = this._buildChannelOverwrites(guild, {
      openerId: openerUser.id,
      category,
      visibility,
      escalated: false,
    });

    this.snapshotManager?.markSelfAction(
      `channelCreate:${guild.id}:${channelName}`,
      10_000
    );

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: parentCategory.id,
      topic: `[TICKET:#${ticketNumber}] Kategori: ${category.label} | Durum: Acik`,
      permissionOverwrites: overwrites,
      reason: `Destek talebi #${ticketNumber} (${category.label})`,
    });

    this.snapshotManager?.markSelfAction(`channel:${channel.id}`, 10_000);

    const ticket = {
      number: ticketNumber,
      guildId: guild.id,
      channelId: channel.id,
      channelName: channel.name,
      categoryId: category.id,
      categoryLabel: category.label,
      anonymous: Boolean(category.anonymous),
      visibility,
      openerId: openerUser.id,
      openerTag: openerUser.tag || openerUser.username,
      formDiscordUserId: String(formDiscordUserId || "").trim(),
      issueDescription: String(issueDescription || "").trim(),
      reportedUsername: String(reportedUsername || "").trim() || null,
      status: "open",
      escalated: false,
      controlMessageId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const controlMsg = await channel.send({
      content: ticket.anonymous
        ? `Yeni **Anonim Şikayet #${ticketNumber}** oluşturuldu.`
        : `<@${openerUser.id}> destek talebiniz açıldı.`,
      embeds: [this.buildTicketControlEmbed(ticket)],
      components: this.buildTicketControlComponents(ticket),
      allowedMentions: ticket.anonymous ? { parse: [] } : { users: [openerUser.id] },
    });

    if (controlMsg && typeof controlMsg.pin === "function") {
      await controlMsg.pin().catch(() => {});
    }

    ticket.controlMessageId = controlMsg?.id || null;
    this.store.saveTicket(guild.id, ticket);

    // For anonymous tickets, initiate DM session with opener & send confidential identity DM to Server Owner
    let openerDmSent = false;
    if (ticket.anonymous) {
      const dm = await this._notifyOpenerDm(client, ticket, {
        title: `Anonim Şikayet #${ticket.number} Oluşturuldu`,
        description: [
          "Anonim şikayetiniz yönetime iletildi.",
          "",
          "Yönetimle olan tüm görüşmeniz bu DM üzerinden anonim olarak yapılacaktır. Yazdığınız mesajlar ve eklediğiniz ekran görüntüleri kimliğiniz gizlenerek yönetime aktarılır.",
          "",
          `**Talebiniz:** ${truncate(ticket.issueDescription, 1000)}`,
        ].join("\n"),
        color: 0x2ecc71,
      });
      openerDmSent = Boolean(dm);
      await this._notifyOwnerAnonIdentity(guild, client, ticket);
    }

    return { ticket, channel, controlMsg, openerDmSent };
  }

  async _refreshControlMessage(channel, ticket) {
    if (!ticket.controlMessageId || !channel?.messages?.fetch) return;
    const msg = await channel.messages
      .fetch(ticket.controlMessageId)
      .catch(() => null);
    if (!msg || typeof msg.edit !== "function") return;

    await msg
      .edit({
        embeds: [this.buildTicketControlEmbed(ticket)],
        components: this.buildTicketControlComponents(ticket),
      })
      .catch(() => {});
  }

  async executeAdminAction({ guild, client, channel, actorMember, actorUser, action }) {
    const ticket = this.store.getTicketByChannel(guild.id, channel.id);
    if (!ticket) {
      return { ok: false, reason: "NOT_A_TICKET" };
    }

    const category = TICKET_CATEGORIES[ticket.categoryId] || {
      label: ticket.categoryLabel,
      anonymous: ticket.anonymous,
      accessTier: "staff",
    };
    const actorTag = actorMember?.displayName || actorUser.username || "Yetkili";

    if (action === "escalate") {
      ticket.escalated = true;
      ticket.updatedAt = Date.now();

      const overwrites = this._buildChannelOverwrites(guild, {
        openerId: ticket.openerId,
        category,
        visibility: ticket.anonymous ? "upper_only" : null,
        escalated: true,
      });

      this.snapshotManager?.markSelfAction(`channelUpdate:${channel.id}`, 10_000);
      if (channel.permissionOverwrites?.set) {
        await channel.permissionOverwrites
          .set(overwrites, `Talep #${ticket.number} yonetim ekibine aktarildi`)
          .catch(() => {});
      }

      this.store.saveTicket(guild.id, ticket);
      await this._refreshControlMessage(channel, ticket);

      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe67e22)
            .setDescription(
              `Talep #${ticket.number}, **${actorTag}** tarafından yönetime aktarıldı.`
            ),
        ],
      });

      await this._notifyOpenerDm(client, ticket, {
        title: `Talep #${ticket.number} - Yönetime Aktarıldı`,
        description:
          "Destek talebiniz değerlendirilmek üzere yönetim ekibine aktarıldı.",
        color: 0xe67e22,
      });

      return { ok: true, action, ticket };
    }

    if (action === "close") {
      ticket.status = "closed";
      ticket.updatedAt = Date.now();
      this.store.saveTicket(guild.id, ticket);

      if (!ticket.anonymous && channel.permissionOverwrites?.edit) {
        this.snapshotManager?.markSelfAction(`channelUpdate:${channel.id}`, 10_000);
        await channel.permissionOverwrites
          .edit(
            ticket.openerId,
            { SendMessages: false },
            { reason: `Talep #${ticket.number} kapatildi` }
          )
          .catch(() => {});
      }

      await this._refreshControlMessage(channel, ticket);
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x7f8c8d)
            .setDescription(
              `Talep #${ticket.number}, **${actorTag}** tarafından kapatıldı. Kullanıcıya DM üzerinden bilgi gönderildi.`
            ),
        ],
      });

      await this._notifyOpenerDm(client, ticket, {
        title: `Talep #${ticket.number} Kapatıldı`,
        description: `**${ticket.categoryLabel}** kategorisindeki #${ticket.number} numaralı destek talebiniz kapatılmıştır.`,
        color: 0x7f8c8d,
      });

      return { ok: true, action, ticket };
    }

    if (action === "hold") {
      ticket.status = "on_hold";
      ticket.updatedAt = Date.now();
      this.store.saveTicket(guild.id, ticket);

      if (!ticket.anonymous && channel.permissionOverwrites?.edit) {
        this.snapshotManager?.markSelfAction(`channelUpdate:${channel.id}`, 10_000);
        await channel.permissionOverwrites
          .edit(
            ticket.openerId,
            { SendMessages: false },
            { reason: `Talep #${ticket.number} askiya alindi` }
          )
          .catch(() => {});
      }

      await this._refreshControlMessage(channel, ticket);
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xf1c40f)
            .setDescription(
              `Talep #${ticket.number}, **${actorTag}** tarafından askıya alındı.`
            ),
        ],
      });

      await this._notifyOpenerDm(client, ticket, {
        title: `Talep #${ticket.number} Askıya Alındı`,
        description: `**${ticket.categoryLabel}** kategorisindeki #${ticket.number} numaralı talebiniz inceleme süresince geçici olarak askıya alındı.`,
        color: 0xf1c40f,
      });

      return { ok: true, action, ticket };
    }

    if (action === "reopen") {
      ticket.status = "open";
      ticket.updatedAt = Date.now();
      this.store.saveTicket(guild.id, ticket);

      if (!ticket.anonymous && channel.permissionOverwrites?.edit) {
        this.snapshotManager?.markSelfAction(`channelUpdate:${channel.id}`, 10_000);
        await channel.permissionOverwrites
          .edit(
            ticket.openerId,
            {
              ViewChannel: true,
              SendMessages: true,
              ReadMessageHistory: true,
              AttachFiles: true,
            },
            { reason: `Talep #${ticket.number} geri acildi` }
          )
          .catch(() => {});
      }

      await this._refreshControlMessage(channel, ticket);
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x2ecc71)
            .setDescription(
              `Talep #${ticket.number}, **${actorTag}** tarafından tekrar açıldı.`
            ),
        ],
      });

      await this._notifyOpenerDm(client, ticket, {
        title: `Talep #${ticket.number} Yeniden Açıldı`,
        description: ticket.anonymous
          ? `#${ticket.number} numaralı anonim talebiniz yeniden açıldı. Bu DM üzerinden yazmaya devam edebilirsiniz.`
          : `#${ticket.number} numaralı destek talebiniz yeniden açıldı (<#${ticket.channelId}>).`,
        color: 0x2ecc71,
      });

      return { ok: true, action, ticket };
    }

    if (action === "resolve") {
      ticket.status = "resolved";
      ticket.updatedAt = Date.now();
      this.store.saveTicket(guild.id, ticket);

      if (!ticket.anonymous && channel.permissionOverwrites?.edit) {
        this.snapshotManager?.markSelfAction(`channelUpdate:${channel.id}`, 10_000);
        await channel.permissionOverwrites
          .edit(
            ticket.openerId,
            { SendMessages: false },
            { reason: `Talep #${ticket.number} cozuldu` }
          )
          .catch(() => {});
      }

      await this._refreshControlMessage(channel, ticket);
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x3498db)
            .setDescription(
              `Talep #${ticket.number}, **${actorTag}** tarafından **Çözüldü** olarak işaretlendi. Kullanıcıya DM iletildi.`
            ),
        ],
      });

      await this._notifyOpenerDm(client, ticket, {
        title: `Talep #${ticket.number} Çözüldü`,
        description: `**${ticket.categoryLabel}** kategorisindeki #${ticket.number} numaralı destek talebiniz çözüldü olarak işaretlendi. Başka bir konuda yeni talep açabilirsiniz.`,
        color: 0x3498db,
      });

      return { ok: true, action, ticket };
    }

    if (action === "delete") {
      this.store.deleteTicket(guild.id, channel.id);

      await this._notifyOpenerDm(client, ticket, {
        title: `Talep #${ticket.number} Kapatıldı ve Silindi`,
        description: `**${ticket.categoryLabel}** kategorisindeki #${ticket.number} numaralı destek talebiniz sonlandırılıp silinmiştir.`,
        color: 0xc0392b,
      });

      await channel
        .send({
          embeds: [
            new EmbedBuilder()
              .setColor(0xc0392b)
              .setDescription(
                `Talep #${ticket.number} **${actorTag}** tarafından siliniyor...`
              ),
          ],
        })
        .catch(() => {});

      const doDelete = async () => {
        this.snapshotManager?.markSelfAction(`channel:${channel.id}`, 10_000);
        await channel
          .delete(`Talep #${ticket.number} yetkili tarafindan silindi`)
          .catch(() => {});
      };

      if (this.deleteDelayMs > 0) {
        const t = setTimeout(() => {
          doDelete();
        }, this.deleteDelayMs);
        if (typeof t.unref === "function") t.unref();
      } else {
        await doDelete();
      }

      return { ok: true, action, ticket };
    }

    return { ok: false, reason: "UNKNOWN_ACTION" };
  }

  /**
   * Handle all Button, StringSelectMenu, and ModalSubmit interactions for the Ticket system.
   * Returns true if the interaction belonged to the Ticket system.
   */
  async handleInteraction(interaction) {
    const cid = interaction.customId || "";
    if (!cid.startsWith("ticket:")) return false;

    // 1. "Destek Aç" button -> show category select menu
    if (interaction.isButton() && cid === "ticket:open") {
      await interaction.reply({
        content: "Lütfen açmak istediğiniz destek kategorisini seçin:",
        components: [this.buildCategorySelectRow()],
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    // 2. Category select menu -> show modal (or visibility chooser for Anonim Şikayet)
    if (interaction.isStringSelectMenu() && cid === "ticket:select_category") {
      const categoryId = interaction.values[0];
      const cat = TICKET_CATEGORIES[categoryId];
      if (!cat) {
        await interaction.reply({
          content: "Geçersiz kategori seçimi.",
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }

      if (cat.anonymous) {
        await interaction.update({
          content:
            "Anonim Şikayet için bu talebi kimlerin görebileceğini seçin (kimliğinizi yalnızca Sunucu Sahibi görebilir):",
          components: [this.buildAnonVisibilityRow()],
        });
        return true;
      }

      await interaction.showModal(
        this.buildTicketModal(categoryId, null, interaction.user.id)
      );
      return true;
    }

    // 3. Anonymous visibility select menu -> show 3-field modal
    if (interaction.isStringSelectMenu() && cid === "ticket:anon_visibility") {
      const visibilityId = interaction.values[0];
      await interaction.showModal(
        this.buildTicketModal(
          "anonim_sikayet",
          visibilityId,
          interaction.user.id
        )
      );
      return true;
    }

    // 4. Modal submission -> create private ticket channel
    if (interaction.isModalSubmit() && cid.startsWith("ticket:modal:")) {
      const parts = cid.split(":");
      const categoryId = parts[2];
      const visibilityId = parts[3] === "default" ? null : parts[3];

      const formDiscordUserId = interaction.fields.getTextInputValue("discord_user_id");
      const issueDescription = interaction.fields.getTextInputValue("issue_description");
      const reportedUsername = interaction.fields.getTextInputValue("reported_username") || "";

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const res = await this.createTicketFromSubmission({
        guild: interaction.guild,
        client: interaction.client,
        openerUser: interaction.user,
        categoryId,
        visibilityId,
        formDiscordUserId,
        issueDescription,
        reportedUsername,
      });

      if (res.ticket.anonymous) {
        const dmText = res.openerDmSent
          ? "Bot size DM gönderdi; yönetimle o DM üzerinden anonim olarak konuşabilirsiniz."
          : "DM kutunuz kapalı olduğu için bot size ulaşamadı. Anonim yanıt alabilmek için sunucu DM'lerini açın.";
        await interaction.editReply(
          `Anonim Şikayet **#${res.ticket.number}** oluşturuldu. ${dmText}`
        );
      } else {
        await interaction.editReply(
          `Destek talebiniz **#${res.ticket.number}** oluşturuldu: ${res.channel}`
        );
      }
      return true;
    }

    // 5. Top Admin Control Menu inside ticket channel
    if (
      interaction.isStringSelectMenu() &&
      cid.startsWith("ticket:admin_action:")
    ) {
      if (
        !this.isStaffMember(
          interaction.guild,
          interaction.member,
          interaction.memberPermissions
        )
      ) {
        await interaction.reply({
          content: "Bu yönetim menüsünü yalnızca yetkili ekip kullanabilir.",
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }

      const action = interaction.values[0];
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const res = await this.executeAdminAction({
        guild: interaction.guild,
        client: interaction.client,
        channel: interaction.channel,
        actorMember: interaction.member,
        actorUser: interaction.user,
        action,
      });

      if (!res.ok) {
        await interaction.editReply("Bu kanal aktif bir destek talebi değil.");
        return true;
      }

      const doneLabels = {
        escalate: `Talep #${res.ticket.number} yönetime aktarıldı.`,
        close: `Talep #${res.ticket.number} kapatıldı ve kullanıcıya DM gönderildi.`,
        hold: `Talep #${res.ticket.number} askıya alındı.`,
        reopen: `Talep #${res.ticket.number} yeniden açıldı.`,
        resolve: `Talep #${res.ticket.number} çözüldü olarak işaretlendi ve kullanıcıya DM gönderildi.`,
        delete: `Talep #${res.ticket.number} siliniyor ve kullanıcıya DM gönderildi.`,
      };

      await interaction
        .editReply(doneLabels[action] || "İşlem uygulandı.")
        .catch(() => {});
      return true;
    }

    // 6. Server-Owner-only identity reveal button on anonim-numara
    if (
      interaction.isButton() &&
      cid.startsWith("ticket:reveal_identity:")
    ) {
      if (interaction.user.id !== interaction.guild.ownerId) {
        await interaction.reply({
          content: "Anonim talep sahibinin kimliğini yalnızca Sunucu Sahibi görebilir.",
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }

      const channelId = cid.split(":")[2];
      const ticket = this.store.getTicketByChannel(
        interaction.guild.id,
        channelId
      );
      if (!ticket) {
        await interaction.reply({
          content: "Talep kaydı bulunamadı.",
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }

      await interaction.reply({
        content: [
          `**Anonim Talep #${ticket.number} Kimlik Bilgisi (Sadece Sunucu Sahibi)**`,
          `Gerçek Kullanıcı: <@${ticket.openerId}> (\`${ticket.openerId}\` - ${ticket.openerTag})`,
          `Form Discord User ID: \`${ticket.formDiscordUserId}\``,
        ].join("\n"),
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    return false;
  }

  /**
   * Forward admin messages typed inside `anonim-<numara>` anonymously to the player via DM.
   * Prefixing a message with `//` treats it as an internal staff note (not forwarded).
   */
  async handleGuildMessage(message, client) {
    if (!message || !message.guild || message.author?.bot) return false;

    const ticket = this.store.getTicketByChannel(
      message.guild.id,
      message.channel.id
    );
    if (!ticket || !ticket.anonymous) return false;

    const rawContent = (message.content || "").trim();
    const attachmentUrls = message.attachments?.size
      ? [...message.attachments.values()].map((a) => a.url)
      : [];

    if (!rawContent && attachmentUrls.length === 0) return false;

    // Internal staff note prefix: `// ...` is not sent to player
    if (rawContent.startsWith("//")) return true;

    if (ticket.status !== "open") {
      return true;
    }

    const bodyParts = [];
    if (rawContent) bodyParts.push(truncate(rawContent, 3500));
    if (attachmentUrls.length > 0) {
      bodyParts.push("", "**Ekler:**", ...attachmentUrls);
    }

    const dmSent = await this._notifyOpenerDm(client, ticket, {
      title: `Anonim Talep #${ticket.number} - Yönetim Yanıtı`,
      description: bodyParts.join("\n"),
      color: 0x1abc9c,
    });

    if (!dmSent) {
      await message.channel
        .send({
          content:
            "Kullanıcıya DM gönderilemedi (kullanıcının DM kutusu kapalı olabilir).",
          allowedMentions: { parse: [] },
        })
        .catch(() => {});
    }

    return true;
  }

  /**
   * Forward player DM messages anonymously into their open `anonim-<numara>` channel.
   */
  async handleDirectMessage(message, client) {
    if (!message || message.guild || message.author?.bot) return false;

    const rawContent = (message.content || "").trim();
    const attachmentUrls = message.attachments?.size
      ? [...message.attachments.values()].map((a) => a.url)
      : [];
    if (!rawContent && attachmentUrls.length === 0) return false;

    // 1. Check Discord Reply reference first if user has multiple anonymous tickets
    let targetEntry = null;
    const refId = message.reference?.messageId;
    if (refId && this.anonDmIndex.has(refId)) {
      const ref = this.anonDmIndex.get(refId);
      const t = this.store.getTicketByChannel(ref.guildId, ref.channelId);
      if (t && t.anonymous && t.openerId === message.author.id) {
        targetEntry = { guildId: ref.guildId, ticket: t };
      }
    }

    // 2. Otherwise pick the user's latest open anonymous ticket
    if (!targetEntry) {
      const allUserAnon = this.store.findAnonymousTicketsForUser(
        message.author.id
      );
      if (allUserAnon.length === 0) return false;

      const openOne = allUserAnon.find((e) => e.ticket.status === "open");
      if (!openOne) {
        const latest = allUserAnon[0].ticket;
        const stLabel = TICKET_STATUS_LABELS[latest.status] || latest.status;
        await message
          .reply(
            `Anonim Talep #${latest.number} şu an **${stLabel}** durumunda olduğu için mesajınız iletilemedi.`
          )
          .catch(() => {});
        return true;
      }
      targetEntry = openOne;
    }

    const { ticket } = targetEntry;
    if (ticket.status !== "open") {
      const stLabel = TICKET_STATUS_LABELS[ticket.status] || ticket.status;
      await message
        .reply(
          `Anonim Talep #${ticket.number} şu an **${stLabel}** durumunda olduğu için mesajınız iletilemedi.`
        )
        .catch(() => {});
      return true;
    }

    let channel = client.channels?.cache?.get(ticket.channelId);
    if (!channel && typeof client.channels?.fetch === "function") {
      channel = await client.channels.fetch(ticket.channelId).catch(() => null);
    }
    if (!channel) {
      await message
        .reply("Talep kanalı artık mevcut değil.")
        .catch(() => {});
      return true;
    }

    const bodyParts = [];
    if (rawContent) bodyParts.push(truncate(rawContent, 3500));
    if (attachmentUrls.length > 0) {
      bodyParts.push("", "**Ekler:**", ...attachmentUrls);
    }

    const anonEmbed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle(`Anonim Kullanıcı (Talep #${ticket.number})`)
      .setDescription(bodyParts.join("\n"))
      .setFooter({ text: `Anonim DM Köprüsü | Talep #${ticket.number}` })
      .setTimestamp();

    await channel.send({
      embeds: [anonEmbed],
      allowedMentions: { parse: [] },
    });

    await message
      .reply(`Mesajınız Anonim Talep #${ticket.number} üzerinden yönetime iletildi.`)
      .catch(() => {});
    return true;
  }

  handleChannelDelete(channel) {
    if (!channel?.guild) return;
    this.store.deleteTicket(channel.guild.id, channel.id);
  }
}

module.exports = { TicketManager };
