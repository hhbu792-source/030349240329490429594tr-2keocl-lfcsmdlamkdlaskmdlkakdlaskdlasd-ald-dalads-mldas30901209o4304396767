const DEFAULT_TICKET_PANEL_CHANNEL_ID = "1573522477655654544";

const DEFAULT_MANAGEMENT_ROLE_ID = "1573521638241345726";
const DEFAULT_DISCORD_STAFF_ROLE_ID = "1573521880147820594";

const DEFAULT_TICKET_MANAGEMENT_ROLE_IDS = [DEFAULT_MANAGEMENT_ROLE_ID];
const DEFAULT_TICKET_DISCORD_STAFF_ROLE_IDS = [DEFAULT_DISCORD_STAFF_ROLE_ID];
const DEFAULT_TICKET_STAFF_ROLE_IDS = [
  DEFAULT_DISCORD_STAFF_ROLE_ID,
  DEFAULT_MANAGEMENT_ROLE_ID,
];

const PANEL_TITLE = "🎫 THE COMPLEX Destek Merkezi";

const PANEL_DESCRIPTION = [
  "THE COMPLEX destek merkezine hoş geldiniz. Aşağıdaki butona basıp kategori seçerek talep açabilirsiniz; talebiniz yalnızca size ve ilgili ekibe açık özel bir kanalda ele alınır.",
  "",
  "**Nasıl çalışır?**",
  "1️⃣ Butona bas, kategori seç",
  "2️⃣ Kısa formu doldur",
  "3️⃣ Açılan kanalda ekibimiz seninle ilgilenir",
  "",
  "**Kategoriler**",
  "🎭 Text RP · Text RP içindeki sorunlar, oyuncu şikayetleri ve RP kuralları",
  "💬 Discord · Discord sunucusu: rol, kanal erişimi ve diğer Discord konuları",
  "❓ Sorunum Var · Diğer kategorilere girmeyen her türlü sorun ve soru",
  "🔓 Perma Yasak Kaldırma · Kalıcı yasağınızın kaldırılması için başvuru",
  "📨 Yönetim İletişim · Yönetime doğrudan ulaş: öneri, iş birliği ve özel konular. Yalnız yönetim ve üst yönetim görür",
  "🚩 Normal Yetkili Şikayet · Bir yetkiliyi adınla şikayet et. Yalnız yönetim ve üst yönetim görür",
  "🕵️ Anonim Şikayet · Yönetim üyesi şikayeti. Kimliğini yalnız sunucu sahibi görür, kimin göreceğini sen seçersin",
  "📂 Öneri İtirazı · Eğer öneriniz askıya alınmış veya reddedilmiş ise bunun hakkında itiraz etmek için bu kategoriden talep açın",
  "🛠️ Bug Raporu · Discord içi bir bug tespit eder iseniz bu kategoriden feedback verin",
  "🧐 Yönetim Şikayet · Herhangi bir yönetim üyesinden şikayetçi iseniz lütfen bu kategoriden talep açın",
  "🚫 Blacklist Kaldırma · Blacklist cezanızın kaldırılması için itiraz ve başvuru talebi",
].join("\n");

/**
 * All 11 ticket categories with exact Discord parent category IDs,
 * channel prefixes, and strict access tiers:
 * - "staff": Discord Staff (1573521880147820594) + Yönetim (1573521638241345726)
 * - "management": ONLY Yönetim (1573521638241345726) (Discord Staff explicitly denied)
 * - "anonymous": ONLY Yönetim / selected visibility (opener communicates via DM)
 */
