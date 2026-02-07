import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchCategories, fetchProducts } from '../lib/api';
import { Category, Product } from '../lib/types';
import { buildCategoryOptionLookup, normalizeCategoryKey } from '../lib/categoryOptions';
import { ProductGrid } from '../components/ProductGrid';

const OTHER_ITEMS_CATEGORY: Category = {
  id: 'other-items',
  name: 'Other Items',
  slug: 'other-items',
  showOnHomePage: true,
};

const toSlug = (value: string) => normalizeCategoryKey(value);

const ensureCategoryDefaults = (category: Category): Category => ({
  ...category,
  name: category.name || category.slug,
  slug: category.slug || toSlug(category.name || ''),
  showOnHomePage: category.showOnHomePage ?? true,
});

const mergeCategories = (apiCategories: Category[], derivedCategories: Category[]): Category[] => {
  const merged = new Map<string, Category>();
  const upsert = (category: Category, preferOverride = false) => {
    const normalizedKey = toSlug(category.slug || category.name || '');
    if (!normalizedKey) return;
    const next = ensureCategoryDefaults(category);
    if (preferOverride || !merged.has(normalizedKey)) {
      merged.set(normalizedKey, next);
    }
  };

  derivedCategories.forEach((category) => upsert(category, false));
  apiCategories.forEach((category) => upsert(category, true));

  return Array.from(merged.values());
};

const dedupeCategories = (categories: Category[]): Category[] => {
  const seen = new Set<string>();
  const result: Category[] = [];
  categories.forEach((category) => {
    const key = toSlug(category.slug || category.name || '');
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(ensureCategoryDefaults(category));
  });
  return result;
};

const deriveCategoriesFromProducts = (items: Product[]): Category[] => {
  const names = new Map<string, string>();
  const addName = (name?: string | null) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    const slug = toSlug(trimmed);
    if (!names.has(slug)) names.set(slug, trimmed);
  };

  items.forEach((product) => {
    addName(product.type);
    addName((product as any).category);
    if (Array.isArray(product.categories)) {
      product.categories.forEach((c) => addName(c));
    }
    if (Array.isArray((product as any).categories)) {
      (product as any).categories.forEach((c: unknown) => {
        if (typeof c === 'string') addName(c);
      });
    }
  });

  const derived = Array.from(names.entries()).map(
    ([slug, name]): Category => ({ id: slug, slug, name, showOnHomePage: true })
  );
  return derived;
};

const getProductCategoryNames = (product: Product): string[] => {
  const names = new Set<string>();
  const addName = (name?: string | null) => {
    const trimmed = (name || '').trim();
    if (trimmed) names.add(trimmed);
  };

  addName(product.type);
  addName((product as any).category);
  if (Array.isArray(product.categories)) {
    product.categories.forEach((c) => addName(c));
  }
  if (Array.isArray((product as any).categories)) {
    (product as any).categories.forEach((c: unknown) => {
      if (typeof c === 'string') addName(c);
    });
  }

  return Array.from(names);
};

const buildCategoryLookups = (categoryList: Category[]) => {
  const slugLookup = new Map<string, string>();
  const nameLookup = new Map<string, string>();
  categoryList.forEach((cat) => {
    const normalizedSlug = toSlug(cat.slug);
    const normalizedName = toSlug(cat.name);
    if (normalizedSlug) slugLookup.set(normalizedSlug, cat.slug);
    if (normalizedName) nameLookup.set(normalizedName, cat.slug);
  });
  return { slugLookup, nameLookup };
};

const ensureOtherItemsCategory = (categories: Category[], products: Product[]): Category[] => {
  const normalizedOtherItems = toSlug(OTHER_ITEMS_CATEGORY.slug);
  const hasOtherItems = categories.some(
    (cat) => toSlug(cat.slug) === normalizedOtherItems || toSlug(cat.name) === normalizedOtherItems
  );
  const lookups = buildCategoryLookups(categories);
  const needsFallback = products.some((product) => {
    const resolution = resolveCategorySlugForProduct(product, categories, lookups);
    return !resolution.slug;
  });

  if (hasOtherItems || !needsFallback) return categories;

  return [...categories, OTHER_ITEMS_CATEGORY];
};

