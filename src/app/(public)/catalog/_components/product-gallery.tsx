"use client";

import { useRef, useState } from "react";
import type { CatalogImage } from "@/server/services/public-catalog";

type ProductGalleryProps = {
  images: CatalogImage[];
  productName: string;
  fallbackUrl: string;
};

export function ProductGallery({ images, productName, fallbackUrl }: ProductGalleryProps) {
  const slides = images.length > 0 ? images : [{ id: "fallback", url: fallbackUrl, thumbUrl: fallbackUrl, mediumUrl: fallbackUrl, isPrimary: true }];
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  function scrollTo(index: number) {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const child = scroller.children[index] as HTMLElement | undefined;
    child?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    setActive(index);
  }

  function handleScroll() {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const index = Math.round(scroller.scrollLeft / scroller.clientWidth);
    if (index !== active) setActive(index);
  }

  return (
    <div className="catalog-rise space-y-3">
      <div className="relative">
        <div
          ref={scrollerRef}
          onScroll={handleScroll}
          className="snap-x-gallery flex overflow-x-auto rounded-[1.75rem] border border-[var(--cat-line)] bg-[var(--cat-surface-sunken)]"
        >
          {slides.map((image) => (
            <div key={image.id} className="aspect-square w-full shrink-0 basis-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.mediumUrl ?? image.url}
                alt={productName}
                className="size-full object-contain p-6"
              />
            </div>
          ))}
        </div>

        {slides.length > 1 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {slides.map((image, index) => (
              <span
                key={image.id}
                className={`h-1.5 rounded-full transition-all ${
                  index === active ? "w-5 bg-[var(--cat-accent)]" : "w-1.5 bg-[var(--cat-line-strong)]"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {slides.length > 1 && (
        <div className="snap-x-gallery flex gap-2 overflow-x-auto pb-1">
          {slides.map((image, index) => (
            <button
              key={image.id}
              type="button"
              onClick={() => scrollTo(index)}
              aria-label={`Ver imagem ${index + 1}`}
              aria-current={index === active}
              className={`size-16 shrink-0 overflow-hidden rounded-xl border transition ${
                index === active ? "border-[var(--cat-accent)]" : "border-[var(--cat-line)] opacity-60 hover:opacity-100"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.thumbUrl ?? image.mediumUrl ?? image.url}
                alt=""
                className="size-full object-contain p-1.5"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
