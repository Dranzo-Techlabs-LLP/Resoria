// All copy, contact details and image assignments for the site live here.
// Replace the values marked PLACEHOLDER when the real details arrive.
// Photos live under /public/images; `image: null` shows a designed placeholder.

export const site = {
  name: "Resoria Evora", // as on the logo
  shortName: "Resoria",
  suffix: "Evora",
  // PLACEHOLDER: the resort's place, e.g. "Town, District, Kerala". Shown wherever it is set.
  location: "",
  tagline: "Elegance, privacy and unforgettable experiences.",
  description:
    "Resoria Evora is a hillside retreat of two private pool villas, three suites facing the waterfall, quiet rooms, a dormitory for groups, an infinity pool, a kids' park and two halls for events.",
  // Bookings and enquiries; the same number takes WhatsApp messages.
  // PLACEHOLDER: the number printed on the business card mockup. Confirm it before going live.
  phone: "+91 89765 67890",
  phoneHref: "tel:+918976567890",
  whatsappNumber: "918976567890", // digits only, with the country code
  whatsappHref: `https://wa.me/918976567890?text=${encodeURIComponent("Hello! I'd like to ask about a stay at Resoria Evora.")}`,
  email: "", // PLACEHOLDER: bookings email
  instagram: null as { href: string; handle: string } | null, // PLACEHOLDER: e.g. { href: "https://www.instagram.com/…/", handle: "@…" }
  checkIn: "", // PLACEHOLDER: e.g. "2:00 pm"
  checkOut: "", // PLACEHOLDER: e.g. "11:00 am"
};

/** The one photo of the resort so far: a villa at dusk, the waterfall and the misty hills behind. */
const villaDusk = {
  src: "/images/resort-dusk.jpg",
  alt: "A Resoria pool villa lit up at dusk, its glass walls opening onto an infinity pool, with a waterfall and mist-covered hills behind",
  // where the waterfall is, so it can flow (made by brand/make_flow_map.py)
  flow: "/images/resort-dusk-flow.png",
};

export const images = {
  hero: villaDusk,
};

export const nav = [
  { label: "Villas & suites", href: "#stays" },
  { label: "Rooms & dormitory", href: "#rooms" },
  { label: "Events", href: "#events" },
];

export interface Unit {
  id: string;
  name: string;
  note: string;
}

export interface Stay {
  slug: string;
  name: string;
  summary: string;
  description: string;
  /** Label and value rows under the description */
  facts: [string, string][];
  image: { src: string; alt: string; position?: string; flow?: string } | null; // null → designed placeholder until photos arrive
  placeholderCaption: string;
  units?: Unit[];
}

export const stays: Stay[] = [
  {
    slug: "villas",
    name: "The Pool Villas",
    summary: "Two villas, each with a pool of its own.",
    description:
      "The most private way to stay at Resoria. Haven is the signature villa, with two bedrooms for a family or two couples travelling together; Solace is made for two. Both open straight onto their own pool.",
    facts: [
      ["Villas", "2"],
      ["Haven", "Signature two-bedroom pool villa"],
      ["Solace", "Private pool villa"],
      ["Rates", "On request"],
    ],
    image: { ...villaDusk, position: "75% 60%" },
    placeholderCaption: "Photo: a pool villa",
    units: [
      { id: "villa-01", name: "Haven", note: "Villa 01. The signature two-bedroom pool villa." },
      { id: "villa-02", name: "Solace", note: "Villa 02. A private pool villa." },
    ],
  },
  {
    slug: "suites",
    name: "The Waterfall Suites",
    summary: "Three suites that look out on the waterfall.",
    description:
      "Elysian, Sylvane and Zephyr each look out on the waterfall and the forested hillside around it. Three suites for couples who want the view and a little quiet.",
    facts: [
      ["Suites", "3"],
      ["View", "The waterfall"],
      ["Rates", "On request"],
    ],
    image: { src: "/images/waterfall-view.jpg", alt: "The waterfall falling through misty forest, the view the suites look out on", flow: "/images/waterfall-view-flow.png" },
    placeholderCaption: "Photo: a waterfall suite",
    units: [
      { id: "suite-01", name: "Elysian", note: "Suite 01. Waterfall view suite." },
      { id: "suite-02", name: "Sylvane", note: "Suite 02. Waterfall view suite." },
      { id: "suite-03", name: "Zephyr", note: "Suite 03. Waterfall view suite." },
    ],
  },
];

