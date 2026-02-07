import { useEffect } from 'react';
import { LegalPageLayout } from '../components/LegalPageLayout';

export function PrivacyPage() {
  useEffect(() => {
    document.title = 'Privacy Policy | Dover Designs';
  }, []);

  return (
    <LegalPageLayout title="PRIVACY POLICY" lastUpdated="January 25, 2026">
      <p>
        This Privacy Policy explains how Dover Designs (“we,” “us,” “our”) collects, uses, and shares information when
        you use our website (the “Site”).
      </p>

      <div>
        <h2 className="text-lg font-serif font-semibold text-gray-900 mb-2">1) INFORMATION WE COLLECT</h2>
        <p className="font-semibold text-gray-900 mb-2">a) Information you provide</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>Contact inquiries: Name, email address, message text, and any optional image or file you choose to upload.</li>
          <li>
            Orders/checkout: Information needed to fulfill your purchase (such as shipping details), which may be
            collected during checkout.
          </li>
        </ul>
        <p className="font-semibold text-gray-900 mt-4 mb-2">b) Information collected automatically</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            Technical data: Device type, browser type, IP address, and approximate location may be logged by our hosting
            and security providers for performance and security.
          </li>
          <li>Cookies and similar technologies: Used for essential site functionality and to improve the Site.</li>
        </ul>
      </div>

      <div>
        <h2 className="text-lg font-serif font-semibold text-gray-900 mb-2">2) HOW WE USE INFORMATION</h2>
        <p>We use information to:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>Respond to inquiries and provide customer support</li>
          <li>Process orders and fulfill purchases (including shipping updates)</li>
          <li>Prevent fraud, abuse, and security incidents</li>
          <li>Maintain and improve the Site (performance, debugging, analytics where used)</li>
          <li>Comply with legal obligations</li>
        </ul>
      </div>

      <div>
        <h2 className="text-lg font-serif font-semibold text-gray-900 mb-2">3) PAYMENT PROCESSING</h2>
        <p>
          Payments are handled by third-party payment processors. Dover Designs does not store full payment card numbers
          or security codes on its servers. Payment processors handle your payment information under their own privacy
          policies.
        </p>
      </div>

      <div>
        <h2 className="text-lg font-serif font-semibold text-gray-900 mb-2">4) EMAIL COMMUNICATIONS</h2>
        <p>
          We may send emails related to your orders or inquiries (e.g., confirmations, receipts, responses). Email
          delivery may be handled by third-party providers.
        </p>
      </div>

      <div>
        <h2 className="text-lg font-serif font-semibold text-gray-900 mb-2">5) IMAGE UPLOADS</h2>
        <p>
          If you upload an image (for example, through a contact form or custom order request), we store it to provide
          support and fulfill your request. Please do not upload sensitive personal information.
        </p>
      </div>

      <div>
        <h2 className="text-lg font-serif font-semibold text-gray-900 mb-2">6) SHARING OF INFORMATION</h2>
        <p>We share information only as needed to operate the Site, such as with:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>Service providers (hosting, storage, payment processing, email delivery, and security)</li>
          <li>Shipping or fulfillment partners when required to deliver orders</li>
          <li>Legal or regulatory authorities when required by law or to protect rights and safety</li>
        </ul>
        <p className="mt-4">We do not sell your personal information.</p>
      </div>

      <div>
        <h2 className="text-lg font-serif font-semibold text-gray-900 mb-2">7) DATA RETENTION</h2>
        <p>
          We retain personal information only as long as necessary for the purposes described above, including
          record-keeping, resolving disputes, and complying with legal obligations.
        </p>
      </div>

      <div>
        <h2 className="text-lg font-serif font-semibold text-gray-900 mb-2">8) SECURITY</h2>
        <p>
          We take reasonable measures to protect information. However, no online service can guarantee absolute
          security.
        </p>
      </div>

      <div>
        <h2 className="text-lg font-serif font-semibold text-gray-900 mb-2">9) YOUR CHOICES</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            You may contact us to request access, correction, or deletion of certain personal information, subject to
            legal or operational requirements.
          </li>
          <li>You may opt out of non-essential communications by following unsubscribe instructions where available.</li>
        </ul>
      </div>

      <div>
        <h2 className="text-lg font-serif font-semibold text-gray-900 mb-2">10) CHILDREN’S PRIVACY</h2>
        <p>
          The Site is not intended for children under 13, and we do not knowingly collect personal information from
          children under 13.
        </p>
      </div>

      <div>
        <h2 className="text-lg font-serif font-semibold text-gray-900 mb-2">11) CHANGES TO THIS POLICY</h2>
        <p>We may update this Privacy Policy from time to time. Changes become effective when posted on this page.</p>
      </div>

      <div>
        <h2 className="text-lg font-serif font-semibold text-gray-900 mb-2">12) CONTACT</h2>
        <p>If you have questions about this Privacy Policy, contact us at:</p>
        <p>Email: doverdesignsshells@gmail.com</p>
        <p>Or use the contact form on the Site.</p>
      </div>
    </LegalPageLayout>
  );
}
