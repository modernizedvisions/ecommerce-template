import { useEffect } from 'react';
import { LegalPageLayout } from '../components/LegalPageLayout';

export function TermsPage() {
  useEffect(() => {
    document.title = 'Terms of Service | Dover Designs';
  }, []);

  return (
    <LegalPageLayout title="TERMS OF SERVICE" lastUpdated="January 25, 2026">
      <p>
        Welcome to Dover Designs (“we,” “us,” “our”). By accessing or using our website (the “Site”), you agree to these
        Terms of Service (the “Terms”). If you do not agree, please do not use the Site.
      </p>

      <div>
        <h2 className="text-lg font-serif font-semibold text-gray-900 mb-2">1) USING THE SITE</h2>
        <p>
          You may use the Site for personal and commercial browsing purposes in accordance with these Terms. You agree
          not to misuse the Site, interfere with its operation, attempt unauthorized access, introduce malicious code,
          or violate any applicable laws or regulations.
        </p>
      </div>

      <div>
        <h2 className="text-lg font-serif font-semibold text-gray-900 mb-2">2) PRODUCTS, ORDERS, AND PAYMENTS</h2>
        <p>
          Dover Designs offers handcrafted products and custom design services. All prices, availability, and
          descriptions are subject to change without notice.
        </p>
        <p>
          Payments are processed securely through third-party payment providers. Dover Designs does not store or retain
          full payment card information on its servers.
        </p>
        <p>
          We reserve the right to refuse or cancel any order at our discretion, including in cases of pricing errors,
          suspected fraud, or unavailable materials.
        </p>
      </div>

      <div>
        <h2 className="text-lg font-serif font-semibold text-gray-900 mb-2">3) SHIPPING AND RETURNS</h2>
        <p>
          Shipping options, delivery estimates, and return eligibility are presented during checkout or on the Site.
        </p>
        <p>
          Because many items are handmade or custom-produced, certain sales may be final unless otherwise stated. If
          your order arrives damaged or incorrect, please contact us promptly and we will work with you to resolve the
          issue where reasonably possible.
        </p>
      </div>

      <div>
        <h2 className="text-lg font-serif font-semibold text-gray-900 mb-2">4) CUSTOM ORDERS</h2>
        <p>
          Custom orders are created based on the details, references, and approvals you provide. You acknowledge that
          handcrafted work may vary slightly from digital mockups, photographs, or examples due to the nature of
          handmade materials and processes.
        </p>
        <p>
          Unless explicitly stated otherwise in writing, payments or deposits for custom work are non-refundable once
          production has begun.
        </p>
      </div>

      <div>
        <h2 className="text-lg font-serif font-semibold text-gray-900 mb-2">5) USER CONTENT AND COMMUNICATIONS</h2>
        <p>
          If you submit content to us (including messages, photos, files, or design references), you grant Dover Designs
          permission to use that content solely to:
        </p>
        <ul className="list-disc list-inside space-y-1">
          <li>Respond to inquiries</li>
          <li>Fulfill orders or custom requests</li>
          <li>Provide customer support</li>
          <li>Prevent fraud or abuse</li>
          <li>Operate and improve our services</li>
        </ul>
        <p>You represent that you have the legal right to submit any content you provide.</p>
      </div>

      <div>
        <h2 className="text-lg font-serif font-semibold text-gray-900 mb-2">6) INTELLECTUAL PROPERTY</h2>
        <p>
          All content on this Site — including text, images, product designs, photography, branding, and layout — is
          owned by Dover Designs or its licensors and is protected by intellectual property laws.
        </p>
        <p>
          You may not copy, reproduce, distribute, sell, or create derivative works from our content without prior
          written permission, except for personal, non-commercial use.
        </p>
      </div>

      <div>
        <h2 className="text-lg font-serif font-semibold text-gray-900 mb-2">7) THIRD-PARTY SERVICES AND LINKS</h2>
        <p>
          The Site may use or link to third-party services such as payment processors, email platforms, hosting
          providers, or analytics tools. Dover Designs is not responsible for the content, policies, or practices of
          third-party services. Your use of those services is governed by their respective terms.
        </p>
      </div>

      <div>
        <h2 className="text-lg font-serif font-semibold text-gray-900 mb-2">8) DISCLAIMERS</h2>
        <p>
          The Site and all content are provided “as is” and “as available.” We do not guarantee that the Site will be
          uninterrupted, error-free, or secure. To the fullest extent permitted by law, we disclaim all warranties,
          express or implied.
        </p>
      </div>

      <div>
        <h2 className="text-lg font-serif font-semibold text-gray-900 mb-2">9) LIMITATION OF LIABILITY</h2>
        <p>
          To the fullest extent permitted by law, Dover Designs shall not be liable for any indirect, incidental,
          consequential, special, or punitive damages, including loss of profits or data, arising out of your use of the
          Site or purchases made through the Site.
        </p>
      </div>

      <div>
        <h2 className="text-lg font-serif font-semibold text-gray-900 mb-2">10) INDEMNIFICATION</h2>
        <p>
          You agree to indemnify and hold harmless Dover Designs from any claims, damages, losses, and expenses
          (including reasonable attorneys’ fees) arising from your misuse of the Site or violation of these Terms.
        </p>
      </div>

      <div>
        <h2 className="text-lg font-serif font-semibold text-gray-900 mb-2">11) CHANGES TO THESE TERMS</h2>
        <p>
          We may update these Terms at any time. Updates become effective when posted on this page. Continued use of the
          Site after changes indicates acceptance of the revised Terms.
        </p>
      </div>

      <div>
        <h2 className="text-lg font-serif font-semibold text-gray-900 mb-2">12) GOVERNING LAW</h2>
        <p>
          These Terms are governed by the laws of the jurisdiction in which Dover Designs operates, without regard to
          conflict of law principles.
        </p>
      </div>

      <div>
        <h2 className="text-lg font-serif font-semibold text-gray-900 mb-2">13) CONTACT</h2>
        <p>If you have questions about these Terms, contact us at:</p>
        <p>Email: doverdesignsshells@gmail.com</p>
        <p>Or use the contact form on the Site.</p>
      </div>
    </LegalPageLayout>
  );
}
