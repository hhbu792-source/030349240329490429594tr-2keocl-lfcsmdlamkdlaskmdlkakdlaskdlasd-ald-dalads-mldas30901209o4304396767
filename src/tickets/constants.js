const DEFAULT_TICKET_PANEL_CHANNEL_ID = "1573522477655654544";

const DEFAULT_TICKET_STAFF_ROLE_IDS = [
  "1573521722697719970",
  "1573521638241345726",
  "1573521538479816784",
  "1573521880147820594",
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
  "🛠️ Teknik Destek · Bot hataları, yetki/rol sorunları ve diğer teknik sorunlar",
  "❓ Sorunum Var · Diğer kategorilere girmeyen her türlü sorun ve soru",
  "🔓 Perma Yasak Kaldırma · Kalıcı yasağınızın kaldırılması için başvuru",
  "📨 Yönetim İletişim · Yönetime doğrudan ulaş: öneri, iş birliği ve özel konular. Yalnız yönetim ve üst yönetim görür",
  "🚩 Normal Yetkili Şikayet · Bir yetkiliyi adınla şikayet et. Yalnız yönetim ve üst yönetim görür",
  "🕵️ Anonim Şikayet · Yönetim üyesi şikayeti. Kimliğini yalnız sunucu sahibi görür, kimin göreceğini sen seçersin",
  "",
  "**Kurallar**",
  "• Her konu için tek talep açın, aynı konuyu tekrar açmayın.",
  '• "Selam", "Kimse var mı?" yerine doğrudan sorununuzu yazın.',
  "• Kanıt gereken durumlarda ekran görüntüsü veya mesaj bağlantısı ekleyin.",
  "• Saygı çerçevesinde iletişim kurun; troll ve alakasız talepler yaptırım alır.",
  "• Yetkilileri gereksiz yere etiketlemeyin, sıra size gelecektir.",
].join("\n");

/**
 * All 8 ticket categories with exact channel prefixes & access tiers.
 */
const TICKET_CATEGORIES = {
  text_rp: {
    id: "text_rp",
    label: "Text RP",
    description: "Text RP içindeki sorunlar, oyuncu şikayetleri ve RP kuralları",
    channelPrefix: "trp",
    accessTier: "staff",
    anonymous: false,
  },
  discord: {
    id: "discord",
    label: "Discord",
    description: "Discord sunucusu: rol, kanal erişimi ve diğer Discord konuları",
    channelPrefix: "dc",
    accessTier: "staff",
    anonymous: false,
  },
  teknik: {
    id: "teknik",
    label: "Teknik Destek",
    description: "Bot hataları, yetki/rol sorunları ve diğer teknik sorunlar",
    channelPrefix: "teknik",
    accessTier: "staff",
    anonymous: false,
  },
  sorun: {
    id: "sorun",
    label: "Sorunum Var",
    description: "Diğer kategorilere girmeyen her türlü sorun ve soru",
    channelPrefix: "sorun",
    accessTier: "staff",
    anonymous: false,
  },
  perma_ban: {
    id: "perma_ban",
    label: "Perma Yasak Kaldırma",
    description: "Kalıcı yasağınızın kaldırılması için başvuru",
    channelPrefix: "perma",
    accessTier: "staff",
    anonymous: false,
  },
  yonetim: {
    id: "yonetim",
    label: "Yönetim İletişim",
    description: "Öneri, iş birliği ve özel konular (Yalnız yönetim ve üst yönetim)",
    channelPrefix: "yonetim",
    accessTier: "management",
    anonymous: false,
  },
  yetkili_sikayet: {
    id: "yetkili_sikayet",
    label: "Normal Yetkili Şikayet",
    description: "Bir yetkiliyi adınla şikayet et (Yalnız yönetim ve üst yönetim)",
    channelPrefix: "staff",
    accessTier: "management",
    anonymous: false,
  },
  anonim_sikayet: {
    id: "anonim_sikayet",
    label: "Anonim Şikayet",
    description: "Yönetim üyesi şikayeti (DM üzerinden anonim iletişim)",
    channelPrefix: "anonim",
    accessTier: "anonymous",
    anonymous: true,
  },
};

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
  DEFAULT_TICKET_STAFF_ROLE_IDS,
  PANEL_TITLE,
  PANEL_DESCRIPTION,
  TICKET_CATEGORIES,
  ANONYMOUS_VISIBILITY_OPTIONS,
  TICKET_STATUS_LABELS,
  TICKET_STATUS_COLORS,
  ADMIN_MENU_ACTIONS,
};
