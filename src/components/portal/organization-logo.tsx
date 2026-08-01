import Image from "next/image";

const logoScales: Record<string, number> = {
  "astro-hvl": 1.65,
  "eclipse-nmbu": 3.1,
  "ignite-uit": 2.9,
  "interstellar-uia": 1,
  "orbit-ntnu": 1.15,
  "polarix-uit": 1.35,
  "portal-space": 1.35,
  "propulse-ntnu": 1,
  "uis-aerospace": 1,
  "usn-horizon": 1.35,
};

function logoScale(logoPath: string) {
  const filename = logoPath.split("/").at(-1)?.replace(/\.(png|svg)$/i, "");
  return filename ? (logoScales[filename] ?? 1) : 1;
}

export function OrganizationLogo({
  logoPath,
  name,
  size = "card",
}: {
  logoPath: string | null;
  name: string;
  size?: "card" | "detail" | "experience";
}) {
  const isExperience = size === "experience";
  const wrapperSize =
    size === "detail"
      ? "h-44 w-full sm:w-72"
      : isExperience
        ? "h-16 w-28"
        : "h-28 w-full";
  const innerInset = size === "detail" ? "inset-6" : isExperience ? "inset-3" : "inset-5";
  const surfaceClass = isExperience
    ? "bg-transparent"
    : "rounded-xl bg-moody-static";

  if (!logoPath) {
    return (
      <span
        className={`${wrapperSize} ${surfaceClass} flex shrink-0 items-center justify-center text-2xl font-semibold ${isExperience ? "text-moody-static" : "text-egg-static"}`}
      >
        {name
          .split(/\s+/)
          .map((part) => part[0])
          .join("")
          .slice(0, 2)
          .toUpperCase()}
      </span>
    );
  }

  if (logoPath === "/images/logo.png") {
    return (
      <span
        aria-label={`${name} logo`}
        className={`${wrapperSize} ${surfaceClass} flex shrink-0 items-center justify-center`}
        role="img"
      >
        <span className={`organization-logo-norstec ${isExperience ? "size-12" : "size-20"}`} />
      </span>
    );
  }

  return (
    <span
      className={`${wrapperSize} ${surfaceClass} relative block shrink-0 overflow-hidden`}
    >
      <span className={`absolute ${innerInset}`}>
        <Image
          alt={`${name} logo`}
          className={`object-contain ${logoPath.includes("polarix-uit") ? "organization-logo-white" : ""}`}
          fill
          sizes={
            isExperience
              ? "128px"
              : size === "detail"
              ? "216px"
              : "(min-width: 1280px) 26vw, (min-width: 640px) 40vw, 80vw"
          }
          src={logoPath}
          style={{
            transform: `scale(${logoScale(logoPath) * (size === "detail" ? 0.82 : isExperience ? 0.78 : 1)})`,
          }}
        />
      </span>
    </span>
  );
}
