/**
 * ============================================================================
 *  SITE CONFIG — THE ONLY FILE YOU NEED TO EDIT
 * ============================================================================
 *  Every piece of user-facing text, every price label, colour, font, link,
 *  image and video on the site comes from this object. HTML files contain
 *  structure only; CSS reads colours/fonts from here at load time.
 *
 *  Conventions
 *  - Anything still unknown is written "[PLACEHOLDER: what's needed]".
 *    Set devMode: true to see every placeholder highlighted on the page.
 *  - Arrays are lists: add an object -> it appears on the site. Remove -> gone.
 *  - Paths are relative to the site root (no leading slash), e.g. "assets/img/x.webp".
 *  - Prices are whole numbers in the store currency (PKR). No commas.
 *  - Product/category/brand data lives in the API (slugs in URLs: product.html?slug=...).
 * ============================================================================
 */

const config = {
  /** true = outline every [PLACEHOLDER] in red and log a list in the console. Set false before launch. */
  devMode: true,

  /* --------------------------------------------------------------------------
   * STORE — identity & contact
   * ------------------------------------------------------------------------ */
  store: {
    name: "The Gear Doctor",                // default from the brief — confirm final store name
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
   *   (the site background is NOT here: it uses config.backdrop.frames)
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
      crop: "assets/video/rider-hero-crop.mp4",
      loop: true,
      focalPoint: "50% 30%",
      aspect: "9/16",
    },
    // Instagram reels are added here by the media pipeline (same shape).
  ],

  /* --------------------------------------------------------------------------
   * BACKDROP: the scroll-driven background of the whole site.
   * The rider clips are extracted to image sequences (docs/MEDIA.md) and drawn on
   * one fixed full-screen <canvas> behind every page. Nothing plays on its own:
   * the frame shown is decided by your scroll position.
   *   top of the page = first frame (still), scroll down = forward,
   *   scroll up = backward, stop = hold, bottom of the page = last frame.
   * Two sequences, picked by screen ORIENTATION: landscape screens (wider than tall)
   * get the 16:9 clip, portrait screens get the 9:16 clip. Rotating or resizing
   * switches sequence and keeps the same scroll progress. Only the active one loads.
   * The frame always fills the whole screen (cover); with matching aspect ratios
   * there's almost no crop.
   * ------------------------------------------------------------------------ */
  backdrop: {
    enabled: true,                 // false = plain dark background, no canvas
    pages: "all",                  // "all", or a list of page names, e.g. ["home","shop"]

    // Image sequences. %04d = 4-digit frame number starting at 0001.
    sequences: {
      landscape: {                                            // screens wider than tall (laptops, desktops, ultrawide)
        path: "assets/frames/16x9/1920/frame_%04d.webp",      // 1920×1080 frames: large screens on a good connection
        pathSmall: "assets/frames/16x9/1280/frame_%04d.webp", // 1280×720 frames: smaller laptops / slow connections / Save-Data
        count: 240,                                           // frames in each of the two folders (they must match); 240 = every frame of the 10 s clip at 24 fps
        focalPoint: { x: 0.5, y: 0.5 },                       // centre of the small crop on odd shapes (0–1 of the frame)
      },
      portrait: {                                             // screens taller than wide (phones, portrait tablets)
        path: "assets/frames/9x16/1080/frame_%04d.webp",      // 1080×1920 frames: large / high-DPI portrait screens
        pathSmall: "assets/frames/9x16/720/frame_%04d.webp",  // 720×1280 frames: phones / slow connections / Save-Data
        count: 188,                                           // frames in each of the two folders (they must match); 188 = every frame of the 7.85 s clip
        focalPoint: { x: 0.5, y: 0.5 },                       // centre of the small crop on tall phones (0–1 of the frame)
      },
    },
    alt: "Rider in a red and black race suit in a hazy pit garage", // described once for screen readers

    // How scroll maps to frames.
    scroll: {
      mapping: "page",     // "page" = whole page top→bottom plays the clip once (default)
                           // "distance" = one pass per `screensPerLoop` screens (optional)
      smoothing: 0.07,     // easing behind the scroll: 0.05 = floaty … 0.3 = tight, 1 = none (0.07 = glides just behind)
      startOffset: 0,      // px scrolled before the clip starts moving (holds frame 1 until then)
      endOffset: 0,        // px before the page bottom at which the last frame is reached
      screensPerLoop: 4,   // only for mapping "distance"
      pingpong: false,     // only for mapping "distance": run backwards at the end instead of jumping
    },

    overscale: 1.04,       // draw slightly larger than the screen so mouse parallax never reveals an edge
    stillFrame: 1,         // frame shown (and nothing else loaded) for reduced-motion / Save-Data visitors

    // Section looks. Each section the visitor scrolls into tints the backdrop.
    // Allowed: brightness (1 = normal), blur (px, whole backdrop), dim (0–1 dark overlay),
    // tint (0–1 red glow). Never zoom/crop. Pick a look per section with data-scene="<name>"
    // in the HTML; sections without one use `defaultScene`; product grids use "shelf".
    defaultScene: "content",
    scenes: {
      hero:    { brightness: 1,    blur: 0, dim: 0.10, tint: 0.10 },
      feature: { brightness: 0.95, blur: 0, dim: 0.30, tint: 0.30 },
      content: { brightness: 0.85, blur: 2, dim: 0.45, tint: 0.08 },
      shelf:   { brightness: 0.75, blur: 6, dim: 0.60, tint: 0.00 },  // product grids: calmest
      footer:  { brightness: 0.80, blur: 3, dim: 0.55, tint: 0.40 },
    },

    // Motion-design layer on top of the canvas. Every switch can be turned off.
    motion: {
      sceneDuration: 1.2,    // seconds a section look takes to blend in
      pointerParallax: 0.02, // how far the mouse nudges the focal point on desktop (fraction of the frame, max ~0.02); 0 = off
      lightSweep: true,      // slow diagonal light streak
      progressBar: true,     // thin red scroll-progress line at the top
      splitHeadlines: true,  // section headlines reveal word by word
      marquee: {             // tagline ticker; speeds up and skews with scroll velocity
        enabled: true,
        pages: ["home", "gear-doctor", "about"],
        after: "first",      // inserted after the first section of the page
        items: ["Ride. Learn. Repeat.", "Know your gear before you ride.", "Gear explained simply.", "Fury Moto × The Gear Doctor"],
      },
    },
  },

  /* --------------------------------------------------------------------------
   * VIDEO SLOTS: the small, separate videos (the background above is not one).
   *   section        : matches data-video-slot="<section>" in the HTML
   *   videoId        : an id from `videos` (null = the element says which, e.g. product.video)
   *   mode           : "card" (plays on hover / when in view) | "inline" (gallery slide) | "none"
   *   overlayOpacity : 0–1 dark gradient over the video
   * ------------------------------------------------------------------------ */
  videoSlots: [
    { section: "category-cards",  videoId: "rider-hero", mode: "card",   overlayOpacity: 0.35 },
    { section: "product-gallery", videoId: null,         mode: "inline", overlayOpacity: 0 }, // uses product.video
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
    ctaBand: {
      title: "Not sure what fits?",
      text: "Ask the Gear Doctor. Send your height, weight and bike — get a straight answer.",
      button: "Ask on WhatsApp",
      message: "Hi Gear Doctor! I need help choosing gear. Height: , Weight: , Bike: ",
    },
    instagramTitle: "On Instagram",
    guidesTitle: "From the Gear Doctor",
    guidesAll: "All guides",
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
    // [PLACEHOLDER: swap for a real portrait, e.g. assets/img/photos/fury_moto_2026-05-21_1-1600.webp after running tools/media.sh photos]
    image: "assets/img/stills/rider-1-1600.webp",
  },
  gearDoctor: {
    pageTitle: "Gear Doctor",
    eyebrow: "@fury_the_gear_doc",
    title: "The Gear Doctor",
    intro: "Safety tips, gear myths and buying guides. Motorcycle gear explained simply, by a rider who actually uses it.",
    followCta: "Follow on Instagram",
    filterLabel: "Filter guides by type",
    filters: [
      { id: "all", label: "All" },
      { id: "safety", label: "Safety" },
      { id: "myth", label: "Myths" },
      { id: "buying", label: "Buying guides" },
    ],
    typeLabels: { safety: "Safety", myth: "Myth", buying: "Buying guide" },
    featured: "Featured",
    readGuide: "Read guide",
    minRead: "min read",
    empty: "No guides in this category yet. Check back soon.",
    cta: {
      title: "Got a gear question?",
      text: "Send the Gear Doctor your height, weight and bike. Get a straight answer.",
      button: "Ask on WhatsApp",
      message: "Hi Gear Doctor! I have a gear question: ",
    },
    guide: {
      back: "All guides",
      source: "Based on our Instagram post",
      related: "Gear mentioned in this guide",
      prev: "Previous guide",
      next: "Next guide",
      share: "Share",
      shareWhatsapp: "WhatsApp",
      shareFacebook: "Facebook",
      shareX: "X",
      copyLink: "Copy link",
      copied: "Link copied",
      notFoundTitle: "Guide not found",
      notFoundText: "That guide doesn't exist or has moved. Browse all Gear Doctor guides instead.",
      notFoundButton: "Back to Gear Doctor",
      viewProduct: "View product",
    },
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
    cartTitle: "Your cart",
    cartClose: "Close cart",
    cartRemove: "Remove",
    cartDecrease: "Decrease quantity",
    cartIncrease: "Increase quantity",
    cartView: "View cart",
    cartShop: "Shop gear",
    cartContinue: "Continue shopping",
    cartSize: "Size",
    cartColor: "Colour",
    cartQty: "Quantity",
    cartUnitPrice: "Price",
    cartLineTotal: "Total",
    cartProduct: "Product",
    cartSummary: "Order summary",
    cartPreview: "Your WhatsApp message",
    cartPreviewNote: "This is exactly what we'll receive. Add your name and address before sending.",
    cartClear: "Clear cart",
    cartItems: "items",
    // --- checkout (cart agent) ---
    checkout: "Checkout",
    cartDelivery: "Delivery",
    cartTotal: "Total",
    cartFeeUnknown: "Calculated at checkout",
    cartChecking: "Checking prices and stock…",
    cartCheckError: "We couldn’t check stock just now. Check your connection and try again.",
    cartBlocked: "Remove the sold-out items to continue.",
    cartLineSoldOut: "Sold out",
    cartLineUnavailable: "No longer available",
    cartMaxQty: "Maximum quantity reached",
    cartChangedTitle: "Your cart changed",
    cartChangedDismiss: "Dismiss",
    chgPrice: "Price of {title} changed from {from} to {to}.",
    chgReduced: "Only {n} left of {title}. Quantity reduced.",
    chgSoldOut: "{title} is sold out. Remove it to continue.",
    chgUnavailable: "{title} is no longer available. Remove it to continue.",
    coTitle: "Checkout",
    coBack: "Back to cart",
    coDetails: "Your details",
    coName: "Full name",
    coPhone: "Phone / WhatsApp",
    coPhoneHint: "Format: 03xx-xxxxxxx",
    coCity: "City",
    coAddress: "Delivery address",
    coNotes: "Order notes (optional)",
    coPayment: "Payment method",
    coCod: "Cash on delivery",
    coCodNote: "Pay the rider in cash when your order arrives.",
    coBank: "Bank transfer",
    coBankNote: "We will send you our bank details on WhatsApp. Your order is confirmed once the payment arrives.",
    coNoPayment: "Online ordering is paused right now. Please message us on WhatsApp to order.",
    coSecurity: "Security check",
    coTurnstileFail: "The security check could not load. Reload the page and try again.",
    coTurnstileNeeded: "Please complete the security check.",
    coPlace: "Place order",
    coPlacing: "Placing your order…",
    coItems: "Your items",
    coRequired: "This field is required.",
    coPhoneInvalid: "Enter a valid phone number, for example 0300-1234567.",
    coErrorSummary: "Please fix the highlighted fields.",
    coGenericError: "Something went wrong placing your order. Please try again.",
    coRateLimit: "Too many attempts. Please wait a minute and try again.",
    coCartChanged: "Your cart changed, so we have not placed the order yet. Review the changes and check out again.",
    coDoneTitle: "Order received",
    coDoneNumber: "Order number",
    coDoneTotal: "Total to pay",
    coNextTitle: "What happens next",
    coNext1: "Send your order to us on WhatsApp so we can confirm it.",
    coNext2: "We confirm stock, delivery time and payment with you.",
    coNext3: "We dispatch your order and share tracking.",
    coSendWa: "Send order on WhatsApp",
    coWaFallback: "If WhatsApp did not open, copy this message and send it to us.",
    coCopy: "Copy message",
    coCopied: "Copied",
    coContinue: "Continue shopping",
    searchPlaceholder: "Search helmets, suits, brands…",
    menu: "Menu",
    close: "Close",
    search: "Search",
    cart: "Cart",
    shop: "Shop",
    skip: "Skip to content",
    videoPlay: "Play video",   // video engine (inline gallery video)
    videoPause: "Pause video",
    homeLabel: "Go to home page",
    mainNav: "Main navigation",
    mobileNav: "Quick navigation",
    menuWhatsapp: "Chat on WhatsApp",
    menuFollow: "Follow",
    searchNoResults: "No matches. Try another word or ask the Gear Doctor.",
    searchSeeAll: "See all results",
    searchCategories: "Categories",
    searchProducts: "Products",
    searchHint: "Type to search. Use arrow keys, Enter to open, Esc to close.",
    searchResults: "Search results",
    subtotal: "Subtotal",
    related: "You might also need",
    gearDoctorNote: "Gear Doctor's note",
    quickView: "Quick view",
    quickViewLabel: "Quick view: {title}",
    soldOut: "Sold out",
    pdHome: "Home",
    pdBreadcrumb: "Breadcrumb",
    pdNotFoundTitle: "Product not found",
    pdNotFoundText: "We couldn't find that product. It may have sold out or moved.",
    pdBackToShop: "Back to the shop",
    pdGallery: "Product gallery",
    pdPrev: "Previous image",
    pdNext: "Next image",
    pdThumb: "Show image {n}",
    pdVideo: "Product video",
    pdSize: "Size",
    pdColor: "Colour",
    pdQty: "Quantity",
    pdQtyMinus: "Decrease quantity",
    pdQtyPlus: "Increase quantity",
    pdSizeError: "Please choose a size first.",
    pdCertifications: "Safety certifications",
    pdSpecs: "Specifications",
    pdDescription: "Details",
    pdSizingMessage: "Hi! Sizing question about {title}. Height: , Weight: , Usual size: ",
    pdSizeGuideTitle: "Size guide",
    pdSizeGuideEmpty: "No size guide for this category yet. Ask the Gear Doctor on WhatsApp.",
    pdInStock: "In stock",
    // --- API states (storefront catalogue) ---
    retry: "Try again",
    apiErrorTitle: "We can’t reach the store right now",
    apiErrorText: "Check your connection and try again in a moment.",
    apiErrorOtherTitle: "Something went wrong",
    apiErrorOtherText: "Please try again.",
    loadMore: "Load more",
    onlyNLeft: "Only {n} left",
    certInfo: {
      "ECE 22.06": "The current European helmet safety standard. Tests impact at more angles and speeds than the older 22.05, including rotational forces.",
      "DOT": "US Department of Transportation minimum standard. Self-certified by the maker, so it is a baseline, not a guarantee.",
      "FIM": "Racing homologation from the international motorcycling federation. Required for track and circuit competition.",
      "SNELL": "Independent, voluntary helmet standard with stricter impact testing than the legal minimum.",
      "CE Level 1": "Armour that passes EN 1621 impact tests at the baseline transmitted-force limit. Good for everyday riding.",
      "CE Level 2": "Armour that transmits roughly half the impact force of Level 1. Best protection for sport and track riding.",
    },
    // --- shop (added by shop agent) ---
    shopAll: "All Gear",
    shopCount: "{n} products",
    shopCountOne: "1 product",
    shopCategories: "Shop by category",
    shopAllCategories: "All",
    filters: "Filters",
    filtersTitle: "Filter gear",
    filterCategory: "Category",
    filterBrand: "Brand",
    filterSize: "Size",
    filterPrice: "Price",
    filterPriceMin: "Min",
    filterPriceMax: "Max",
    filterCert: "Certification",
    filterInStock: "In stock only",
    filterApply: "Show results",
    filterClear: "Clear all",
    filterRemove: "Remove filter",
    activeFilters: "Active filters",
    sortBy: "Sort by",
    sortFeatured: "Featured",
    sortPriceAsc: "Price: low to high",
    sortPriceDesc: "Price: high to low",
    sortNew: "Newest",
    sortName: "Name A–Z",
    resultsFor: "Results for",
    noResultsTitle: "Nothing matches those filters.",
    noResultsText: "Try removing a filter or searching for something else.",
    quickView: "Quick view",
    viewDetails: "View full details",
    selectSize: "Select size",
    chooseSize: "Choose a size",
    close: "Close",
    shopLoading: "Loading gear…",
    shopTitle: "Shop",
    shopDescription: "Browse helmets, race suits, gloves, boots and protection chosen by a rider.",
    // --- footer / about / contact (About-Contact-Footer agent) ---
    footerContact: "Contact",
    footerFollow: "Follow",
    footerNav: "Footer navigation",
    contactWhatsapp: "WhatsApp",
    contactPhone: "Phone",
    contactEmail: "Email",
    contactVisit: "Visit",
    contactHours: "Hours",
    aboutEyebrow: "About",
    aboutBikesTitle: "Bikes ridden",
    aboutImageAlt: "Umair, rider and creator behind Fury Moto, in his race gear",
    aboutFollowTitle: "Follow the ride",
    aboutShopCta: "Shop gear",
    aboutDoctorCta: "Visit the Gear Doctor",
    openLink: "Open",
    contactEyebrow: "Contact",
    contactMapTitle: "Map showing the store location",
    contactFormTitle: "Send a message",
    formName: "Your name",
    formPhone: "Phone / WhatsApp",
    formTopic: "Topic",
    formMessage: "Message",
    formSend: "Send on WhatsApp",
    formTopics: [
      { id: "sizing", label: "Sizing help" },
      { id: "order", label: "My order" },
      { id: "stock", label: "Stock check" },
      { id: "other", label: "Something else" },
    ],
    formGreeting: "Hi Gear Doctor!",
    formErrorName: "Please enter your name.",
    formErrorPhone: "Please enter a valid phone number.",
    formErrorMessage: "Please write a short message.",
    contactFaqTitle: "Quick answers",
    igView: "View this post on Instagram",
    igPost: "Instagram post",
  },

  /* --------------------------------------------------------------------------
   * CATEGORY TILE DESIGN — categories, brands and products now come from the API
   * (GET /api/categories, /brands, /products). Only the design-only extras that
   * the API does not store stay here, keyed by category slug: which tiles play a
   * video slot (see videoSlots) and where in the clip they start.
   * ------------------------------------------------------------------------ */
  categoryTiles: {
    "helmets":    { videoSlot: "category-cards", videoStart: 0 },
    "race-suits": { videoSlot: "category-cards", videoStart: 2 },
    "gloves":     { videoSlot: "category-cards", videoStart: 4 },
  },

  /* --------------------------------------------------------------------------
   * SIZE GUIDES — one per category id. columns + rows render as a table.
   * ------------------------------------------------------------------------ */
  sizeGuides: {
    helmets: {
      note: "Measure around your head about 2 cm above your eyebrows with a soft tape. Shell shapes vary by brand, so check the brand chart if you are between sizes.",
      columns: ["Size", "Head circumference (cm)"],
      rows: [["XS", "53–54"], ["S", "55–56"], ["M", "57–58"], ["L", "59–60"], ["XL", "61–62"], ["XXL", "63–64"]],
    },
    "race-suits": {
      note: "Measure chest at its widest point and waist at the navel. Race suits are cut tight for a tucked position, so do not size up for comfort on the bike. Sizes are EU numbers.",
      columns: ["Size", "Chest (cm)", "Waist (cm)", "Height (cm)"],
      rows: [["46", "92–96", "76–80", "165–170"], ["48", "96–100", "80–84", "168–173"], ["50", "100–104", "84–88", "170–175"], ["52", "104–108", "88–92", "173–178"], ["54", "108–112", "92–96", "175–180"], ["56", "112–116", "96–100", "178–184"]],
    },
    jackets: {
      note: "Measure chest over a thin shirt, not over armour. Leather jackets fit snug when new, so size down if you are between sizes and ride in layers.",
      columns: ["Size", "Chest (cm)", "Sleeve (cm)"],
      rows: [["S", "88–92", "62"], ["M", "92–96", "63"], ["L", "96–100", "64"], ["XL", "100–104", "65"], ["XXL", "104–108", "66"]],
    },
    gloves: {
      note: "Measure around the knuckles of your riding hand, thumb excluded. Gloves should be snug with fingers relaxed on the bars.",
      columns: ["Size", "Hand circumference (cm)"],
      rows: [["S", "18–19"], ["M", "19–20"], ["L", "20–21"], ["XL", "21–22"], ["XXL", "22–23"]],
    },
    boots: {
      note: "Measure foot length in centimetres from heel to longest toe, then match to the EU size. Try boots on with the socks you ride in.",
      columns: ["EU size", "Foot length (cm)"],
      rows: [["39", "24.5–25.0"], ["40", "25.0–25.5"], ["41", "25.5–26.0"], ["42", "26.5–27.0"], ["43", "27.0–27.5"], ["44", "27.5–28.0"], ["45", "28.5–29.0"], ["46", "29.0–29.5"]],
    },
    protection: {
      note: "Measure chest and torso length from the base of the neck to the top of the hips. Back protectors are sized by torso length.",
      columns: ["Size", "Chest (cm)", "Torso length (cm)"],
      rows: [["S", "86–91", "45–48"], ["M", "91–96", "48–51"], ["L", "96–101", "51–54"], ["XL", "101–106", "54–57"], ["XXL", "106–111", "57–60"]],
    },
    accessories: {
      note: "Most accessories are one size. Check the compatibility note on each product, since visors and inserts are model-specific.",
      columns: ["Item", "Fits"],
      rows: [["Pinlock insert", "Helmets with a Pinlock mount"], ["Balaclava", "Under any full face helmet"], ["Knee sliders", "Race suits and jackets with knee pockets"]],
    },
  },

  /* --------------------------------------------------------------------------
   * GEAR DOCTOR GUIDES
   *   type: "safety" | "myth" | "buying"
   *   body: markdown-lite — blank line = paragraph, "## " = heading, "- " = bullet, **bold**
   *   cover: image path; video: optional videos[].id
   *   source: optional Instagram post URL the guide is based on
   * ------------------------------------------------------------------------ */
  guides: [
    {
      id: "dot-vs-fim",
      title: "DOT vs FIM — which helmet is actually safer?",
      type: "safety",
      excerpt: "DOT is a self-declared US minimum and FIM is a racing homologation; neither label tells the whole safety story on its own.",
      body: `## The short answer

A DOT sticker and a FIM sticker are not the same kind of promise. Neither one guarantees a helmet will save you in every crash, and the "safer" one depends on what you ride and how you ride it.

## What DOT means

DOT is the US federal standard (FMVSS 218). Manufacturers certify their own helmets, so the sticker is a claim the maker stands behind rather than a stamp from an independent lab. It sets a floor: the helmet must absorb impacts, stay on the head and resist penetration.

## What FIM means

FIM homologation is the racing federation's standard for helmets used in FIM-sanctioned events. It is tested by independent labs and adds requirements designed for track conditions, so a FIM helmet is built and checked for racing.

## Where ECE 22.06 fits

ECE 22.06 is the European standard. It is tested by independent labs, covers more impact points than older versions and includes angled (oblique) impact tests. For most street riders it is the most useful label to look for.

## So which one is safer?

- **For street riding:** an ECE 22.06 helmet with a good fit is the practical pick.
- **For track days:** a helmet carrying both ECE 22.06 and FIM is the strongest combination.
- **On a tighter budget:** a DOT helmet from a known brand is still legal, but make sure the fit is right.

**Fit beats labels.** A helmet that moves on your head at highway speed is a bad helmet, whatever the sticker says. Check the chin strap, the cheek pads and how the shell sits on your brow before you pay.

Read the inner label as well as the outer sticker. Stickers can be copied, so buy from a store that shows you the real label and tells you which test standard the model carries.`,
      cover: "assets/img/categories/helmets.webp",
      video: "rider-hero",
      relatedProducts: ["shoei-x14-full-face", "agv-pista-gp-rr-carbon", "ls2-ff805-thunder-carbon"],
      source: "https://www.instagram.com/fury_the_gear_doc/reel/DfhP8xDth6A/",
    },
    {
      id: "race-suit-fit",
      title: "How a race suit should fit",
      type: "buying",
      excerpt: "A race suit is cut to hold you in a tucked position, so the fit that feels right in the shop can be wrong on the bike.",
      body: `## Measure, then trust the chart

A race suit is cut to keep you in place when you tuck, not to look good standing up. Take your measurements, compare them to the size chart, and only then choose a size.

## What to measure

- **Chest:** around the widest point, over a thin shirt.
- **Waist:** at the navel, relaxed.
- **Height:** the suit is sized for body length as well as width.

If you sit between two sizes, the bigger one gives more airflow but the smaller one may keep the armour in place better. Decide based on how you ride.

## Test the fit in a tuck

Stand in the suit and crouch as if you were on the bike, arms out and knees bent. Check that:

- The shoulder armour stays over your shoulder joint when you lean forward.
- The back does not pull tight across your shoulder blades.
- The crotch seam does not dig in when you bend.
- The sleeves do not ride up off your wrists when you reach for the bars.

## Leather and stretch

Leather breaks in with wear but does not stretch much. Buy for a snug fit with room to move, not for room to grow into. A suit that is too loose lets armour rotate in a crash, and a suit that is too tight restricts breathing and movement.

## Ask before you buy

Send us your chest, waist and height on WhatsApp along with the model you want. We will tell you which size suits your build and what to expect from the cut.`,
      cover: "assets/img/categories/race-suits.webp",
      video: null,
      relatedProducts: ["alpinestars-gp-pro-r-v3-suit", "dainese-misano-3-perforated", "revit-quantum-2-two-piece", "alpinestars-gp-plus-v4-suit"],
    },
    {
      id: "leather-vs-textile",
      title: "Gear myths: leather vs textile",
      type: "myth",
      excerpt: "Leather is not automatically safer than textile, and textile is not automatically the cheap option; construction and armour matter more.",
      body: `## The myth

Leather is the safe choice and textile is the cheap one. Like most gear myths, that is half true and half marketing.

## Where leather wins

Leather is naturally abrasion resistant. In a slide, a good leather suit or jacket holds up well against road contact, which is why it is the standard for racing. It also keeps the shape of its armour pockets well over the years.

## Where textile wins

Modern textiles, usually high-denier nylon or polyester with reinforced panels, perform very well in abrasion tests. They are also lighter, far more breathable, available with waterproof membranes, and easier to wear through a hot or wet commute. A textile jacket also dries out faster after a rainy ride, so there is less chance of stiffness and odour building up between trips.

## What actually matters

- **Thickness and construction:** thin leather with poor seams is weaker than a well-built textile.
- **Armour:** CE Level 2 armour in the right places matters more than the outer material.
- **Coverage:** a jacket that rides up leaves your back exposed whatever it is made from.
- **Use:** track riders often benefit from leather, while commuters usually get more from a waterproof textile jacket they will actually wear.

## The Gear Doctor verdict

Pick the material that fits how you ride. A waterproof textile jacket with proper armour that you wear every day beats a leather suit that stays in the cupboard because it is too hot to ride in.

Always check the CE label on any jacket. If the armour is not marked, the material cannot make up for it.`,
      cover: "assets/img/categories/jackets.webp",
      video: null,
      relatedProducts: ["alpinestars-missile-v2-jacket", "dainese-mugello-leather-jacket", "revit-sand-4-h2o-jacket"],
    },
    {
      id: "first-helmet",
      title: "Choosing your first helmet",
      type: "buying",
      excerpt: "Your first helmet should match how you ride, fit your head properly and carry a recognised standard, in that order.",
      body: `## Start with your riding

Your first helmet should match how you actually ride. A commuter on city roads has different needs from a rider going to track days. For most riders a full face helmet is the right first choice, because it protects the chin and jaw, which take the worst of many impacts.

## Get the fit right first

- Measure around your head about 2 cm above your eyebrows with a soft tape.
- Try helmets on in the store rather than trusting the size alone, because shell shapes differ between brands.
- Wear the socks or hairstyle you ride with, if they affect the fit.

A helmet should be snug everywhere with no pressure points. Cheek pads should press gently against your face. Shake your head: the helmet should move with you, not on its own.

## Check the label

Look for ECE 22.06 on the sticker and inner label. It is the most useful standard for street riders because it is tested by independent labs. DOT on its own is a legal minimum; read the DOT vs FIM guide for the full comparison.

## Set a budget that leaves room for fit

Do not buy a cheap helmet that does not fit and then a second one. Spend on the fit and the certification, then choose the finish and the colour.

- **Starter budget:** a known brand with ECE 22.06 and a fit you like.
- **Mid range:** add a Pinlock-ready visor or insert for fog and rain.
- **Track focus:** look at race-style shells with FIM homologation.

## Replace it after a crash

Most manufacturers advise replacing a helmet after a significant impact, even if it looks fine, because the inner foam can be damaged without visible signs. Keep your receipt and the box so you know exactly what you bought.

Message us on WhatsApp with your head size and riding style and we will help you narrow it down.`,
      cover: "assets/img/categories/helmets.webp",
      video: null,
      relatedProducts: ["arai-rx7v-evo", "hjc-rpha-11-carbon", "ls2-ff805-thunder-carbon"],
    },
    {
      id: "kangaroo-vs-cowhide",
      title: "Cowhide vs kangaroo leather for racing suits",
      type: "myth",
      excerpt: "Kangaroo is lighter for its strength, but cowhide is a serious racing material too, and thickness and seams matter more than the animal on the label.",
      body: `## The question riders ask

Kangaroo leather has a reputation as the top material for racing suits, and cowhide is often sold as the cheaper option. The truth is more useful than the reputation.

## Why kangaroo is prized

Kangaroo hide has a fine, tight grain and a good strength-to-weight ratio. A kangaroo suit can be thinner and lighter than a cowhide suit while still offering strong abrasion resistance. That helps riders who want less bulk and more feel in tight race positions.

## Why cowhide is still good

Cowhide is thicker and heavier, and it is widely used in quality suits. Well-tanned cowhide at a sensible thickness gives excellent abrasion protection and usually costs less. For a club racer or a track day rider it is a very sensible choice.

## What really changes the protection

- **Thickness:** a properly made 1.2 mm cowhide can be as useful as a thinner kangaroo suit.
- **Seams:** stitching and the way panels are joined decide how a suit tears.
- **Armour:** CE Level 2 armour in the right places does more than the leather type.
- **Fit:** a suit that stays in place protects better than a thin suit that rides up.

## Look at the label

Ask for the leather thickness and the armour rating. A millimetre figure and a CE mark tell you more than the animal name on the tag.

## The Gear Doctor takeaway

Choose kangaroo if you want light weight and feel and can afford it. Choose cowhide if you want durability at a lower price. Either way, buy the size that fits rather than the material you read about most online.`,
      cover: "assets/img/categories/race-suits.webp",
      video: null,
      relatedProducts: ["alpinestars-gp-pro-r-v3-suit", "dainese-misano-3-perforated", "alpinestars-gp-plus-v4-suit"],
      source: "https://www.instagram.com/fury_the_gear_doc/reel/DfXGz1ANrQI/",
    },
    {
      id: "seam-strength",
      title: "Seam strength is really important",
      type: "safety",
      excerpt: "In a slide the seams take the load first, so the stitching and reinforcement of a suit matter as much as the leather around it.",
      body: `## Why seams matter

A jacket or suit is only as strong as the places where two pieces meet. In a slide, seams take load first, and a seam that opens early can expose skin very quickly.

## What to look for

- **Double or triple stitching** on high-load areas: shoulders, elbows, knees, hips and the back.
- **Bar-tack reinforcement** at stress points such as armour pockets and zip ends.
- **Tight, even stitch lines** with no skipped stitches or loose threads.
- **Seam allowances** that are not too narrow, because narrow seams tear sooner.

## Check the thread and the leather

Good seams use strong thread and leather that is not too thin at the edges. Ask the shop about the thread type and whether the seams are overlock or flat. A flat seam with a stiff join usually sits better against the skin.

## Test it yourself

Gently pull a seam by hand. It should not gape or stretch. Look at the inside of the suit: loose threads and uneven stitching are early warning signs.

## Armour pockets

The pockets that hold the armour are sewn into the suit, and their seams take impact load too. Check that the pocket fits snugly around the armour and that the stitching does not pucker.

## Do not forget the zip

Zips are a common weak point, especially on two-piece suits. Look for a heavy-duty zip that lies flat and closes fully, with reinforced stitching around its ends.

## The Gear Doctor rule

If you would not trust a seam on your own jeans, do not trust it on your suit. Ask us on WhatsApp about a specific model before you buy, and we will tell you where to check.`,
      cover: "assets/img/categories/race-suits.webp",
      video: null,
      relatedProducts: ["alpinestars-gp-pro-r-v3-suit", "revit-quantum-2-two-piece", "alpinestars-gp-plus-v4-suit"],
      source: "https://www.instagram.com/fury_the_gear_doc/reel/Deo2hpMNL9h/",
    },
    {
      id: "ce-level-2-armour",
      title: "CE Level 2 armour: does it stay in place?",
      type: "safety",
      excerpt: "CE Level 2 armour is tested for impact, but it only works if it stays where it was fitted, so pocket and jacket fit matter as much as the rating.",
      body: `## What CE Level 2 means

CE Level 2 is the higher of the two impact levels for motorcycle protectors under the EN 1621 family. The armour has been lab tested to transmit less force to the body than Level 1 under the test conditions. It does not mean the armour cannot be hurt, and it says nothing about whether the armour will stay in place.

## The movement problem

Armour that slides, rotates or sits at an angle cannot do its job. A loose elbow protector pushed up the arm, or a shoulder piece sitting over the collarbone instead of the joint, can leave the bone exposed.

## What keeps it in place

- **Correct pocket size:** the armour should fill its pocket without gaps or bunching.
- **Correct jacket size:** the jacket has to fit your body rather than float around it.
- **Fastening:** check the pocket closure and any straps. Velcro should grip firmly.
- **Position:** shoulder armour sits over the joint, elbow armour over the point of the elbow, and the back protector covers the spine.

## Check it on the bike

Sit in a riding position in the shop, then lean forward and reach for the bars. Lift your arms as if braking hard. The armour should not climb the sleeve or sit off the joint.

## When to upgrade

If your armour rotates or your jacket rides up, do not just tighten things. Check the size first, then the pockets. An ill-fitting jacket with the right armour can still fail to protect you.

## The Gear Doctor takeaway

CE Level 2 is a good target. Fit is what makes it work. Bring the jacket you plan to ride in when you try on armour, and ask us on WhatsApp if you are not sure.`,
      cover: "assets/img/categories/protection.webp",
      video: null,
      relatedProducts: ["alpinestars-nucleon-kr1-back-protector", "dainese-pro-armor-chest-protector", "dainese-sport-guard-jacket"],
      source: "https://www.instagram.com/fury_the_gear_doc/reel/Dejg9DNth0X/",
    },
    {
      id: "hard-knuckle-gloves",
      title: "Hard knuckles, but are your gloves protective?",
      type: "safety",
      excerpt: "Hard knuckle protectors help, but the palm and the fit of the glove decide whether your hand stays intact in a slide.",
      body: `## Hard knuckles are not the whole story

Hard knuckle protectors look serious and they do help against impacts to the back of the hand. But a glove is a system. If the palm tears through, the knuckles do not matter.

## Look at the palm first

In a slide your palm and fingers often touch the road first. Goatskin, cowhide or kangaroo leather palms are the usual choice because they resist abrasion well. A textile back with leather reinforcement on the exposed areas is fine for commuting.

## Check the certification

Motorcycle gloves are tested under EN 13594. Look for CE Level 1 or Level 2 on the label. Level 2 gloves are tested to a higher impact standard on the protected areas, so they are the better choice for faster riding and track use.

## Fit matters more than you think

- A glove that is too big bunches up and your grip gets weaker.
- A glove that is too small restricts blood flow and makes your hands tire.
- Protectors that move around do not protect the area you need.

Measure your hand around the knuckles without the thumb and use the size chart. Your fingers should reach the end of the glove when your hand is relaxed.

## Closure and cuffs

The wrist strap keeps the glove on during a crash, so pull it tight. Make sure the cuff overlaps your jacket sleeve so there is no gap at speed.

## The Gear Doctor takeaway

Choose gloves with a protective palm, a CE rating and a fit you can live with. Hard knuckles are a bonus. Ask us on WhatsApp if you want a recommendation for your riding style.`,
      cover: "assets/img/categories/gloves.webp",
      video: null,
      relatedProducts: ["alpinestars-sp-8-v3-gloves", "dainese-carbon-4-short-gloves", "alpinestars-gp-tech-v2-gloves"],
      source: "https://www.instagram.com/fury_the_gear_doc/reel/DebWdnaNZ-S/",
    },
  ],

  /* --------------------------------------------------------------------------
   * INSTAGRAM STRIP — latest posts shown on home + Gear Doctor.
   * Each { image, url, caption, account }. Generated from assets/instagram/manifest.json.
   * ------------------------------------------------------------------------ */
  // How Instagram content is shown.
  instagram: {
    embeds: true,      // posts without an `image` show as Instagram's official embed (real post, plays reels).
                       // false = never load Instagram's script; those posts become plain links instead.
    embedCount: 6,     // max embeds in a strip (they're heavy: each is a full Instagram post)
    stripCount: 8,     // max image tiles in a strip, once posts have downloaded `image` files
  },
  // Your posts. Newest first per account; the home strip alternates the two accounts.
  //   url     : the post / reel link
  //   account : "@fury__moto" or "@fury_the_gear_doc" (must match socials.instagram handles)
  //   date    : YYYY-MM-DD if known
  //   caption : short caption (used as alt text / fallback text)
  //   image   : OPTIONAL path to a downloaded image/cover in assets/instagram/… -> shows a light
  //             image tile instead of the embed. Fill these in after dropping your media files in.
  instagramPosts: [
    // Skipped on purpose (collabs with other creators, brief says own posts only): p/DTyGbAXE-Gb (with another account), reel/Df7itwqxl80 (with another rider).
    { url: "https://www.instagram.com/reel/DfrdLg9R37w/", account: "@fury__moto", date: null, caption: "", image: "" },
    { url: "https://www.instagram.com/reel/DfUlgkcRfGo/", account: "@fury__moto", date: null, caption: "", image: "" },
    { url: "https://www.instagram.com/reel/DfR5GvAx_fx/", account: "@fury__moto", date: null, caption: "", image: "" },
    { url: "https://www.instagram.com/reel/DfPbQZmRLe9/", account: "@fury__moto", date: null, caption: "", image: "" },
    { url: "https://www.instagram.com/p/DfHVRRaEQuC/",    account: "@fury__moto", date: null, caption: "", image: "" },
    { url: "https://www.instagram.com/reel/Dey98XiIHPE/", account: "@fury__moto", date: null, caption: "", image: "" },
    // landscape reel: Instagram's embed draws it awkwardly, so it sits last (it only shows when there's room)
    { url: "https://www.instagram.com/reel/Dfzk7X9x-ll/", account: "@fury__moto", date: null, caption: "", image: "" },
    { url: "https://www.instagram.com/reel/DfhP8xDth6A/", account: "@fury_the_gear_doc", date: "2026-11-09", caption: "DOT vs FIM: which helmet is actually safer?", image: "" },
    { url: "https://www.instagram.com/reel/DfXGz1ANrQI/", account: "@fury_the_gear_doc", date: "2026-11-05", caption: "Cowhide vs kangaroo leather for racing suits", image: "" },
    { url: "https://www.instagram.com/reel/Deo2hpMNL9h/", account: "@fury_the_gear_doc", date: "2026-10-18", caption: "Seam strength is really important", image: "" },
    { url: "https://www.instagram.com/reel/Dejg9DNth0X/", account: "@fury_the_gear_doc", date: "2026-10-16", caption: "CE Level 2 armour: does it stay in place?", image: "" },
    { url: "https://www.instagram.com/reel/Deg4RHotNXf/", account: "@fury_the_gear_doc", date: "2026-10-15", caption: "Riding jacket for 1 lakh: is it actually safer?", image: "" },
    { url: "https://www.instagram.com/reel/DebWdnaNZ-S/", account: "@fury_the_gear_doc", date: "2026-10-13", caption: "Hard knuckles, but are your gloves protective?", image: "" },
    { url: "https://www.instagram.com/reel/DeY06pItxph/", account: "@fury_the_gear_doc", date: "2026-10-12", caption: "CE Level 2 armour, but is your jacket certified too?", image: "" },
  ],

  testimonials: [
    { name: "[PLACEHOLDER: real customer] Ahmed R.", bike: "Suzuki GSX-R150", quote: "The WhatsApp sizing advice was spot on. The helmet felt right from the first ride, and the size chart matched what I actually wear.", rating: 5 },
    { name: "[PLACEHOLDER: real customer] Hamza S.", bike: "Honda CBR150R", quote: "Asked about sizing for a race suit before ordering. Straight answer, no pushing of extras, and the suit arrived in good time.", rating: 5 },
    { name: "[PLACEHOLDER: real customer] Usman K.", bike: "Yamaha R15 V4", quote: "The gloves were stiffer than I expected, but a week in they are comfortable. The knuckle protection guide helped me pick the right pair.", rating: 4 },
    { name: "[PLACEHOLDER: real customer] Bilal M.", bike: "Kawasaki Ninja 400", quote: "Bought a chest protector for track days. Good fit and cash on delivery was easy. Would buy again.", rating: 4 },
  ],
  faqs: [
    { q: "How long does delivery take?", a: "We deliver nationwide. Timing depends on your city and courier, and we confirm the estimate with you on WhatsApp before you pay. [PLACEHOLDER: confirm delivery timelines and couriers]" },
    { q: "Is cash on delivery available?", a: "Yes, cash on delivery is available in most cities. Message us on WhatsApp with your city and we will confirm before you order. [PLACEHOLDER: confirm COD coverage and any charge]" },
    { q: "What if the size is wrong?", a: "Sizing help is free before you order, so message us first. Exchanges are accepted for unused items in original packaging within [PLACEHOLDER: exchange window]. Helmets and suits must be unworn and unmarked." },
    { q: "Are the products genuine?", a: "We sell only products from brands we can name and verify. [PLACEHOLDER: confirm supplier and official importer details before launch]" },
    { q: "What do DOT and ECE 22.06 mean on a helmet?", a: "Both are safety standards printed on the sticker and inner label. ECE 22.06 is the European standard and is tested by independent labs. DOT is the US standard, which relies on the manufacturer's own certification. Read the DOT vs FIM guide for the full comparison." },
    { q: "How do I order on WhatsApp?", a: "Send us the product, your size and colour, and your city. We will confirm stock, the total with delivery and the payment options before you pay anything." },
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
