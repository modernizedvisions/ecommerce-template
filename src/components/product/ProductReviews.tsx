import React from 'react';

type Review = {
  name: string;
  date: string;
  stars: number;
  item: string;
  text: string;
};

const averageRating = 5;
const reviewCount = 18;

const STATIC_REVIEWS: Review[] = [
  {
    name: 'Jill',
    date: 'Dec 8, 2025',
    stars: 5,
    item: 'Decoupage Oyster Shell Ornament Set of 3',
    text: 'These ornaments are so beautiful and a wonderful gift! She helped me pick exactly what I needed and wanted and they are perfect!! Highly recommend.',
  },
  {
    name: 'Amanda',
    date: 'Dec 2, 2025',
    stars: 5,
    item: 'Handcrafted Decoupage Scallop Shell Jewelry Dish CUSTOM ORDER set of 3 with gold trim',
    text: 'This item is absolutely beautiful and was a perfect baby shower gift for the mom and grandmother to be!',
  },
  {
    name: 'Lauren',
    date: 'Nov 4, 2025',
    stars: 5,
    item: 'Decoupage Oyster Shell Ornament',
    text: 'My custom order was shipped in a timely manner, my custom ornament came out exactly as I pictured and communication with the seller was always easy and responsive.',
  },
  {
    name: 'Kris',
    date: 'Oct 30, 2025',
    stars: 5,
    item: 'Decoupage Oyster Shell Ornament',
    text: 'Morgan did a beautiful job on these custom ornaments I requested for a gift – shark week lover! Can\'t wait to give it to him. Thank you for such a unique and fun gift!',
  },
  {
    name: 'Stephanie',
    date: 'Oct 23, 2025',
    stars: 5,
    item: 'CUSTOM ORDER Snowman and Grinch Ornaments (set of 7)',
    text: 'These are PERFECT!! Morgan is a precious person and puts love into every order🩷',
  },
  {
    name: 'Elle',
    date: 'Oct 17, 2025',
    stars: 5,
    item: 'Decoupage Oyster Shell Ornaments – CUSTOM ORDER set of 4',
    text: 'They look even better in person! So impressed from her communication, custom design to the packaging – exceeded expectations!',
  },
  {
    name: 'Sabrina',
    date: 'Sep 20, 2025',
    stars: 5,
    item: 'Decoupage Oyster Shell Ornament/Wine Stopper – CUSTOM SET OF 6',
    text: 'This is my second order and definitely not my last time ordering 😍',
  },
  {
    name: 'Emily',
    date: 'Sep 7, 2025',
    stars: 5,
    item: 'Decoupage Oyster Shell Ornament/Wine Stopper/Scallop Shell SET OF 3',
    text: 'I bought this set as a gift for my friend. The seller was able to ship directly to my friend and it arrived in 2 days. The price was very affordable for the quality of craftsmanship in each shell. Highly recommend!',
  },
  {
    name: 'Gina',
    date: 'Aug 7, 2025',
    stars: 5,
    item: 'Handcrafted Decoupage Oyster Shell – Coastal Chic Elegance',
    text: 'All three shells were gorgeous and arrived within 24 hours as well as safely packed for shipping.',
  },
  {
    name: 'Lauren',
    date: 'Mar 18, 2025',
    stars: 5,
    item: 'Handcrafted Decoupage Scallop Shell Jewelry Dish – Coastal Chic Elegance',
    text: 'My order came within days, well packaged and super cute. I had a few questions for the shop owner and she responded quickly answering all of my questions. Makes for a cute jewelry holder for yourself or a friend!',
  },
];

export function ProductReviews() {
  return (
    <section className="border-t border-slate-200 pt-10 mt-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg md:text-xl font-semibold tracking-[0.12em] uppercase text-slate-900">
            Customer Reviews
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Average rating {averageRating} out of 5 stars ({reviewCount} reviews)
          </p>
        </div>
        <div className="text-right space-y-1">
          <div className="text-amber-500 text-lg leading-none">★★★★★</div>
          <p className="text-xs text-slate-500">5.0 • Etsy reviews for Morgan</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        {STATIC_REVIEWS.map((review) => (
          <article key={`${review.name}-${review.date}-${review.item}`} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{review.name}</p>
                <p className="text-xs text-slate-500">{review.date}</p>
              </div>
              <span className="text-amber-500 text-sm">{'★'.repeat(review.stars)}</span>
            </div>
            <p className="mt-3 text-xs uppercase tracking-wide text-slate-500">{review.item}</p>
            <p className="mt-2 text-sm text-slate-800 leading-relaxed">“{review.text}”</p>
          </article>
        ))}
      </div>
    </section>
  );
}
