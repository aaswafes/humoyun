"use client";

import * as React from "react";
import { useStore } from "./store";
import type { Lang } from "./customize";

// =========================================================
// Two languages, one flat dictionary.
//
// English is the source of truth: every key exists there, and a missing
// Uzbek string falls back to it rather than rendering a raw key. That means
// a half-translated screen degrades into English instead of into `nav.today`.
//
// Uzbek here is the Latin alphabet, which is the official script. It needs
// `oʻ` and `gʻ` — U+02BB MODIFIER LETTER TURNED COMMA, not an apostrophe —
// which is why layout.tsx loads the latin-ext subset of every face.
// =========================================================

export type { Lang };

export const LANGUAGES: { value: Lang; label: string; native: string }[] = [
  { value: "en", label: "English", native: "English" },
  { value: "uz", label: "Uzbek", native: "Oʻzbekcha" },
];

const en = {
  // ---- navigation ----
  "nav.today": "Today",
  "nav.calendar": "Calendar",
  "nav.inbox": "Inbox",
  "nav.projects": "Projects",
  "nav.consumption": "Consumption",
  "nav.umr": "Umr",
  "nav.umrStats": "Umr stats",
  "nav.books": "Books",
  "nav.watch": "Films & Anime",
  "nav.youtube": "YouTube",
  "nav.habits": "Habits",
  "nav.salah": "Salah",
  "nav.goals": "Goals",
  "nav.focus": "Focus",
  "nav.stats": "Stats",
  "nav.review": "Weekly Review",
  "nav.settings": "Settings",
  "nav.community": "Communities",
  "nav.search": "Search",
  "nav.group.plan": "Plan",
  "nav.group.track": "Track",
  "nav.group.reflect": "Reflect",
  "nav.group.community": "Community",
  "nav.pinned": "Pinned",
  "nav.recent": "Recent",

  // ---- common actions ----
  "action.new": "New",
  "action.save": "Save",
  "action.cancel": "Cancel",
  "action.delete": "Delete",
  "action.restore": "Restore",
  "action.close": "Close",
  "action.done": "Done",
  "action.undo": "Undo",
  "action.edit": "Edit",
  "action.copy": "Copy",
  "action.copied": "Copied",
  "action.add": "Add",
  "action.remove": "Remove",
  "action.reset": "Reset",
  "action.apply": "Apply",
  "action.working": "Working…",
  "action.loading": "Loading…",

  // ---- scheduling ----
  "when.today": "Today",
  "when.tomorrow": "Tomorrow",
  "when.weekend": "This weekend",
  "when.nextWeek": "Next week",
  "when.noDate": "No date",
  "when.someday": "Someday",
  "when.overdue": "Overdue",
  "when.upcoming": "Upcoming",
  "when.all": "All",
  "when.pickDate": "Pick a date",

  // ---- tasks ----
  "task.title": "Task",
  "task.priority": "Priority",
  "task.priority.none": "None",
  "task.priority.low": "Low",
  "task.priority.medium": "Medium",
  "task.priority.high": "High",
  "task.tags": "Tags",
  "task.notes": "Notes",
  "task.subtasks": "Subtasks",
  "task.untitled": "Untitled",

  // ---- inbox ----
  "inbox.unscheduled": "{n} unscheduled",
  "inbox.nothingWaiting": "Nothing waiting",
  "inbox.somedayCount": "{n} on the maybe pile",
  "inbox.nothingHeldBack": "Nothing held back",
  "inbox.layout.list": "List",
  "inbox.layout.matrix": "Matrix",
  "matrix.do": "Do first",
  "matrix.plan": "Schedule",
  "matrix.quick": "Quick wins",
  "matrix.letGo": "Let go",
  "matrix.do.hint": "Urgent and important",
  "matrix.plan.hint": "Important, not urgent",
  "matrix.quick.hint": "Urgent, not important",
  "matrix.letGo.hint": "Neither — drop or park it",
  "matrix.nothing": "Nothing here",

  // ---- today ----
  "today.open": "{n} open",
  "today.allClear": "All clear",
  "today.leftFrom": "Left from {day}",
  "today.moveAll": "Move all to today",
  "today.notNow": "Not now — ask again tomorrow",
  "today.planTomorrow": "Plan tomorrow",

  // ---- notes ----
  "notes.links": "Links",
  "notes.linkedFrom": "Linked from",
  "notes.linksTo": "Links to",
  "notes.aliases": "Also known as",
  "notes.addIcon": "Add an icon",
  "notes.changeIcon": "Change the icon",
  "notes.untitled": "Untitled note",

  // ---- settings: sections ----
  "settings.title": "Settings",
  "settings.profile": "Profile",
  "settings.appearance": "Appearance",
  "settings.calendar": "Calendar",
  "settings.salah": "Salah",
  "settings.umr": "Umr",
  "settings.notifications": "Notifications",
  "settings.data": "Data",
  "settings.language": "Language",

  // ---- settings: appearance ----
  "appearance.theme": "Theme",
  "appearance.theme.light": "Light",
  "appearance.theme.dark": "Dark",
  "appearance.theme.system": "System",
  "appearance.palette": "Surface palette",
  "appearance.paletteHint": "The greys everything else sits on.",
  "appearance.accent": "Accent",
  "appearance.accentCustom": "Custom colour",
  "appearance.accentHint": "One colour, used for anything selected or primary.",
  "appearance.accentUnreadable": "This colour is hard to read on the current background.",
  "appearance.fonts": "Typefaces",
  "appearance.fontBody": "Body",
  "appearance.fontDisplay": "Display",
  "appearance.fontMono": "Monospace",
  "appearance.serifNumerals": "Serif numerals",
  "appearance.serifNumeralsHint": "The big dates and stats use the display face. Turn it off to keep everything in one typeface.",
  "appearance.scale": "Interface size",
  "appearance.radius": "Corner radius",
  "appearance.iconStroke": "Icon weight",
  "appearance.sidebarWidth": "Sidebar width",
  "appearance.motion": "Motion",
  "appearance.motion.full": "Full",
  "appearance.motion.calm": "Calm",
  "appearance.motion.none": "None",
  "appearance.motionHint": "Your system's reduce-motion setting always wins over this.",
  "appearance.tints": "Entity colours",
  "appearance.tintsHint": "The ten colours tasks, books, habits and tags are labelled with.",
  "appearance.preview": "Preview",
  "appearance.resetAll": "Reset appearance",
  "appearance.resetConfirm": "Put every appearance setting back to its default?",
  "appearance.sharp": "Sharp",
  "appearance.round": "Round",
  "appearance.light": "Light",
  "appearance.heavy": "Heavy",
  "appearance.small": "Small",
  "appearance.large": "Large",
  "appearance.narrow": "Narrow",
  "appearance.wide": "Wide",

  // ---- settings: language ----
  "language.title": "Language",
  "language.hint": "Menus, settings and buttons. Anything you have written yourself is never translated.",
  "language.partial": "Uzbek covers the navigation, settings and common controls. Screens that are still English will be translated as they are worked on.",

  // ---- trash ----
  "trash.title": "Trash",
  "trash.empty": "Nothing in the trash. Anything you delete from now on lands here first.",
  "trash.emptyTrash": "Empty trash",
  "trash.deleteForGood": "Delete for good",
  "trash.putBack": "Put it back",
  "trash.deletedAgo": "deleted {ago}",
  "trash.today": "today",
  "trash.yesterday": "yesterday",
  "trash.daysAgo": "{n} days ago",

  // ---- misc ----
  "misc.on": "On",
  "misc.off": "Off",
  "misc.items": "{n} items",
  "misc.item": "{n} item",
  "misc.offline": "Offline — you can read everything already loaded, but changes will not save until you reconnect.",
} as const;

