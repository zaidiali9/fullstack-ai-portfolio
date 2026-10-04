/**
 * SEED DATA — fictional organizations, people and tickets written for this demo.
 * No real customers or personal data. Emails use the reserved-looking ".demo" TLD.
 */

export interface SeedUser {
  key: string;
  name: string;
  email: string;
}

export const USERS: SeedUser[] = [
  { key: "ava", name: "Ava Thompson", email: "admin@tidaldesk.demo" },
  { key: "sam", name: "Sam Okafor", email: "agent@tidaldesk.demo" },
  { key: "mei", name: "Mei Lin", email: "mei.agent@tidaldesk.demo" },
  { key: "riley", name: "Riley Brooks", email: "customer@tidaldesk.demo" },
  { key: "noah", name: "Noah Fischer", email: "noah@customer.demo" },
  { key: "priya", name: "Priya Raman", email: "priya@customer.demo" },
  { key: "lucas", name: "Lucas Moreau", email: "lucas@customer.demo" },
  { key: "zoe", name: "Zoe Adeyemi", email: "zoe@customer.demo" },
  { key: "omar", name: "Omar Haddad", email: "omar@customer.demo" },
];

export const ORGS = [
  {
    key: "harbor",
    name: "Harbor Lane Goods",
    slug: "harbor-lane",
    members: { ava: "admin", sam: "agent", mei: "agent", riley: "customer", noah: "customer", priya: "customer", lucas: "customer", zoe: "customer", omar: "customer" },
  },
  {
    key: "copper",
    name: "Copperline Analytics",
    slug: "copperline",
    members: { ava: "admin", mei: "agent", noah: "customer" },
  },
] as const;

export const ARTICLES: { org: string; title: string; body: string }[] = [
  {
    org: "harbor",
    title: "Refund and return policy",
    body: `## Returns\nYou can return most items within **30 days** of delivery for a full refund to the original payment method.\n\n- Items must be unused and in original packaging.\n- Return shipping is free for orders over $50; otherwise a $6 label fee is deducted.\n- Refunds are issued within 5 business days after we receive the return.\n\n## Duplicate or incorrect charges\nIf you were charged twice, reply with the order number. Duplicate charges are refunded in full within 3 business days; the bank may take a few more days to show it.`,
  },
  {
    org: "harbor",
    title: "Shipping times and tracking",
    body: `Standard shipping takes **3–5 business days** in the continental US; express takes 1–2 business days.\n\nYou receive a tracking link by email when the order ships. If tracking hasn't updated for 4 business days, contact us and we'll open a carrier investigation.\n\nInternational orders take 7–14 business days and may incur customs fees paid by the recipient.`,
  },
  {
    org: "harbor",
    title: "How to reset your password",
    body: `1. Go to the sign-in page and choose **Forgot password**.\n2. Enter the email on your account. The reset link arrives within a few minutes and is valid for 1 hour.\n3. Check your spam folder if it doesn't arrive.\n\nIf you no longer have access to that email address, contact support and we'll verify your identity with your last order number.`,
  },
  {
    org: "harbor",
    title: "Two-factor authentication (2FA)",
    body: `You can enable 2FA in **Account → Security**. We support authenticator apps.\n\nSave your 10 backup codes when you enable it. If you lose your device and your backup codes, support can disable 2FA after verifying your identity; this takes up to 1 business day for security reasons.`,
  },
  {
    org: "harbor",
    title: "Changing the email address on your account",
    body: `Open **Account → Profile**, enter the new address and confirm it from the verification email. Order history stays attached to your account.\n\nFor security, we can't change the email over chat or phone without verification.`,
  },
  {
    org: "harbor",
    title: "Invoices and VAT numbers",
    body: `Invoices are available under **Orders → Invoice** as PDFs.\n\nBusiness customers can add a VAT number in **Account → Billing details** before ordering. To correct the VAT number on an existing invoice, contact support within 30 days of the order and we'll reissue it.`,
  },
  {
    org: "harbor",
    title: "Cancelling or changing an order",
    body: `Orders can be changed or cancelled within **1 hour** of placing them from **Orders → Manage**. After that the warehouse may have picked the order; contact support and we'll try to stop it, otherwise you can return it once delivered.`,
  },
  {
    org: "harbor",
    title: "Damaged or missing items",
    body: `If an item arrives damaged, send a photo of the item and packaging within 7 days. We'll ship a replacement at no cost or refund it, your choice.\n\nIf a package shows as delivered but you can't find it, check with neighbours and wait 24 hours, then contact us so we can file a claim with the carrier.`,
  },
  {
    org: "copper",
    title: "API rate limits",
    body: `The Copperline API allows **600 requests per minute** per API key. Responses include \`X-RateLimit-Remaining\`.\n\nWhen the limit is exceeded the API returns HTTP 429 with a \`Retry-After\` header. Use exponential backoff.`,
  },
  {
    org: "copper",
    title: "Exporting dashboards to CSV",
    body: `Open a dashboard, choose **Export → CSV**. Exports include the currently applied filters and are limited to 100,000 rows.`,
  },
];

