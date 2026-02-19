import { FormEvent, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { subscribeToEmailList } from '../lib/emailListApi';

type SignupState = 'idle' | 'submitting' | 'success' | 'duplicate' | 'error';

type EmailSignupBandProps = {
  className?: string;
};

export function EmailSignupBand({ className = '' }: EmailSignupBandProps) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<SignupState>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = email.trim();
    if (!normalized) {
      setState('error');
      setMessage('Please enter an email address.');
      return;
    }

    setState('submitting');
    setMessage('');
    try {
      const result = await subscribeToEmailList(normalized);
      if (result.alreadySubscribed) {
        setState('duplicate');
        setMessage("You're already on the list. You're all set.");
      } else {
        setState('success');
        setMessage('We got it! You are now on the list.');
      }
      setEmail('');
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : 'Unable to subscribe right now.');
    }
  };

  return (
    <section className={`lux-card p-6 sm:p-8 ${className}`}>
      <div className="space-y-3">
        <p className="section-eyebrow">Email List</p>
        <h2 className="section-heading">Join our email list</h2>
        <p className="section-subtext">
          New drops, restocks, and updates from Dover Designs.
        </p>
      </div>

      <form className="mt-6 flex flex-col gap-3 sm:flex-row" onSubmit={handleSubmit}>
        <label htmlFor="email-list-address" className="sr-only">
          Email address
        </label>
        <input
          id="email-list-address"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="lux-input h-11 flex-1 text-sm"
        />
        <button
          type="submit"
          disabled={state === 'submitting'}
          className="lux-button h-11 px-5 text-[11px] disabled:opacity-60"
        >
          {state === 'submitting' ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Subscribing...
            </span>
          ) : (
            'Join'
          )}
        </button>
      </form>

      {state === 'success' && <p className="mt-3 text-sm text-emerald-700">{message}</p>}
      {state === 'duplicate' && <p className="mt-3 text-sm text-deep-ocean/80">{message}</p>}
      {state === 'error' && <p className="mt-3 text-sm text-rose-700">{message}</p>}
    </section>
  );
}

