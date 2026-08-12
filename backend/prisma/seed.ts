/**
 * prisma/seed.ts
 *
 * Seeds a starter restaurant catalog so the app is usable immediately —
 * no Google Places key required. Restaurants span every cuisine cluster and
 * all four price tiers so the recommender has signal to work with from swipe one.
 *
 * Idempotent: upserts on `yelpId` (the stable catalog key), so re-running never
 * duplicates rows. Run with `npm run db:seed` (prisma db seed) after migrations.
 *
 * Photos use a stable, key-free image source. The /places/photo proxy redirects
 * http(s) names straight through, so these render without GOOGLE_API_KEY set.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Seed = {
  slug: string;
  name: string;
  cuisine: string;
  priceLevel: string;
  address: string;
  openingHours: string;
};

const img = (slug: string) => `https://picsum.photos/seed/swipebite-${slug}/640/480`;

const RESTAURANTS: Seed[] = [
  { slug: "amalfi", name: "Trattoria Amalfi", cuisine: "Italian", priceLevel: "$$$", address: "1011 Gayley Ave, Los Angeles, CA", openingHours: "11:00 AM – 10:00 PM" },
  { slug: "napoli", name: "Napoli Pizza Co.", cuisine: "pizza", priceLevel: "$$", address: "1076 Broxton Ave, Los Angeles, CA", openingHours: "11:00 AM – 1:00 AM" },
  { slug: "sakura", name: "Sakura Sushi House", cuisine: "Japanese", priceLevel: "$$$", address: "2031 Sawtelle Blvd, Los Angeles, CA", openingHours: "5:00 PM – 11:00 PM" },
  { slug: "tsujita", name: "Ramen Tsujita", cuisine: "ramen", priceLevel: "$$", address: "2057 Sawtelle Blvd, Los Angeles, CA", openingHours: "11:00 AM – 2:00 AM" },
  { slug: "seoul", name: "Seoul Garden BBQ", cuisine: "Korean", priceLevel: "$$$", address: "3465 W 6th St, Los Angeles, CA", openingHours: "11:00 AM – 12:00 AM" },
  { slug: "pho-saigon", name: "Pho Saigon Noodle", cuisine: "Vietnamese", priceLevel: "$", address: "1417 Westwood Blvd, Los Angeles, CA", openingHours: "10:00 AM – 9:00 PM" },
  { slug: "bangkok", name: "Bangkok Street Thai", cuisine: "Thai", priceLevel: "$$", address: "1253 Westwood Blvd, Los Angeles, CA", openingHours: "11:00 AM – 10:00 PM" },
  { slug: "el-toro", name: "El Toro Taqueria", cuisine: "Mexican", priceLevel: "$", address: "1842 W Sunset Blvd, Los Angeles, CA", openingHours: "9:00 AM – 11:00 PM" },
  { slug: "casa-azul", name: "Casa Azul Cocina", cuisine: "Mexican", priceLevel: "$$$", address: "11700 Wilshire Blvd, Los Angeles, CA", openingHours: "5:00 PM – 11:00 PM" },
  { slug: "maharaja", name: "Maharaja Indian Kitchen", cuisine: "Indian", priceLevel: "$$", address: "1521 Westwood Blvd, Los Angeles, CA", openingHours: "11:30 AM – 10:00 PM" },
  { slug: "olympia", name: "Olympia Greek Taverna", cuisine: "Greek", priceLevel: "$$", address: "10866 Lindbrook Dr, Los Angeles, CA", openingHours: "11:00 AM – 10:00 PM" },
  { slug: "byblos", name: "Byblos Mediterranean", cuisine: "Mediterranean", priceLevel: "$$", address: "1442 3rd St Promenade, Santa Monica, CA", openingHours: "11:00 AM – 11:00 PM" },
  { slug: "the-grill", name: "The Westwood Grill", cuisine: "American", priceLevel: "$$$", address: "10940 Weyburn Ave, Los Angeles, CA", openingHours: "11:00 AM – 11:00 PM" },
  { slug: "smokehouse", name: "Ember & Ash Smokehouse", cuisine: "bbq", priceLevel: "$$$", address: "8730 W 3rd St, Los Angeles, CA", openingHours: "12:00 PM – 10:00 PM" },
  { slug: "patty-stack", name: "Patty Stack Burgers", cuisine: "burger", priceLevel: "$", address: "927 Broxton Ave, Los Angeles, CA", openingHours: "11:00 AM – 2:00 AM" },
  { slug: "prime-cut", name: "Prime Cut Steakhouse", cuisine: "steakhouse", priceLevel: "$$$", address: "9500 Wilshire Blvd, Beverly Hills, CA", openingHours: "5:00 PM – 11:00 PM" },
  { slug: "le-petit", name: "Le Petit Bistro", cuisine: "French", priceLevel: "$$$", address: "421 N Beverly Dr, Beverly Hills, CA", openingHours: "5:30 PM – 10:30 PM" },
  { slug: "barca", name: "Barça Tapas Bar", cuisine: "Spanish", priceLevel: "$$$", address: "8265 Sunset Blvd, Los Angeles, CA", openingHours: "5:00 PM – 12:00 AM" },
  { slug: "blue-marlin", name: "Blue Marlin Seafood", cuisine: "Seafood", priceLevel: "$$$", address: "171 Pier Ave, Santa Monica, CA", openingHours: "11:30 AM – 10:00 PM" },
  { slug: "morning-fox", name: "The Morning Fox Café", cuisine: "Cafe", priceLevel: "$$", address: "1099 Westwood Blvd, Los Angeles, CA", openingHours: "7:00 AM – 4:00 PM" },
  { slug: "dawn-bakery", name: "Dawn Patrol Bakery", cuisine: "bakery", priceLevel: "$", address: "236 Main St, Venice, CA", openingHours: "6:00 AM – 3:00 PM" },
  { slug: "scoops", name: "Scoops Artisan Gelato", cuisine: "dessert", priceLevel: "$", address: "712 Broadway, Santa Monica, CA", openingHours: "12:00 PM – 11:00 PM" },
  { slug: "green-bowl", name: "Green Bowl Plant Kitchen", cuisine: "vegan", priceLevel: "$$", address: "1357 Westwood Blvd, Los Angeles, CA", openingHours: "11:00 AM – 9:00 PM" },
  { slug: "midnight-deli", name: "Midnight Deli & Subs", cuisine: "sandwich", priceLevel: "$", address: "10916 Kinross Ave, Los Angeles, CA", openingHours: "10:00 AM – 24 hours" },
];

async function main() {
  console.log(`Seeding ${RESTAURANTS.length} restaurants…`);

  for (const r of RESTAURANTS) {
    const data = {
      name: r.name,
      cuisine: r.cuisine,
      priceLevel: r.priceLevel,
      address: r.address,
      openingHours: r.openingHours,
      photoNames: [img(r.slug)],
    };

    await prisma.restaurant.upsert({
      where: { yelpId: `seed-${r.slug}` },
      update: data,
      create: { yelpId: `seed-${r.slug}`, ...data },
    });
  }

  const total = await prisma.restaurant.count();
  console.log(`Done. Catalog now has ${total} restaurants.`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
