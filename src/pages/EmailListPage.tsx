import { EmailSignupBand } from '../components/EmailSignupBand';

export function EmailListPage() {
  return (
    <main className="w-full bg-linen text-charcoal py-12 sm:py-16">
      <div className="section-shell mx-auto w-full max-w-[92vw] sm:max-w-4xl px-4">
        <EmailSignupBand />
      </div>
    </main>
  );
}