const resolveCategorySlugForProduct = (
  product: Product,
  categoryList: Category[],
  lookups: { slugLookup: Map<string, string>; nameLookup: Map<string, string> },
  fallbackSlug?: string
): {
  slug: string | null;
  matchedBy: 'slug' | 'name' | 'fallback' | 'none';
  candidateNames: string[];
  normalizedCandidates: string[];
} => {
  const candidateNames = getProductCategoryNames(product);
  const normalizedCandidates = candidateNames.map((name) => toSlug(name)).filter(Boolean);
  const candidateSet = new Set(normalizedCandidates);

  for (const category of categoryList) {
    const normalizedSlug = toSlug(category.slug);
    const normalizedName = toSlug(category.name);
    if (normalizedSlug && candidateSet.has(normalizedSlug)) {
      return { slug: category.slug, matchedBy: 'slug', candidateNames, normalizedCandidates };
    }
    if (normalizedName && candidateSet.has(normalizedName)) {
      return { slug: category.slug, matchedBy: 'name', candidateNames, normalizedCandidates };
    }
  }

  for (const normalized of normalizedCandidates) {
    if (lookups.slugLookup.has(normalized)) {
      return {
        slug: lookups.slugLookup.get(normalized)!,
        matchedBy: 'slug',
        candidateNames,
        normalizedCandidates,
      };
    }
    if (lookups.nameLookup.has(normalized)) {
      return {
        slug: lookups.nameLookup.get(normalized)!,
        matchedBy: 'name',
        candidateNames,
        normalizedCandidates,
      };
    }
  }

  if (fallbackSlug) return { slug: fallbackSlug, matchedBy: 'fallback', candidateNames, normalizedCandidates };

  return { slug: null, matchedBy: 'none', candidateNames, normalizedCandidates };
};

const CATEGORY_COPY: Record<string, { title: string; description: string }> = {
  ornaments: {
    title: 'ORNAMENTS',
    description: 'Hand-crafted coastal keepsakes for every season.',
  },
  'ring-dish': {
    title: 'RING DISHES',
    description: 'Functional coastal art designed for your jewelry & keepsakes.',
  },
  'ring dishes': {
    title: 'RING DISHES',
    description: 'Functional coastal art designed for your jewelry & keepsakes.',
  },
  decor: {
    title: 'DECOR',
    description: 'Coastal artistry to brighten your space with shoreline charm.',
  },
  'wine-stopper': {
    title: 'WINE STOPPERS',
    description: 'Hand-crafted shell stoppers for your favorite bottles.',
  },
  'wine stoppers': {
    title: 'WINE STOPPERS',
    description: 'Hand-crafted shell stoppers for your favorite bottles.',
  },
  'other-items': {
    title: 'OTHER ITEMS',
    description: '',
  },
  'other items': {
    title: 'OTHER ITEMS',
    description: '',
  },
};

