import { Instagram, Facebook, Twitter } from 'lucide-react';

export function SocialSection() {
  return (
    <div className="py-12 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Connect With Us
          </h2>
          <p className="text-gray-600 mb-8 max-w-2xl mx-auto">
            Follow our journey and stay updated with new creations
          </p>
          <div className="flex justify-center gap-6">
            <a
              href="#"
              className="p-3 bg-white rounded-full shadow-md hover:shadow-lg transition-shadow"
              aria-label="Instagram"
            >
              <Instagram className="w-6 h-6 text-gray-700" />
            </a>
            <a
              href="#"
              className="p-3 bg-white rounded-full shadow-md hover:shadow-lg transition-shadow"
              aria-label="Facebook"
            >
              <Facebook className="w-6 h-6 text-gray-700" />
            </a>
            <a
              href="#"
              className="p-3 bg-white rounded-full shadow-md hover:shadow-lg transition-shadow"
              aria-label="Twitter"
            >
              <Twitter className="w-6 h-6 text-gray-700" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