/** Rooms for one or two, and the dormitory: listed after the villas and suites, under #rooms. */
export const moreStays: Stay[] = [
  {
    slug: "rooms",
    name: "The Rooms",
    summary: "Seven single rooms and the Cave Room.",
    description:
      "Simple, comfortable rooms for a guest or two: four on the kitchen side, three by reception, and the Cave Room, set apart near Chola. A good choice for friends travelling with a group in the villas or the dormitory.",
    facts: [
      ["Single rooms", "7"],
      ["Cave Room", "1, near Chola"],
      ["Rates", "On request"],
    ],
    image: { src: "/images/linen-pillows.jpg", alt: "Cream pillows on a made bed, embroidered in gold with the Resoria Evora logo" },
    placeholderCaption: "Photo: a room",
  },
  {
    slug: "dormitory",
    name: "The Dormitory",
    summary: "Beds for up to sixty, for groups.",
    description:
      "Made for trekking groups, student trips, corporate teams and big families travelling together. The whole group stays together, with the infinity pool, the kids' park and the halls on the same grounds.",
    facts: [
      ["Beds", "60 in total"],
      ["Good for", "Groups, school and college trips, teams"],
      ["Rates", "Per bed, on request"],
    ],
    image: { src: "/images/towels.jpg", alt: "A stack of white towels embroidered in gold with the Resoria Evora logo" },
    placeholderCaption: "Photo: the dormitory",
  },
];

export const events = {
  title: "Two halls, for work and for celebrations.",
  text:
    "The Conference Hall is set up for offsites, training days and meetings; the DJ Hall is where the music goes on for birthdays, receptions and parties. Book either one together with stays for the whole group.",
  // PLACEHOLDER: seat counts and equipment for each hall.
  facts: [
    ["Conference Hall", "Meetings, offsites, workshops"],
    ["DJ Hall", "Parties, receptions, celebrations"],
    ["Seats", "Ask us for your group size"],
    ["Stay", "Villas, suites, rooms and the dormitory for guests"],
  ] as [string, string][],
  image: { src: "/images/business-cards.jpg", alt: "Resoria Evora cards in forest green with the logo in gold foil" } as { src: string; alt: string } | null,
  placeholderCaption: "Photo: the conference hall",
};

/** Around the grounds: shown in the About facts. */
export const facilities = ["Infinity pool", "Kids' park", "DJ hall", "Conference hall"];

/** "Around the grounds": one tile each, with a Lucide icon (see Amenities.tsx). */
export const amenities = [
  { icon: "waves", title: "Private pool villas", text: "Haven and Solace each open onto a pool of their own." },
  { icon: "droplets", title: "Waterfall views", text: "Elysian, Sylvane and Zephyr look out on the falls." },
  { icon: "sun", title: "Infinity pool", text: "Open to every guest at the resort." },
  { icon: "baby", title: "Kids' park", text: "Room for children to play on the grounds." },
  { icon: "music", title: "DJ Hall", text: "For parties, receptions and celebrations." },
  { icon: "presentation", title: "Conference Hall", text: "For meetings, offsites and training days." },
] as const;

/** Under the hero's buttons: the stay at a glance. */
export const heroFacts = [
  { icon: "waves", text: "2 private pool villas" },
  { icon: "droplets", text: "3 waterfall suites" },
  { icon: "users", text: "Groups up to 60" },
] as const;

// The "in the mist" section between About and Stays. The three lines
// crossfade as the morning cloud sinks into the valley below the villa.
export const mist = {
  beats: [
    "Mornings here begin inside the mist.",
    "Slowly it lifts off the hills,",
    "and Resoria comes back *into view.*",
  ],
  label: "Resoria Evora",
};

export const enquiryOptions = ["A pool villa", "A waterfall suite", "A room", "The dormitory", "An event in one of the halls", "Not sure yet"];

// ---------- full-screen slideshows ----------

/** A photo in a full-screen slideshow */
export interface Slide {
  src: string;
  alt: string;
  caption: string;
  w?: number;
  h?: number;
}

// Tap a photo and its group plays as slides (one photo each, until more arrive).
export const photoGroups = {
  villas: [{ ...villaDusk, caption: "A pool villa at dusk" }],
  suites: [{ ...stays[1].image!, caption: "The waterfall, as the suites see it" }],
  rooms: [{ ...moreStays[0].image!, caption: "Resoria linen" }],
  dormitory: [{ ...moreStays[1].image!, caption: "Fresh towels for every guest" }],
} satisfies Record<string, Slide[]>;

export type PhotoGroup = keyof typeof photoGroups;
