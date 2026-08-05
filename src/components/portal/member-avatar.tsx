import Image from "next/image";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function MemberAvatar({
  name,
  src,
  size = "small",
}: {
  name: string;
  src?: string;
  size?: "small" | "large" | "hero";
}) {
  const sizeClass =
    size === "hero"
      ? "size-28 text-2xl sm:size-32"
      : size === "large"
        ? "size-20 text-lg"
        : "size-11 text-xs";

  return (
    <span
      className={`${sizeClass} relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-copper font-semibold text-moody-static`}
    >
      {src ? (
        <Image
          alt=""
          className="object-cover"
          fill
          sizes={size === "hero" ? "128px" : size === "large" ? "80px" : "44px"}
          src={src}
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}
