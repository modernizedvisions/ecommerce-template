import type { Review } from '../types';
import { mockReviews } from './mockData';

// TODO: Persist reviews in Cloudflare D1 with moderation hooks.

export async function getReviewsForProduct(productId: string): Promise<Review[]> {
  return mockReviews.filter((review) => review.productId === productId);
}
