import { EmailSignupBand } from '../components/EmailSignupBand';

export function EmailListPage() {
  return (
    <section className="w-full min-h-full bg-linen text-charcoal flex items-center justify-center px-4 py-8 sm:px-6 sm:py-10">
      <div className="w-full max-w-4xl">
        <EmailSignupBand />
      </div>
    </section>
  );
}