export type MsgKey = keyof typeof en;

const uz: Partial<Record<MsgKey, string>> = {
  "nav.today": "Bugun",
  "nav.calendar": "Kalendar",
  "nav.inbox": "Kiruvchi",
  "nav.projects": "Loyihalar",
  "nav.consumption": "Isteʼmol",
  "nav.umr": "Umr",
  "nav.umrStats": "Umr statistikasi",
  "nav.books": "Kitoblar",
  "nav.watch": "Filmlar va anime",
  "nav.youtube": "YouTube",
  "nav.habits": "Odatlar",
  "nav.salah": "Namoz",
  "nav.goals": "Maqsadlar",
  "nav.focus": "Diqqat",
  "nav.stats": "Statistika",
  "nav.review": "Haftalik tahlil",
  "nav.settings": "Sozlamalar",
  "nav.community": "Jamoalar",
  "nav.search": "Qidiruv",
  "nav.group.plan": "Reja",
  "nav.group.track": "Kuzatuv",
  "nav.group.reflect": "Tahlil",
  "nav.group.community": "Jamoa",
  "nav.pinned": "Qadalgan",
  "nav.recent": "Yaqinda",

  "action.new": "Yangi",
  "action.save": "Saqlash",
  "action.cancel": "Bekor qilish",
  "action.delete": "Oʻchirish",
  "action.restore": "Tiklash",
  "action.close": "Yopish",
  "action.done": "Bajarildi",
  "action.undo": "Qaytarish",
  "action.edit": "Tahrirlash",
  "action.copy": "Nusxalash",
  "action.copied": "Nusxalandi",
  "action.add": "Qoʻshish",
  "action.remove": "Olib tashlash",
  "action.reset": "Tiklash",
  "action.apply": "Qoʻllash",
  "action.working": "Bajarilmoqda…",
  "action.loading": "Yuklanmoqda…",

  "when.today": "Bugun",
  "when.tomorrow": "Ertaga",
  "when.weekend": "Shu hafta oxiri",
  "when.nextWeek": "Keyingi hafta",
  "when.noDate": "Sanasiz",
  "when.someday": "Bir kun",
  "when.overdue": "Muddati oʻtgan",
  "when.upcoming": "Kutilayotgan",
  "when.all": "Barchasi",
  "when.pickDate": "Sanani tanlang",

  "task.title": "Vazifa",
  "task.priority": "Muhimlik",
  "task.priority.none": "Yoʻq",
  "task.priority.low": "Past",
  "task.priority.medium": "Oʻrta",
  "task.priority.high": "Yuqori",
  "task.tags": "Teglar",
  "task.notes": "Izohlar",
  "task.subtasks": "Ichki vazifalar",
  "task.untitled": "Nomsiz",

  "inbox.unscheduled": "{n} ta rejalashtirilmagan",
  "inbox.nothingWaiting": "Kutayotgan narsa yoʻq",
  "inbox.somedayCount": "{n} ta “bir kun” roʻyxatida",
  "inbox.nothingHeldBack": "Hech narsa saqlanmagan",
  "inbox.layout.list": "Roʻyxat",
  "inbox.layout.matrix": "Matritsa",
  "matrix.do": "Avval bajaring",
  "matrix.plan": "Rejalashtiring",
  "matrix.quick": "Tez yutuqlar",
  "matrix.letGo": "Voz keching",
  "matrix.do.hint": "Shoshilinch va muhim",
  "matrix.plan.hint": "Muhim, lekin shoshilinch emas",
  "matrix.quick.hint": "Shoshilinch, lekin muhim emas",
  "matrix.letGo.hint": "Ikkalasi ham emas — tashlang yoki keyinga qoldiring",
  "matrix.nothing": "Bu yerda hech narsa yoʻq",

  "today.open": "{n} ta ochiq",
  "today.allClear": "Hammasi tayyor",
  "today.leftFrom": "{day} dan qolgan",
  "today.moveAll": "Hammasini bugunga koʻchirish",
  "today.notNow": "Hozir emas — ertaga yana soʻrang",
  "today.planTomorrow": "Ertangi kunni rejalashtirish",

  "notes.links": "Havolalar",
  "notes.linkedFrom": "Havola qilgan qaydlar",
  "notes.linksTo": "Havola qiladi",
  "notes.aliases": "Boshqa nomlari",
  "notes.addIcon": "Belgi qoʻshish",
  "notes.changeIcon": "Belgini oʻzgartirish",
  "notes.untitled": "Nomsiz qayd",

  "settings.title": "Sozlamalar",
  "settings.profile": "Profil",
  "settings.appearance": "Koʻrinish",
  "settings.calendar": "Kalendar",
  "settings.salah": "Namoz",
  "settings.umr": "Umr",
  "settings.notifications": "Bildirishnomalar",
  "settings.data": "Maʼlumotlar",
  "settings.language": "Til",

  "appearance.theme": "Mavzu",
  "appearance.theme.light": "Yorugʻ",
  "appearance.theme.dark": "Qorongʻi",
  "appearance.theme.system": "Tizim",
  "appearance.palette": "Fon ranglari",
  "appearance.paletteHint": "Qolgan hamma narsa joylashadigan kulrang ohanglar.",
  "appearance.accent": "Asosiy rang",
  "appearance.accentCustom": "Oʻz rangingiz",
  "appearance.accentHint": "Tanlangan va asosiy elementlar uchun bitta rang.",
  "appearance.accentUnreadable": "Bu rang joriy fonda yaxshi oʻqilmaydi.",
  "appearance.fonts": "Shriftlar",
  "appearance.fontBody": "Asosiy matn",
  "appearance.fontDisplay": "Kattalar uchun",
  "appearance.fontMono": "Monoshrift",
  "appearance.serifNumerals": "Serif raqamlar",
  "appearance.serifNumeralsHint": "Katta sanalar va koʻrsatkichlar alohida shriftda. Oʻchirsangiz, hammasi bitta shriftda boʻladi.",
  "appearance.scale": "Interfeys oʻlchami",
  "appearance.radius": "Burchak yumaloqligi",
  "appearance.iconStroke": "Belgilar qalinligi",
  "appearance.sidebarWidth": "Yon panel kengligi",
  "appearance.motion": "Animatsiya",
  "appearance.motion.full": "Toʻliq",
  "appearance.motion.calm": "Sokin",
  "appearance.motion.none": "Yoʻq",
  "appearance.motionHint": "Tizimingizdagi “harakatni kamaytirish” sozlamasi doim ustun turadi.",
  "appearance.tints": "Elementlar ranglari",
  "appearance.tintsHint": "Vazifalar, kitoblar, odatlar va teglar belgilanadigan oʻnta rang.",
  "appearance.preview": "Koʻrinishi",
  "appearance.resetAll": "Koʻrinishni tiklash",
  "appearance.resetConfirm": "Barcha koʻrinish sozlamalari standart holatga qaytarilsinmi?",
  "appearance.sharp": "Oʻtkir",
  "appearance.round": "Yumaloq",
  "appearance.light": "Ingichka",
  "appearance.heavy": "Qalin",
  "appearance.small": "Kichik",
  "appearance.large": "Katta",
  "appearance.narrow": "Tor",
  "appearance.wide": "Keng",

  "language.title": "Til",
  "language.hint": "Menyular, sozlamalar va tugmalar. Oʻzingiz yozgan matn hech qachon tarjima qilinmaydi.",
  "language.partial": "Oʻzbek tili navigatsiya, sozlamalar va asosiy tugmalarni qamrab oladi. Qolgan sahifalar ish jarayonida tarjima qilinadi.",

  "trash.title": "Savat",
  "trash.empty": "Savat boʻsh. Bundan keyin oʻchirilgan narsalar avval shu yerga tushadi.",
  "trash.emptyTrash": "Savatni boʻshatish",
  "trash.deleteForGood": "Butunlay oʻchirish",
  "trash.putBack": "Joyiga qaytarish",
  "trash.deletedAgo": "{ago} oʻchirilgan",
  "trash.today": "bugun",
  "trash.yesterday": "kecha",
  "trash.daysAgo": "{n} kun oldin",

  "misc.on": "Yoqilgan",
  "misc.off": "Oʻchirilgan",
  "misc.items": "{n} ta element",
  "misc.item": "{n} ta element",
  "misc.offline": "Oflayn — yuklangan hamma narsani oʻqishingiz mumkin, lekin ulanmaguningizcha oʻzgarishlar saqlanmaydi.",
};

const DICTS: Record<Lang, Partial<Record<MsgKey, string>>> = { en, uz };

/** Fill `{name}` placeholders. Anything unmatched is left alone. */
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in vars ? String(vars[key]) : whole);
}

export function translate(
  lang: Lang, key: MsgKey, vars?: Record<string, string | number>,
): string {
  const hit = DICTS[lang]?.[key] ?? en[key];
  return interpolate(hit, vars);
}

export type TFn = (key: MsgKey, vars?: Record<string, string | number>) => string;

/**
 * The hook every component uses. Reads the language straight off the profile
 * so changing it re-renders the tree — no context provider, because the
 * store already is one.
 */
export function useT(): { t: TFn; lang: Lang } {
  const lang = useStore((s) => {
    const ui = (s.profile?.prefs?.ui ?? {}) as { lang?: unknown };
    return ui.lang === "uz" ? "uz" : "en";
  });
  const t = React.useCallback<TFn>((key, vars) => translate(lang, key, vars), [lang]);
  return { t, lang };
}
