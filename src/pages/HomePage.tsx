import { useEffect, useState } from 'react';
import HomeTemplate from './HomeTemplate';
import { getPublicSiteContentHome } from '../lib/api';
import type { HomeSiteContent } from '../lib/types';

export function HomePage() {
  const [homeContent, setHomeContent] = useState<HomeSiteContent | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const content = await getPublicSiteContentHome();
        if (!cancelled) {
          setHomeContent(content || {});
        }
      } catch (err) {
        console.error('Failed to load home content', err);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <HomeTemplate
      homeGalleryItems={homeContent?.homeGallery}
      aboutImageUrl={homeContent?.aboutImages?.home}
    />
  );
}