export function ShopPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategorySlug, setActiveCategorySlug] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const isDev = import.meta.env?.DEV;

  const categoryList = useMemo(() => {
    const baseList = categories.length ? categories : deriveCategoriesFromProducts(products);
    const deduped = dedupeCategories(baseList);
    const withFallback = ensureOtherItemsCategory(deduped, products);
    return dedupeCategories(withFallback);
  }, [categories, products]);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const allProducts = await fetchProducts({ visible: true });
      const availableProducts = (allProducts || []).filter((p) => !p.isSold);
      if (isDev) {
        console.log(
          '[ShopPage] product sample (first 3)',
          availableProducts.slice(0, 3).map((p) => ({
            id: p.id,
            name: p.name,
            type: p.type,
            category: (p as any).category ?? null,
            categories: Array.isArray((p as any).categories) ? (p as any).categories : null,
          }))
        );
      }
      setProducts(availableProducts);

      let apiCategories: Category[] = [];
      try {
        apiCategories = await fetchCategories();
      } catch (categoryError) {
        console.error('Error loading categories:', categoryError);
      }

      const orderedCategories = dedupeCategories(apiCategories);
      if (isDev) {
        console.log(
          '[ShopPage] merged category list',
          orderedCategories.map((c) => ({ slug: c.slug, name: c.name }))
        );
      }
      setCategories(orderedCategories);
    } catch (error) {
      console.error('Error loading products:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const groupedProducts = useMemo(() => {
    const groups: Record<string, Product[]> = {};
    if (!categoryList.length) return groups;

    categoryList.forEach((c) => {
      groups[c.slug] = [];
    });

    const fallbackSlug = OTHER_ITEMS_CATEGORY.slug;
    const lookups = buildCategoryLookups(categoryList);

    products.forEach((product) => {
      const resolution = resolveCategorySlugForProduct(product, categoryList, lookups, fallbackSlug);
      const key = resolution.slug || fallbackSlug;
      if (isDev && (resolution.matchedBy === 'fallback' || !resolution.slug)) {
        console.log('[ShopPage][category-fallback]', {
          productId: product.id,
          productName: product.name,
          candidateNames: resolution.candidateNames,
          normalizedCandidates: resolution.normalizedCandidates,
          fallbackSlug,
          resolvedSlug: resolution.slug,
          matchedBy: resolution.matchedBy,
        });
      }
      if (!key) return;
      if (!groups[key]) groups[key] = [];
      groups[key].push(product);
    });

    return groups;
  }, [categoryList, products]);

  const optionLookup = useMemo(() => buildCategoryOptionLookup(categoryList), [categoryList]);

  const visibleCategories = useMemo(
    () => categoryList.filter((category) => (groupedProducts[category.slug] || []).length > 0),
    [categoryList, groupedProducts]
  );

  const sectionCategories = useMemo(() => {
    if (!activeCategorySlug) return visibleCategories;
    const selected = visibleCategories.find((category) => category.slug === activeCategorySlug);
    if (!selected) return visibleCategories;
    return [selected, ...visibleCategories.filter((category) => category.slug !== activeCategorySlug)];
  }, [activeCategorySlug, visibleCategories]);

  useEffect(() => {
    if (!visibleCategories.length) return;
    const typeParam = searchParams.get('type');
    const normalized = typeParam ? toSlug(typeParam) : '';
    if (!normalized || normalized === 'all') {
      if (activeCategorySlug) setActiveCategorySlug('');
      return;
    }
    const match = visibleCategories.find(
      (c) => toSlug(c.slug) === normalized || toSlug(c.name) === normalized
    );

    if (match) {
      if (activeCategorySlug !== match.slug) setActiveCategorySlug(match.slug);
      return;
    }

    if (activeCategorySlug) setActiveCategorySlug('');
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('type');
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, visibleCategories, activeCategorySlug, setSearchParams]);

  useEffect(() => {
    if (!activeCategorySlug) return;
    const id = `category-section-${activeCategorySlug}`;
    const raf = requestAnimationFrame(() => {
      const target = document.getElementById(id);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => cancelAnimationFrame(raf);
  }, [activeCategorySlug]);

  useEffect(() => {
    if (!categoryList.length) return;
    if (isDev) {
      console.log(
        '[ShopPage] categoryList effect',
        categoryList.map((c) => ({ slug: c.slug, name: c.name }))
      );
    }
  }, [categoryList]);

  const handleCategorySelect = (slug?: string) => {
    const nextParams = new URLSearchParams(searchParams);
    if (!slug) {
      if (activeCategorySlug) setActiveCategorySlug('');
      nextParams.delete('type');
      setSearchParams(nextParams, { replace: true });
      return;
    }
    if (activeCategorySlug !== slug) setActiveCategorySlug(slug);
    nextParams.set('type', slug);
    setSearchParams(nextParams, { replace: true });
  };

  return (
    <div className="py-14 bg-linen min-h-screen">
      <div className="w-full max-w-[92vw] sm:max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mt-10 mb-8 space-y-3">
          <p className="text-[11px] uppercase tracking-[0.32em] text-deep-ocean/80">The Collection</p>
          <h1 className="text-4xl sm:text-5xl font-serif font-semibold tracking-[0.04em] text-deep-ocean">
            The Collection
          </h1>
          <p className="text-charcoal/80 text-lg mt-1 font-sans max-w-2xl mx-auto">
            One-of-a-kind shell art, crafted for curated interiors.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-3 mb-10">
          {visibleCategories.map((category) => {
            const isActive = activeCategorySlug === category.slug;
            return (
              <button
                key={category.slug}
                onClick={() => handleCategorySelect(category.slug)}
                className={`px-4 py-2 rounded-shell border text-[11px] uppercase tracking-[0.22em] transition ${
                  isActive
                    ? 'bg-deep-ocean text-white border-deep-ocean shadow-md'
                    : 'bg-white/80 text-deep-ocean border-driftwood/60 hover:bg-sand/70'
                }`}
              >
                {category.name}
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Loading products...</p>
          </div>
        ) : (
          <div className="space-y-12">
            {sectionCategories.map((category) => {
              const items = groupedProducts[category.slug] || [];
              if (items.length === 0) return null;

              const copyKey = category.slug.toLowerCase();
              const copy =
                CATEGORY_COPY[copyKey] ||
                CATEGORY_COPY[(category.name || '').toLowerCase()] ||
                null;
              const subtitle = (category.subtitle || copy?.description || '').trim();
              const title = copy?.title || category.name;

              return (
                <section
                  key={category.slug}
                  id={`category-section-${category.slug}`}
                  className="mb-10"
                >
                  <div className="text-center mb-6 space-y-2">
                    <h2 className="text-2xl sm:text-3xl font-serif tracking-[0.03em] text-deep-ocean">
                      {title}
                    </h2>
                    {subtitle && (
                      <p className="mt-1 text-sm font-sans text-charcoal/70">{subtitle}</p>
                    )}
                  </div>
                  <div className="rounded-2xl border border-driftwood/40 bg-linen/90 shadow-sm p-4 sm:p-6">
                    <ProductGrid products={items} categoryOptionLookup={optionLookup} />
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
