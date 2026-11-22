/**
 * ============================================================================
 *  SITE CONFIG — THE ONLY FILE YOU NEED TO EDIT
 * ============================================================================
 *  Every piece of user-facing text, every product, price, colour, font, link,
 *  image and video on the site comes from this object. HTML files contain
 *  structure only; CSS reads colours/fonts from here at load time.
 *
 *  Conventions
 *  - Anything still unknown is written "[PLACEHOLDER: what's needed]".
 *    Set devMode: true to see every placeholder highlighted on the page.
 *  - Arrays are lists: add an object -> it appears on the site. Remove -> gone.
 *  - Paths are relative to the site root (no leading slash), e.g. "assets/img/x.webp".
 *  - Prices are whole numbers in the store currency (PKR). No commas.
 *  - Ids must be unique, lowercase, kebab-case (used in URLs: product.html?id=...).
 * ============================================================================
 */

const config = {
  /** true = outline every [PLACEHOLDER] in red and log a list in the console. Set false before launch. */
  devMode: true,

  /* --------------------------------------------------------------------------
   * STORE — identity & contact
   * ------------------------------------------------------------------------ */
  store: {
    name: "[PLACEHOLDER: store name — default 'The Gear Doctor']",
    shortName: "Gear Doctor",               // used in tight spaces (mobile header, PWA)
    tagline: "Know Your Gear Before You Ride.",
    secondaryTaglines: ["Ride. Learn. Repeat.", "Gear explained simply."],
    owner: "Umair",
    currency: "PKR",                        // ISO code shown in JSON-LD
    currencySymbol: "Rs",                   // shown next to prices
    locale: "en-PK",                        // number formatting
    city: "[PLACEHOLDER: city]",
    address: "[PLACEHOLDER: full street address]",
    whatsapp: "[PLACEHOLDER: WhatsApp number in international format, digits only, e.g. 923001234567]",
    phoneDisplay: "[PLACEHOLDER: phone as shown to customers, e.g. +92 300 1234567]",
    email: "[PLACEHOLDER: email]",
    hours: "[PLACEHOLDER: opening hours, e.g. Mon–Sat 11am–9pm]",
    mapEmbedUrl: "",                        // Google Maps embed URL; empty = map hidden. [PLACEHOLDER]
    cashOnDelivery: true,                   // shows "Cash on delivery available" in cart. [PLACEHOLDER toggle]
    deliveryNote: "[PLACEHOLDER: delivery note, e.g. Nationwide delivery in 3–5 working days]",
    siteUrl: "[PLACEHOLDER: live site URL, e.g. https://gear-doctor.pk]", // used for SEO/OG/sitemap
  },

  /* --------------------------------------------------------------------------
   * SOCIALS
   * ------------------------------------------------------------------------ */
  socials: {
    instagram: [
      { handle: "@fury__moto", url: "https://www.instagram.com/fury__moto/", label: "Fury Moto — Umair, rider & creator" },
      { handle: "@fury_the_gear_doc", url: "https://www.instagram.com/fury_the_gear_doc/", label: "The Gear Doctor — gear explained simply" },
    ],
    youtube: { handle: "@fury_moto", url: "https://www.youtube.com/@fury_moto", label: "Fury Moto on YouTube" },
  },

  /* --------------------------------------------------------------------------
   * THEME — applied as CSS custom properties (--color-bg, --font-display, ...)
   * ------------------------------------------------------------------------ */
  theme: {
    colors: {
      bg: "#0A0A0C",        // page background
      surface: "#141418",   // cards, drawers, inputs
      accent: "#E10600",    // primary red (buttons, highlights)
      accent2: "#FFFFFF",   // secondary accent
      text: "#F5F5F7",      // main text
      muted: "#8A8A93",     // secondary text
    },
    fonts: {
      display: "Anton",     // Google Font name — big condensed headlines
      body: "Inter",        // Google Font name — body copy
    },
    radius: "6px",          // corner radius for cards/buttons
    grain: true,            // subtle film-grain overlay on/off
  },

  /* --------------------------------------------------------------------------
   * VIDEOS — every clip the site can use. Sections reference these by `id`
   * via videoSlots below. To add a clip: drop file in assets/source/, run the
   * commands in docs/MEDIA.md, then add an entry here.
   *   mp4 / webm  : { "720": path, "1080": path } — engine picks by screen size
   *   poster      : still shown instantly (and alone for reduced-motion/Save-Data)
   *   blurFill    : blurred dark loop that fills the screen behind 9:16 on desktop
   *   scrubMp4    : all-keyframe version used by scroll-scrub sections
   *   frames      : iOS scrub fallback frame sequence { pattern: "path/f_%03d.webp", count }
   *   crop        : short 2–4 s clip for category cards
   *   focalPoint  : CSS object-position, keeps the helmet in frame, e.g. "50% 30%"
   * ------------------------------------------------------------------------ */
  videos: [
    {
      id: "rider-hero",
      alt: "Rider in a red and black race suit tapping his helmet in a hazy pit garage",
      mp4: { "720": "assets/video/rider-hero-720.mp4", "1080": "assets/video/rider-hero-1080.mp4" },
      webm: { "720": "assets/video/rider-hero-720.webm", "1080": "assets/video/rider-hero-1080.webm" },
      poster: { webp: "assets/video/rider-hero-poster.webp", jpg: "assets/video/rider-hero-poster.jpg" },
      blurFill: "assets/video/rider-hero-blurfill.mp4",
      scrubMp4: "assets/video/rider-hero-scrub.mp4",
      frames: { pattern: "assets/video/frames/rider-hero/f_%03d.webp", count: 60 },
      crop: "assets/video/rider-hero-crop.mp4",
      loop: true,
      focalPoint: "50% 30%",
      aspect: "9/16",
    },
    // Instagram reels are added here by the media pipeline (same shape).
  ],

  /* --------------------------------------------------------------------------
   * VIDEO SLOTS — decides WHERE video appears and HOW.
   * Change videoId or mode here and the section changes; no code edits.
   *   section        : matches data-video-slot="<section>" in the HTML
   *   videoId        : an id from `videos` above
   *   mode           : "background" | "scrub" | "inline" | "card" | "none"
   *   mobileMode / desktopMode : optional per-breakpoint override of mode
   *   overlayOpacity : 0–1 dark gradient over the video so text stays readable
   *   focalPoint     : optional override of the video's focalPoint
   *   start          : optional start offset in seconds (use a different moment of the same clip)
   *   playbackRate   : optional, e.g. 0.6 for slow footer loop
   * ------------------------------------------------------------------------ */
  videoSlots: [
    { section: "hero",          videoId: "rider-hero", mode: "background", overlayOpacity: 0.45, mobileMode: "background", desktopMode: "background" },
    { section: "built-for-ride",videoId: "rider-hero", mode: "scrub",      overlayOpacity: 0.55 },
    { section: "category-cards",videoId: "rider-hero", mode: "card",       overlayOpacity: 0.35 },
    { section: "shop-header",   videoId: "rider-hero", mode: "background", overlayOpacity: 0.7, focalPoint: "50% 20%", start: 2 },
    { section: "product-gallery", videoId: null,       mode: "inline",     overlayOpacity: 0 }, // uses product.video
    { section: "gear-doctor-header", videoId: "rider-hero", mode: "background", overlayOpacity: 0.65, focalPoint: "50% 25%", start: 4 },
    { section: "cta-band",      videoId: "rider-hero", mode: "background", overlayOpacity: 0.7, start: 3 },
    { section: "about",         videoId: "rider-hero", mode: "scrub",      overlayOpacity: 0.55, mobileMode: "background" },
    { section: "footer",        videoId: "rider-hero", mode: "background", overlayOpacity: 0.85, playbackRate: 0.6, start: 5 },
    { section: "404",           videoId: "rider-hero", mode: "background", overlayOpacity: 0.7 },
  ],

  /* --------------------------------------------------------------------------
   * NAVIGATION & FOOTER
   * ------------------------------------------------------------------------ */
  nav: [
    { label: "Shop", href: "shop.html" },
    { label: "Helmets", href: "shop.html?cat=helmets" },
    { label: "Suits", href: "shop.html?cat=race-suits" },
    { label: "Gear Doctor", href: "gear-doctor.html" },
    { label: "About", href: "about.html" },
    { label: "Contact", href: "contact.html" },
  ],
  footer: {
    blurb: "Premium riding gear, explained simply by a rider who uses it. Ride. Learn. Repeat.",
    columns: [
      { title: "Shop", links: [
        { label: "All gear", href: "shop.html" },
        { label: "Helmets", href: "shop.html?cat=helmets" },
        { label: "Race suits", href: "shop.html?cat=race-suits" },
        { label: "Gloves", href: "shop.html?cat=gloves" },
      ]},
      { title: "Gear Doctor", links: [
        { label: "All guides", href: "gear-doctor.html" },
        { label: "DOT vs FIM", href: "guide.html?id=dot-vs-fim" },
        { label: "Suit fit", href: "guide.html?id=race-suit-fit" },
      ]},
      { title: "Store", links: [
        { label: "About Umair", href: "about.html" },
        { label: "Contact", href: "contact.html" },
        { label: "Cart", href: "cart.html" },
      ]},
    ],
    legal: "© 2026 [PLACEHOLDER: legal business name]. All rights reserved.",
  },

  /* --------------------------------------------------------------------------
   * HOMEPAGE COPY
   * ------------------------------------------------------------------------ */
  home: {
    hero: {
      eyebrow: "Fury Moto × The Gear Doctor",
      ctas: [
        { label: "Shop Gear", href: "shop.html", style: "primary" },
        { label: "Gear Doctor", href: "gear-doctor.html", style: "ghost" },
      ],
    },
    builtForRide: {
      title: "Built for the ride",
      beats: [
        { title: "Protection", text: "Certified shells, CE level 2 armour and leather that's been down the road before you." },
        { title: "Fit", text: "Gear only protects if it fits. Every product comes with a real size guide and a rider to ask." },
        { title: "Confidence", text: "Know exactly what you're wearing, so all that's left is the ride." },
      ],
    },
    categoriesTitle: "Shop by category",
    featuredTitle: "Rider's picks",
    featuredIds: [],                 // product ids to feature; empty = products with the "Rider's pick" badge
    ctaBand: {
      title: "Not sure what fits?",
      text: "Ask the Gear Doctor. Send your height, weight and bike — get a straight answer.",
      button: "Ask on WhatsApp",
      message: "Hi Gear Doctor! I need help choosing gear. Height: , Weight: , Bike: ",
    },
    instagramTitle: "On Instagram",
    testimonialsTitle: "Riders say",
    faqTitle: "Questions",
  },

  /* --------------------------------------------------------------------------
   * ABOUT / CONTACT / 404 COPY
   * ------------------------------------------------------------------------ */
  about: {
    title: "The rider behind the gear",
    intro: "[PLACEHOLDER: 1–2 sentence intro from Umair]",
    story: [
      "[PLACEHOLDER: paragraph — how Umair started riding]",
      "[PLACEHOLDER: paragraph — GSX-R1000, R1, S1000RR and track days]",
      "[PLACEHOLDER: paragraph — why he started The Gear Doctor]",
    ],
    bikes: ["GSX-R1000", "R1", "S1000RR"],
    stats: [
      { value: "12K+", label: "Instagram riders" },
      { value: "3", label: "Superbikes ridden" },
      { value: "[PLACEHOLDER]", label: "Track days" },
    ],
    image: "assets/source/fury_moto_2026-05-21_1.jpg",
  },
  contact: {
    title: "Talk to a rider",
    text: "Fastest reply is on WhatsApp. Sizing help, stock checks and orders.",
    formNote: "This form opens WhatsApp with your message pre-filled.",
  },
  notFound: {
    title: "Wrong turn.",
    text: "This page ran wide at turn one. Let's get you back on the racing line.",
    button: "Back to home",
  },
  ui: {
    addToCart: "Add to cart",
    outOfStock: "Out of stock",
    orderOnWhatsapp: "Order on WhatsApp",
    cashOnDelivery: "Cash on delivery available",
    sizeGuide: "Size guide",
    askSizing: "Ask the Gear Doctor about sizing",
    emptyCart: "Your cart is empty. Time to gear up.",
    searchPlaceholder: "Search helmets, suits, brands…",
    subtotal: "Subtotal",
    related: "You might also need",
    gearDoctorNote: "Gear Doctor's note",
  },

  /* --------------------------------------------------------------------------
   * CATEGORIES — `id` is used in shop.html?cat=<id> and product.category
   * ------------------------------------------------------------------------ */
  categories: [
    { id: "helmets",       title: "Helmets",                 image: "assets/img/categories/helmets.webp",    videoSlot: "category-cards", videoStart: 0 },
    { id: "race-suits",    title: "Race Suits",              image: "assets/img/categories/race-suits.webp", videoSlot: "category-cards", videoStart: 2 },
    { id: "jackets",       title: "Jackets",                 image: "assets/img/categories/jackets.webp" },
    { id: "gloves",        title: "Gloves",                  image: "assets/img/categories/gloves.webp",     videoSlot: "category-cards", videoStart: 4 },
    { id: "boots",         title: "Boots",                   image: "assets/img/categories/boots.webp" },
    { id: "protection",    title: "Body Armour & Protection",image: "assets/img/categories/protection.webp" },
    { id: "accessories",   title: "Accessories & Comms",     image: "assets/img/categories/accessories.webp" },
  ],

  /* --------------------------------------------------------------------------
   * BRANDS
   * ------------------------------------------------------------------------ */
  brands: [
    // { id: "alpinestars", name: "Alpinestars", logo: "" }  — filled by placeholder-data agent
  ],

  /* --------------------------------------------------------------------------
   * PRODUCTS — the shape every product must follow (see docs/CONTRACTS.md)
   *   id, title, brand (brand id), category (category id),
   *   price, compareAtPrice (null if not on sale),
   *   sizes[], colors[{ name, hex }], certifications[] ("DOT","ECE 22.06","FIM","SNELL","CE Level 1","CE Level 2"),
   *   images[{ src, alt }], video (a videos[].id or null),
   *   specs{ label: value }, description, inStock, badges[] ("New","Rider's pick","Sale"),
   *   gearDoctorNote (short expert note)
   * ------------------------------------------------------------------------ */
  products: [
    // Filled by the placeholder-data agent (>= 24 items).
  ],

  /* --------------------------------------------------------------------------
   * SIZE GUIDES — one per category id. columns + rows render as a table.
   * ------------------------------------------------------------------------ */
  sizeGuides: {
    // helmets: { note: "Measure around your head 2cm above the eyebrows.", columns: ["Size","Head (cm)"], rows: [["S","55–56"]] }
  },

  /* --------------------------------------------------------------------------
   * GEAR DOCTOR GUIDES
   *   type: "safety" | "myth" | "buying"
   *   body: markdown-lite — blank line = paragraph, "## " = heading, "- " = bullet, **bold**
   *   cover: image path; video: optional videos[].id
   *   source: optional Instagram post URL the guide is based on
   * ------------------------------------------------------------------------ */
  guides: [
    // Seeded by the placeholder-data agent / Instagram captions.
  ],

  /* --------------------------------------------------------------------------
   * INSTAGRAM STRIP — latest posts shown on home + Gear Doctor.
   * Each { image, url, caption, account }. Generated from assets/instagram/manifest.json.
   * ------------------------------------------------------------------------ */
  instagramPosts: [],

  testimonials: [
    // { name, bike, quote, rating }
  ],
  faqs: [
    // { q, a }
  ],

  /* --------------------------------------------------------------------------
   * SEO
   * ------------------------------------------------------------------------ */
  seo: {
    defaultTitle: "The Gear Doctor — Motorcycle Riding Gear in Pakistan",
    titleTemplate: "%s | The Gear Doctor",
    description: "Helmets, race suits, gloves and boots chosen and explained by rider Umair (@fury__moto). Know your gear before you ride.",
    ogImage: "assets/img/og/og-default.jpg",
  },
};

export default config;