const TICKET_CATEGORIES = {
  text_rp: {
    id: "text_rp",
    label: "Text RP",
    description: "Text RP içindeki sorunlar, oyuncu şikayetleri ve RP kuralları",
    channelPrefix: "trp",
    parentCategoryId: "1574482182020403210",
    accessTier: "staff",
    anonymous: false,
  },
  discord: {
    id: "discord",
    label: "Discord",
    description: "Discord sunucusu: rol, kanal erişimi ve diğer Discord konuları",
    channelPrefix: "dc",
    parentCategoryId: "1574482318737801216",
    accessTier: "staff",
    anonymous: false,
  },
  sorun: {
    id: "sorun",
    label: "Sorunum Var",
    description: "Diğer kategorilere girmeyen her türlü sorun ve soru",
    channelPrefix: "sorun",
    parentCategoryId: "1574482768346357790",
    accessTier: "staff",
    anonymous: false,
  },
  bug_raporu: {
    id: "bug_raporu",
    label: "Bug Raporu",
    description: "Discord içi bir bug tespit ederseniz bu kategoriden bildirin",
    channelPrefix: "bug",
    parentCategoryId: "1574482604936134807",
    accessTier: "management",
    anonymous: false,
  },
  perma_ban: {
    id: "perma_ban",
    label: "Perma Yasak Kaldırma",
    description: "Kalıcı yasağınızın kaldırılması için başvuru (Yalnız yönetim görür)",
    channelPrefix: "perma",
    parentCategoryId: "1574482908746616893",
    accessTier: "management",
    anonymous: false,
  },
  yonetim: {
    id: "yonetim",
    label: "Yönetim İletişim",
    description: "Öneri, iş birliği ve özel konular (Yalnız yönetim ve üst yönetim)",
    channelPrefix: "yonetim",
    parentCategoryId: "1574483052590006413",
    accessTier: "management",
    anonymous: false,
  },
  yetkili_sikayet: {
    id: "yetkili_sikayet",
    label: "Normal Yetkili Şikayet",
    description: "Bir yetkiliyi adınla şikayet et (Yalnız yönetim ve üst yönetim)",
    channelPrefix: "staff",
    parentCategoryId: "1574483508166922321",
    accessTier: "management",
    anonymous: false,
  },
  anonim_sikayet: {
    id: "anonim_sikayet",
    label: "Anonim Şikayet",
    description: "Yönetim üyesi şikayeti (DM üzerinden anonim iletişim)",
    channelPrefix: "anonim",
    parentCategoryId: "1574483609677602987",
    accessTier: "anonymous",
    anonymous: true,
  },
  oneri_itirazi: {
    id: "oneri_itirazi",
    label: "Öneri İtirazı",
    description: "Askıya alınmış veya reddedilmiş öneriniz hakkında itiraz talebi",
    channelPrefix: "oneri",
    parentCategoryId: "1574483714837053530",
    accessTier: "management",
    anonymous: false,
  },
  yonetim_sikayet: {
    id: "yonetim_sikayet",
    label: "Yönetim Şikayet",
    description: "Herhangi bir yönetim üyesinden şikayetçi iseniz bu kategoriden açın",
    channelPrefix: "yonetim-sikayet",
    parentCategoryId: "1574483976624541697",
    accessTier: "management",
    anonymous: false,
  },
  blacklist_kaldirma: {
    id: "blacklist_kaldirma",
    label: "Blacklist Kaldırma",
    description: "Blacklist cezanızın kaldırılması için başvuru talebi",
    channelPrefix: "blacklist",
    parentCategoryId: "1574484077069738174",
    accessTier: "management",
    anonymous: false,
    customForm: "blacklist",
  },
};

const ALL_TICKET_PARENT_CATEGORY_IDS = [
  ...new Set(
    Object.values(TICKET_CATEGORIES)
      .map((c) => c.parentCategoryId)
      .filter(Boolean)
  ),
];

const ANONYMOUS_VISIBILITY_OPTIONS = {
  management_all: {
    id: "management_all",
    label: "Yönetim ve Üst Yönetim",
    description: "Yönetim, üst yönetim ve sunucu sahibi görebilir",
  },
  upper_only: {
    id: "upper_only",
    label: "Sadece Üst Yönetim ve Sunucu Sahibi",
    description: "Yalnız üst yönetim ve sunucu sahibi görebilir",
  },
  owner_only: {
    id: "owner_only",
    label: "Sadece Sunucu Sahibi",
    description: "Yalnız sunucu sahibi ve yöneticiler görebilir",
  },
};

const TICKET_STATUS_LABELS = {
  open: "Açık",
  on_hold: "Askıya Alındı",
  closed: "Kapalı",
  resolved: "Çözüldü",
};

const TICKET_STATUS_COLORS = {
  open: 0x2ecc71,
  on_hold: 0xf1c40f,
  closed: 0x7f8c8d,
  resolved: 0x3498db,
};

const ADMIN_MENU_ACTIONS = [
  {
    value: "claim",
    label: "Talebi Üstlen",
    description: "Talebi kendi üzerinize alırsınız (12 saat yanıt takibi başlar)",
  },
  {
    value: "unclaim",
    label: "Üstlenmeyi Bırak",
    description: "Talebin üstlenmesini bırakır, başka yetkili alabilir",
  },
  {
    value: "escalate",
    label: "Talebi Yönetime Aktar",
    description: "Talebi yalnızca yönetim ve üst yönetimin erişimine taşır",
  },
  {
    value: "close",
    label: "Talebi Kapat",
    description: "Talebi kapatır ve kullanıcıya DM üzerinden bilgi gönderir",
  },
  {
    value: "hold",
    label: "Talebi Askıya Al",
    description: "Talebi geçici olarak beklemeye alır ve kullanıcıya bildirir",
  },
  {
    value: "reopen",
    label: "Talebi Geri Aç",
    description: "Kapalı veya askıdaki talebi yeniden açar",
  },
  {
    value: "resolve",
    label: "Çözüldü Olarak İşaretle",
    description: "Talebi çözüldü olarak işaretler ve kullanıcıya DM gönderir",
  },
  {
    value: "delete",
    label: "Talebi Sil",
    description: "Kullanıcıya bildirip talep kanalını kalıcı olarak siler",
  },
];

module.exports = {
  DEFAULT_TICKET_PANEL_CHANNEL_ID,
  DEFAULT_MANAGEMENT_ROLE_ID,
  DEFAULT_DISCORD_STAFF_ROLE_ID,
  DEFAULT_TICKET_MANAGEMENT_ROLE_IDS,
  DEFAULT_TICKET_DISCORD_STAFF_ROLE_IDS,
  DEFAULT_TICKET_STAFF_ROLE_IDS,
  ALL_TICKET_PARENT_CATEGORY_IDS,
  PANEL_TITLE,
  PANEL_DESCRIPTION,
  TICKET_CATEGORIES,
  ANONYMOUS_VISIBILITY_OPTIONS,
  TICKET_STATUS_LABELS,
  TICKET_STATUS_COLORS,
  ADMIN_MENU_ACTIONS,
};
