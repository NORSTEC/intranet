"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useProfileEdit } from "@/components/portal/profile-edit-form";

export function ProfileImageEditor({
  alt,
  initialUrl,
}: {
  alt: string;
  initialUrl?: string;
}) {
  const [previewUrl, setPreviewUrl] = useState(initialUrl);
  const inputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const { markDirty } = useProfileEdit();

  const releaseObjectUrl = () => {
    if (!objectUrlRef.current) return;
    URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  };

  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const resetPreview = () => {
      releaseObjectUrl();
      setPreviewUrl(initialUrl);
    };
    form.addEventListener("reset", resetPreview);
    return () => {
      form.removeEventListener("reset", resetPreview);
      releaseObjectUrl();
    };
  }, [initialUrl]);

  return (
    <div className="relative aspect-[4/5] w-full max-w-sm overflow-hidden rounded-2xl bg-moody-static">
      {previewUrl ? (
        <Image
          alt={alt}
          className="object-cover"
          fill
          priority
          sizes="(min-width: 1024px) 320px, 90vw"
          src={previewUrl}
          unoptimized
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-egg-static">
          <span className="material-symbols-outlined text-5xl">person</span>
        </span>
      )}
      <label className="portal-button profile-image-button absolute bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap">
        <span className="material-symbols-outlined text-[1.1rem]" aria-hidden="true">
          photo_camera
        </span>
        Change image
        <input
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="sr-only"
          name="avatar"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            releaseObjectUrl();
            const objectUrl = URL.createObjectURL(file);
            objectUrlRef.current = objectUrl;
            setPreviewUrl(objectUrl);
            markDirty();
          }}
          ref={inputRef}
          type="file"
        />
      </label>
    </div>
  );
}
