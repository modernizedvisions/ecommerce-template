import { useEffect, useMemo, useState } from 'react';
import { fetchCategories } from '../lib/api';
import type { Category } from '../lib/types';

interface ContactFormProps {
  backgroundColor?: string;
  variant?: 'card' | 'embedded';
  defaultInquiryType?: 'message' | 'custom_order';
}

export function ContactForm({
  backgroundColor = '#FAC6C8',
  variant = 'card',
  defaultInquiryType = 'message',
}: ContactFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: '',
  });
  const [inquiryType, setInquiryType] = useState<'message' | 'custom_order'>(defaultInquiryType);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'success' | 'error' | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedType, setSubmittedType] = useState<'message' | 'custom_order'>(defaultInquiryType);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [isImageProcessing, setIsImageProcessing] = useState(false);

  const MAX_IMAGE_BYTES = 8_000_000; // 8MB raw upload cap (client-side)
  const MAX_DATA_URL_LENGTH = 1_800_000; // matches backend size guard (~1.8MB chars)
  const MAX_IMAGE_DIMENSION = 1600;
  const IMAGE_QUALITY = 0.82;
  const debugMessages = import.meta.env.VITE_DEBUG_MESSAGES === '1' || import.meta.env.DEV;

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  useEffect(() => {
    let isMounted = true;
    const loadCategories = async () => {
      try {
        setIsLoadingCategories(true);
        const data = await fetchCategories();
        if (!isMounted) return;
        setCategories(Array.isArray(data) ? data : []);
        setCategoryError(null);
      } catch (err) {
        if (!isMounted) return;
        setCategories([]);
        setCategoryError('Categories are loading soon.');
      } finally {
        if (isMounted) setIsLoadingCategories(false);
      }
    };
    void loadCategories();
    return () => {
      isMounted = false;
    };
  }, []);

  const categoryChips = useMemo(() => {
    const filtered = categories
      .filter((category) => {
        const name = (category.name || '').toLowerCase();
        const slug = (category.slug || '').toLowerCase();
        return name !== 'other items' && slug !== 'other-items';
      })
      .map((category) => ({
        id: category.id,
        name: category.name,
      }));
    return filtered;
  }, [categories]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus(null);
    setSubmitError(null);

    try {
      const imageUrl = imageDataUrl || null;

      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          imageUrl: imageUrl || undefined,
          type: inquiryType,
          categoryIds:
            inquiryType === 'custom_order' ? selectedCategories.map((category) => category.id) : undefined,
          categoryNames:
            inquiryType === 'custom_order' ? selectedCategories.map((category) => category.name) : undefined,
        }),
      });

      if (!res.ok) {
        let errorMessage = 'Failed to send message';
        try {
          const data = await res.json();
          if (data?.error) errorMessage = data.error;
        } catch {
          // ignore JSON parse errors
        }
        throw new Error(errorMessage);
      }

      const data = await res.json().catch(() => null);
      if (data?.success === false && data?.error) {
        throw new Error(data.error);
      }

      setSubmitStatus('success');
      setSubmittedType(inquiryType);
      setFormData({ name: '', email: '', message: '' });
      setInquiryType(defaultInquiryType);
      setSelectedCategories([]);
      setImageFile(null);
      setImagePreview(null);
      setImageDataUrl(null);
    } catch (error) {
      console.error('Error sending message:', error);
      setSubmitStatus('error');
      setSubmitError(error instanceof Error ? error.message : 'There was an error sending your message.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleInquiryTypeChange = (type: 'message' | 'custom_order') => {
    setInquiryType(type);
    if (type === 'message') {
      setSelectedCategories([]);
    }
  };

  const handleSelectCategory = (chip: { id: string; name: string }) => {
    setSelectedCategories((prev) => {
      const exists = prev.some((category) => category.id === chip.id);
      if (exists) {
        return prev.filter((category) => category.id !== chip.id);
      }
      return [...prev, { id: chip.id, name: chip.name }];
    });
  };

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') resolve(reader.result);
        else reject(new Error('Failed to read image'));
      };
      reader.onerror = () => reject(new Error('Failed to read image'));
      reader.readAsDataURL(file);
    });

  const compressImageToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        const maxDim = MAX_IMAGE_DIMENSION;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const targetWidth = Math.max(1, Math.round(img.width * scale));
        const targetHeight = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('Image processing failed'));
          return;
        }
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        const dataUrl = canvas.toDataURL('image/jpeg', IMAGE_QUALITY);
        URL.revokeObjectURL(objectUrl);
        resolve(dataUrl);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to read image'));
      };
      img.src = objectUrl;
    });

  const handleFiles = (files: FileList | null) => {
    if (!files || !files.length) return;
    const file = files[0];
    if (file.size > MAX_IMAGE_BYTES) {
      setImageFile(null);
      setImageDataUrl(null);
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
        setImagePreview(null);
      }
      setSubmitStatus('error');
      setSubmitError('Image too large. Please upload a photo under 8MB.');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setSubmitStatus('error');
      setSubmitError('Unsupported file type. Please upload an image.');
      return;
    }
    setSubmitError(null);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setIsImageProcessing(true);
    setImageDataUrl(null);
    compressImageToDataUrl(file)
      .then((dataUrl) => {
        if (debugMessages) {
          console.debug('[contact form] image processed', {
            name: file.name,
            type: file.type,
            size: file.size,
            dataUrlLength: dataUrl.length,
          });
        }
        if (dataUrl.length > MAX_DATA_URL_LENGTH) {
          setSubmitStatus('error');
          setSubmitError('Image is still too large after compression. Please use a smaller photo.');
          setImageFile(null);
          setImageDataUrl(null);
          return;
        }
        setImageDataUrl(dataUrl);
      })
      .catch((err) => {
        console.error('Failed to process image', err);
        setSubmitStatus('error');
        setSubmitError('Unable to process image. Please try another photo.');
        setImageFile(null);
        setImageDataUrl(null);
      })
      .finally(() => {
        setIsImageProcessing(false);
      });
  };

  return (
    <div className="py-12" id="contact" style={{ backgroundColor }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8 px-2 max-sm:space-y-2">
          <h2 className="text-2xl md:text-3xl font-semibold text-slate-900 max-sm:text-xl max-sm:leading-tight max-sm:break-words">
            GET IN TOUCH
          </h2>
          <p className="mt-3 text-[13px] sm:text-base text-slate-600 max-w-5xl mx-auto font-serif subtitle-text whitespace-nowrap max-sm:text-[12.5px] max-sm:leading-snug max-sm:whitespace-normal max-sm:break-words max-sm:max-w-full">
            Interested in a custom piece or looking for something specific? Send a message and I'll reply shortly.
          </p>
        </div>
        <div
          className={
            variant === 'embedded'
              ? 'w-full max-w-4xl mx-auto px-4 sm:px-6 md:px-8 max-sm:px-3 max-sm:max-w-full max-sm:overflow-hidden max-sm:box-border'
              : 'w-full max-w-4xl mx-auto rounded-md contact-form-card border border-slate-200 shadow-lg bg-white overflow-hidden p-4 sm:p-6 md:p-8 max-sm:p-4 max-sm:max-w-full max-sm:overflow-hidden max-sm:box-border'
          }
        >
          <form onSubmit={handleSubmit} className={variant === 'embedded' ? 'space-y-6' : 'space-y-6'}>
            <div className="flex justify-center max-sm:px-1">
              <div className="inline-flex rounded-shell border border-driftwood/60 bg-white/90 p-1 shadow-sm max-sm:w-full max-sm:max-w-full max-sm:flex-nowrap max-sm:justify-center max-sm:items-center max-sm:box-border max-sm:overflow-hidden">
                <button
                  type="button"
                  onClick={() => handleInquiryTypeChange('message')}
                  className={`rounded-shell px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.3em] transition whitespace-nowrap max-sm:px-3 max-sm:py-2.5 max-sm:text-[10px] ${
                    inquiryType === 'message'
                      ? 'bg-deep-ocean text-white shadow-sm'
                      : 'text-deep-ocean hover:bg-sand/70'
                  }`}
                >
                  Message
                </button>
                <button
                  type="button"
                  onClick={() => handleInquiryTypeChange('custom_order')}
                  className={`rounded-shell px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.3em] transition whitespace-nowrap max-sm:px-3 max-sm:py-2.5 max-sm:text-[10px] ${
                    inquiryType === 'custom_order'
                      ? 'bg-deep-ocean text-white shadow-sm'
                      : 'text-deep-ocean hover:bg-sand/70'
                  }`}
                >
                  Custom Order
                </button>
              </div>
            </div>

            <div className="space-y-3 min-h-0 flex flex-col">
              {inquiryType === 'custom_order' ? (
                <>
                  {categoryError && (
                    <p className="text-center text-xs text-slate-500 max-md:hidden">{categoryError}</p>
                  )}
                  {isLoadingCategories ? (
                    <div className="mx-auto flex max-w-4xl flex-wrap justify-center gap-2 max-md:hidden">
                      {Array.from({ length: 6 }).map((_, index) => (
                        <div
                          key={`contact-chip-skeleton-${index}`}
                          className="h-10 w-24 rounded-full bg-slate-200/70 animate-pulse"
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="mx-auto flex max-w-4xl flex-wrap justify-center gap-3 max-md:hidden">
                      {categoryChips.map((chip) => {
                        const isSelected = selectedCategories.some((category) => category.id === chip.id);
                        return (
                          <button
                            key={chip.id}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => handleSelectCategory(chip)}
                            className={`rounded-shell px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.3em] min-h-[40px] shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#c89f6e] ${
                              isSelected
                                ? 'border border-deep-ocean bg-deep-ocean text-white hover:brightness-105'
                                : 'border border-driftwood/70 bg-white/90 text-deep-ocean hover:border-driftwood hover:bg-sand/60'
                            }`}
                          >
                            {chip.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <div aria-hidden className="h-0" />
              )}
            </div>

            <div>
              <label
                htmlFor="name"
                className="block text-sm font-semibold text-gray-700 mb-1 font-sans tracking-[0.12em]"
              >
                Name
              </label>
              <input
                type="text"
                id="name"
                name="name"
                required
                value={formData.name}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-900 focus:border-transparent font-sans font-semibold tracking-[0.12em] text-gray-900 placeholder:font-sans placeholder:font-semibold placeholder:tracking-[0.12em] placeholder:text-gray-500"
              />
            </div>
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-semibold text-gray-700 mb-1 font-sans tracking-[0.12em]"
              >
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                required
                value={formData.email}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-900 focus:border-transparent font-sans font-semibold tracking-[0.12em] text-gray-900 placeholder:font-sans placeholder:font-semibold placeholder:tracking-[0.12em] placeholder:text-gray-500"
              />
            </div>
            <div>
              <label
                htmlFor="message"
                className="block text-sm font-semibold text-gray-700 mb-1 font-sans tracking-[0.12em]"
              >
                Message
              </label>
              <textarea
                id="message"
                name="message"
                required
                rows={5}
                value={formData.message}
                onChange={handleChange}
                placeholder="Tell me what you're looking for - custom ideas, questions, or details."
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none font-sans font-semibold tracking-[0.12em] text-gray-900 placeholder:font-sans placeholder:font-semibold placeholder:tracking-[0.12em] placeholder:text-gray-500"
              />
            </div>

            <div>
              <div
                className="rounded-md border-2 border-dashed border-gray-300 bg-gray-50 p-4 text-center text-sm text-gray-600 cursor-pointer"
                onClick={() => document.getElementById('contact-image-input')?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleFiles(e.dataTransfer.files);
                }}
              >
                <input
                  id="contact-image-input"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
                {imagePreview ? (
                  <div className="flex flex-col items-center gap-2">
                    <img src={imagePreview} alt="Upload preview" className="h-32 w-32 object-cover rounded-md border border-gray-200" />
                    <span className="text-xs text-gray-500">Click or drop to replace</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <span className="font-sans font-semibold tracking-[0.12em] text-gray-800 text-[12px] sm:text-[13px]">
                      Share a photo (optional)
                    </span>
                    <span className="text-xs text-gray-500 font-sans font-semibold tracking-[0.12em]">
                      Upload images, inspiration, or designs you'd like us to reference
                    </span>
                  </div>
                )}
              </div>
            </div>

            {submitStatus === 'success' && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-md text-green-800 text-sm text-center">
                {submittedType === 'message'
                  ? 'Thank you for your message! We typically respond within 24-48 Hours'
                  : "Got it - we're excited!"}
              </div>
            )}

            {submitStatus === 'error' && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
                {submitError || 'There was an error sending your message. Please try again.'}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || isImageProcessing}
              className="lux-button w-full text-[10px] sm:text-[11px] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting || isImageProcessing ? 'Sending...' : 'SEND MESSAGE'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
