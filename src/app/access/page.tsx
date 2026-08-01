import Image from "next/image";
import Link from "next/link";
import { ThemeToggle } from "@/components/portal/portal-shell";

export default function AccessPage() {
  return (
    <main className="min-h-screen bg-egg px-5 py-6 text-moody sm:px-8 lg:px-12">
      <header className="mx-auto flex max-w-5xl items-center justify-between border-b-2 border-moody pb-5">
        <Link href="/login" className="flex items-center gap-3"><Image src="/images/logo.png" alt="Norstec" width={36} height={36} className="portal-logo" /><span className="font-display text-xl tracking-wide">NORSTEC</span></Link>
        <ThemeToggle compact />
      </header>
      <div className="mx-auto max-w-2xl py-12 lg:py-20">
        <Link href="/login" className="mb-8 inline-flex items-center gap-2 text-sm"><span className="material-symbols-outlined rotate-180 text-[1.15rem]">arrow_right_alt</span>Back</Link>
        <h1 className="text-h1">Request access<span aria-hidden className="page-star" /></h1>
        <p className="mt-4 text-sm opacity-55">Your organization must approve the request.</p>

        <form className="mt-12 space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <label className="flex flex-col gap-2"><span className="section-label">First name</span><input className="portal-field" placeholder="Eirik" /></label>
            <label className="flex flex-col gap-2"><span className="section-label">Last name</span><input className="portal-field" placeholder="Engen Kvam" /></label>
          </div>
          <label className="flex flex-col gap-2"><span className="section-label">Organization</span><select className="portal-field"><option>Select organization</option><option>Orbit NTNU</option><option>Interstellar NTNU</option><option>Portal Space</option><option>Propulse NTNU</option></select></label>
          <label className="flex flex-col gap-2"><span className="section-label">Field of study</span><input className="portal-field" /></label>
          <label className="flex flex-col gap-2"><span className="section-label">Message</span><textarea className="portal-field min-h-32 resize-y" /></label>
          <button className="portal-button" type="submit">Send request<span className="material-symbols-outlined">arrow_right_alt</span></button>
        </form>
      </div>
    </main>
  );
}
