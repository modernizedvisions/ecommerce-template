import React from 'react';

type LegalPageLayoutProps = {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
};

export function LegalPageLayout({ title, lastUpdated, children }: LegalPageLayoutProps) {
  return (
    <div className="bg-white">
      <section className="py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl sm:text-4xl font-serif font-bold text-gray-900 mb-3">
            {title}
          </h1>
          <p className="text-sm font-serif text-gray-600 mb-10">
            Last updated: {lastUpdated}
          </p>
          <div className="space-y-6 text-gray-700 leading-relaxed">
            {children}
          </div>
        </div>
      </section>
    </div>
  );
}