export interface SeedTicket {
  org: string;
  requester: string;
  subject: string;
  messages: { from: string; body: string; internal?: boolean }[];
  status: "open" | "pending" | "resolved" | "closed";
  /** Category/priority as set by seed "agents" (not AI). Omitted on the newest tickets. */
  manual?: { category: "billing" | "technical" | "account" | "other"; priority: "low" | "medium" | "high" | "urgent" };
  assignee?: string;
  daysAgo: number;
}

export const TICKETS: SeedTicket[] = [
  {
    org: "harbor",
    requester: "riley",
    subject: "Charged twice for order #48213",
    status: "open",
    daysAgo: 0.2,
    messages: [{ from: "riley", body: "Hi, my card statement shows two charges of $84.90 for order #48213 placed on Monday. I only ordered once. Can you refund the duplicate? This is pretty frustrating." }],
  },
  {
    org: "harbor",
    requester: "noah",
    subject: "Tracking hasn't updated in a week",
    status: "open",
    daysAgo: 0.5,
    messages: [{ from: "noah", body: "My order #48177 shipped last Tuesday and the tracking page has said 'label created' ever since. Is it lost?" }],
  },
  {
    org: "harbor",
    requester: "priya",
    subject: "Can't sign in after changing phones",
    status: "open",
    daysAgo: 0.8,
    messages: [{ from: "priya", body: "I got a new phone and my authenticator app codes are gone. I can't sign in to check my orders. I don't think I saved backup codes. What can I do?" }],
  },
  {
    org: "harbor",
    requester: "lucas",
    subject: "Jacket arrived with a torn zipper",
    status: "open",
    daysAgo: 1.1,
    messages: [{ from: "lucas", body: "The rain jacket from order #48102 arrived today and the main zipper is torn at the bottom. I'd like a replacement in the same size (M) if possible. I have photos." }],
  },
  {
    org: "harbor",
    requester: "zoe",
    subject: "Do you ship to Canada?",
    status: "open",
    daysAgo: 1.4,
    messages: [{ from: "zoe", body: "Hello! Thinking of ordering the hiking boots. Do you ship to Toronto and roughly how long would it take? Thanks so much." }],
  },
  {
    org: "harbor",
    requester: "omar",
    subject: "Wrong VAT number on invoice",
    status: "open",
    daysAgo: 1.9,
    messages: [{ from: "omar", body: "Our company invoice for order #47990 shows an old VAT number. Our accounting team needs a corrected invoice with VAT DE298765432 before month end." }],
  },
  {
    org: "harbor",
    requester: "riley",
    subject: "Change delivery address on order #48201",
    status: "pending",
    daysAgo: 2.3,
    assignee: "sam",
    manual: { category: "other", priority: "high" },
    messages: [
      { from: "riley", body: "I placed order #48201 about 3 hours ago and realised it's going to my old apartment. Can you change it to my new address?" },
      { from: "sam", body: "Hi Riley — the warehouse had already picked the order, so I've asked them to hold it. Could you confirm the full new address including the unit number?" },
      { from: "sam", body: "Warehouse confirmed hold until Friday. Update the label once Riley replies.", internal: true },
    ],
  },
  {
    org: "harbor",
    requester: "noah",
    subject: "Refund still not showing",
    status: "pending",
    daysAgo: 3,
    assignee: "mei",
    manual: { category: "billing", priority: "medium" },
    messages: [
      { from: "noah", body: "I returned the tent 10 days ago and haven't seen the refund yet. Return tracking shows it was delivered to you on the 3rd." },
      { from: "mei", body: "Thanks Noah. I can see the return was received and the refund of $219.00 was issued yesterday. Banks usually take 3–5 business days to show it. Let me know if it hasn't appeared by next Wednesday." },
    ],
  },
  {
    org: "harbor",
    requester: "priya",
    subject: "Discount code not applying at checkout",
    status: "resolved",
    daysAgo: 4,
    assignee: "sam",
    manual: { category: "technical", priority: "medium" },
    messages: [
      { from: "priya", body: "The code SPRING15 from your newsletter says 'invalid' at checkout." },
      { from: "sam", body: "Sorry about that, Priya. That code only applies to full-price items and two items in your cart were on sale. I've applied a 15% courtesy discount to your order manually." },
      { from: "priya", body: "Perfect, thank you!" },
    ],
  },
  {
    org: "harbor",
    requester: "lucas",
    subject: "How do I change my account email?",
    status: "resolved",
    daysAgo: 6,
    assignee: "mei",
    manual: { category: "account", priority: "low" },
    messages: [
      { from: "lucas", body: "I'm moving from my old work email. How do I update the address on my account?" },
      { from: "mei", body: "Hi Lucas, open Account → Profile, enter the new address and confirm it from the verification email. Your order history will stay attached." },
    ],
  },
  {
    org: "harbor",
    requester: "zoe",
    subject: "Package marked delivered but not received",
    status: "closed",
    daysAgo: 9,
    assignee: "sam",
    manual: { category: "other", priority: "high" },
    messages: [
      { from: "zoe", body: "Tracking says my package was delivered yesterday at 2pm but there's nothing at my door or with neighbours." },
      { from: "sam", body: "I'm sorry, Zoe. I've filed a claim with the carrier and shipped a replacement by express at no cost. You'll get tracking within a day." },
      { from: "zoe", body: "Replacement arrived, thanks for the fast help." },
    ],
  },
  {
    org: "harbor",
    requester: "omar",
    subject: "Bulk order for our team",
    status: "closed",
    daysAgo: 13,
    assignee: "mei",
    manual: { category: "other", priority: "low" },
    messages: [
      { from: "omar", body: "We'd like 25 fleece jackets with our logo for a company retreat. Do you offer bulk pricing?" },
      { from: "mei", body: "Thanks Omar! We don't offer custom printing, but orders of 20+ items get 10% off automatically at checkout." },
    ],
  },
  {
    org: "harbor",
    requester: "riley",
    subject: "Size exchange for boots",
    status: "resolved",
    daysAgo: 16,
    assignee: "sam",
    manual: { category: "other", priority: "low" },
    messages: [
      { from: "riley", body: "The boots are a bit small. Can I exchange them for a size 9?" },
      { from: "sam", body: "Absolutely. I've emailed you a free return label and reserved a size 9 pair that ships as soon as the return is scanned." },
    ],
  },
  {
    org: "copper",
    requester: "noah",
    subject: "API returning 429 during nightly sync",
    status: "open",
    daysAgo: 0.6,
    messages: [{ from: "noah", body: "Our nightly sync job started failing with HTTP 429 errors around 2am. We send about 900 requests per minute in bursts. Production reports are missing this morning." }],
  },
  {
    org: "copper",
    requester: "noah",
    subject: "CSV export cuts off rows",
    status: "pending",
    daysAgo: 5,
    assignee: "mei",
    manual: { category: "technical", priority: "medium" },
    messages: [
      { from: "noah", body: "Exporting the Q3 dashboard only gives us 100,000 rows but the table has more." },
      { from: "mei", body: "Hi Noah, CSV exports are limited to 100,000 rows. Applying a date filter and exporting in two parts works around it. Would that work for you?" },
    ],
  },
];
