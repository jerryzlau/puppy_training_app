"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import {
  Stamp,
  SketchButton,
  HandLabel,
  DashedRow,
  Polaroid,
  PawPlaceholder,
  ErrorNote,
} from "@/components/scrapbook";

interface Invite {
  id: string;
  email: string;
  status: string;
  token: string;
  created_at: string;
}

export default function FamilyPage() {
  const router = useRouter();
  const { household, session, signOut, refreshHousehold } = useSession();
  const [email, setEmail] = useState("");
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Invite[]>("/invites").then(setInvites).catch(() => {});
  }, []);

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const invite = await api<Invite>("/invites", { method: "POST", body: { email } });
      const link = `${window.location.origin}/join/${invite.token}`;
      setInviteLink(link);
      setInvites((prev) => [invite, ...prev]);
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "couldn't create invite");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function logout() {
    await signOut();
    router.replace("/signin");
  }

  const dogAge = household?.dogBirthday
    ? `${Math.floor((Date.now() - new Date(household.dogBirthday).getTime()) / (30.44 * 86_400_000))} mo`
    : null;

  return (
    <main className="px-6 pt-12">
      <h1 className="font-hand text-[38px] leading-none">
        {household?.dogName ?? "Biru"}&apos;s Family 🏠
      </h1>

      <div className="w-[180px] mx-auto my-6">
        <Polaroid
          seed="dog-profile"
          caption={`${household?.dogName ?? "Biru"} · ${household?.dogBreed?.toLowerCase() ?? "biewer"}${dogAge ? ` · ${dogAge}` : ""}`}
        >
          {household?.dogPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={household.dogPhotoUrl} alt={household.dogName} className="h-[140px] w-full object-cover" />
          ) : (
            <PawPlaceholder className="h-[140px]" />
          )}
        </Polaroid>
      </div>

      <h2 className="font-hand text-2xl text-wood mb-1">the pack</h2>
      {household?.members.map((m) => (
        <DashedRow key={m.userId} className="text-[14.5px]">
          <span aria-hidden>{m.color === "blue" ? "👩" : "🧑"}</span>
          <b>{m.displayName}</b>
          <span className="text-xs text-inkSoft truncate">
            {m.userId === session?.user.id ? session?.user.email : `joined ${new Date(m.joinedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`}
          </span>
          <Stamp className="ml-auto" color={m.role === "owner" ? "green" : "blue"}>
            {m.userId === session?.user.id ? "you" : m.role}
          </Stamp>
        </DashedRow>
      ))}

      <div className="border-[2.5px] border-dashed border-wood rounded-lg p-4 mt-5 bg-cream">
        <div className="font-hand text-2xl">✉️ invite someone to the book</div>
        <p className="text-xs text-inkSoft mt-1 mb-3">
          they&apos;ll see every page &amp; can tick off lessons with you
        </p>
        {inviteLink ? (
          <div>
            <p className="text-sm break-all bg-white border border-ruled rounded p-2.5 mb-3">{inviteLink}</p>
            <SketchButton onClick={copyLink}>
              {copied ? "copied! ✓ now send it to them" : "copy the invite link"}
            </SketchButton>
            <button
              className="block mx-auto mt-3 text-xs underline text-inkSoft"
              onClick={() => setInviteLink(null)}
            >
              invite someone else
            </button>
          </div>
        ) : (
          <form onSubmit={sendInvite}>
            <input
              className="input-line mb-4"
              type="email"
              placeholder="partner@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            {error && <ErrorNote message={error} />}
            <SketchButton type="submit" disabled={busy || !email}>
              {busy ? "writing the invite…" : "create invite link"}
            </SketchButton>
          </form>
        )}
        {invites.filter((i) => i.status === "pending").length > 0 && !inviteLink && (
          <p className="text-xs text-inkSoft mt-3">
            pending: {invites.filter((i) => i.status === "pending").map((i) => i.email).join(", ")}
          </p>
        )}
      </div>

      <div className="mt-6">
        <HandLabel>housekeeping</HandLabel>
        <DashedRow className="text-[14.5px] justify-between">
          <span>📤 print the scrapbook (photo-book pdf)</span>
          <Stamp color="gray">soon</Stamp>
        </DashedRow>
        <button
          onClick={() => void refreshHousehold()}
          className="w-full text-left py-3 px-0 border-b-[1.5px] border-dashed border-ruled text-[14.5px]"
        >
          🔄 refresh the book
        </button>
        <button
          onClick={() => void logout()}
          className="w-full text-left py-3 text-[14.5px] font-bold text-accent"
        >
          close the book (log out)
        </button>
      </div>
      <div className="h-8" />
    </main>
  );
}
