"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { uploadDogPhoto } from "@/lib/photos";
import { CropModal } from "@/components/CropModal";
import { useSession } from "@/lib/session";
import type { FriendDto } from "@biru/shared";
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
  const [photoBusy, setPhotoBusy] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const [friends, setFriends] = useState<FriendDto[]>([]);
  const [petForm, setPetForm] = useState({ species: "dog" as "dog" | "cat", name: "" });
  const [petBusy, setPetBusy] = useState(false);
  const [petError, setPetError] = useState<string | null>(null);
  const [friendLink, setFriendLink] = useState<string | null>(null);
  const [friendCopied, setFriendCopied] = useState(false);
  const [friendBusy, setFriendBusy] = useState(false);
  const [friendError, setFriendError] = useState<string | null>(null);

  useEffect(() => {
    api<Invite[]>("/invites").then(setInvites).catch(() => {});
    api<{ friends: FriendDto[] }>("/friends")
      .then((r) => setFriends(r.friends))
      .catch(() => {});
  }, []);

  async function reframeCurrent() {
    if (!household?.petPhotoUrl) {
      photoInput.current?.click(); // nothing to re-frame yet — pick one
      return;
    }
    setPhotoError(null);
    try {
      // Storage serves with Access-Control-Allow-Origin: *, so the signed URL
      // can be fetched into a File and fed through the same crop modal.
      const res = await fetch(household.petPhotoUrl);
      if (!res.ok) throw new Error("couldn't load the current photo");
      const blob = await res.blob();
      setCropFile(new File([blob], "current.jpg", { type: blob.type || "image/jpeg" }));
    } catch {
      photoInput.current?.click(); // fall back to picking a fresh photo
    }
  }

  function pickDogPhoto(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setPhotoError(null);
    setCropFile(file); // crop first; upload happens on confirm
  }

  async function uploadCropped(cropped: File) {
    setCropFile(null);
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      await uploadDogPhoto(cropped);
      await refreshHousehold();
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "couldn't upload the photo");
    } finally {
      setPhotoBusy(false);
    }
  }

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

  async function addPet() {
    if (!petForm.name.trim()) return;
    setPetBusy(true);
    setPetError(null);
    try {
      await api("/households/me", {
        method: "PATCH",
        body: { petName: petForm.name.trim(), species: petForm.species },
      });
      await refreshHousehold();
    } catch (err) {
      setPetError(err instanceof Error ? err.message : "couldn't add the pet");
    } finally {
      setPetBusy(false);
    }
  }

  async function createFriendLink() {
    setFriendBusy(true);
    setFriendError(null);
    try {
      const inv = await api<{ token: string }>("/friend-invites", { method: "POST" });
      setFriendLink(`${window.location.origin}/befriend/${inv.token}`);
      setFriendCopied(false);
    } catch (err) {
      setFriendError(err instanceof Error ? err.message : "couldn't make the link");
    } finally {
      setFriendBusy(false);
    }
  }

  async function copyFriendLink() {
    if (!friendLink) return;
    await navigator.clipboard.writeText(friendLink);
    setFriendCopied(true);
  }

  async function unfriend(f: FriendDto) {
    if (!window.confirm(`unlink books with ${f.petName}'s family? they'll stop seeing your pages too.`))
      return;
    setFriends((prev) => prev.filter((x) => x.householdId !== f.householdId)); // optimistic
    try {
      await api(`/friends/${f.householdId}`, { method: "DELETE" });
    } catch {
      const r = await api<{ friends: FriendDto[] }>("/friends").catch(() => null);
      if (r) setFriends(r.friends);
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

  const dogAge = household?.petBirthday
    ? `${Math.floor((Date.now() - new Date(household.petBirthday).getTime()) / (30.44 * 86_400_000))} mo`
    : null;

  return (
    <main className="px-6 pt-12">
      <h1 className="font-hand text-[38px] leading-none">
        {household?.petName ? `${household.petName}\u2019s Family` : "Family"} 🏠
      </h1>

      <div className="w-[180px] mx-auto mt-6 mb-1">
        <button
          type="button"
          className="block w-full text-left active:opacity-80"
          onClick={() => void reframeCurrent()}
          disabled={photoBusy}
          aria-label="change the profile photo"
        >
          <Polaroid
            seed="pet-profile"
            caption={`${household?.petName ?? "our pet"}${household?.petBreed ? ` · ${household.petBreed.toLowerCase()}` : ""}${dogAge ? ` · ${dogAge}` : ""}`}
          >
            {household?.petPhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={household.petPhotoUrl}
                alt={household.petName ?? "our pet"}
                className={`h-[140px] w-full object-cover ${photoBusy ? "opacity-40" : ""}`}
              />
            ) : (
              <PawPlaceholder className={`h-[140px] ${photoBusy ? "opacity-40" : ""}`} />
            )}
            <span className="absolute bottom-8 right-1.5 w-8 h-8 rounded-full bg-white border-2 border-ink flex items-center justify-center text-sm rotate-3 shadow-sketchSoft">
              📷
            </span>
          </Polaroid>
        </button>
        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            pickDogPhoto(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      <p className="text-center font-hand text-lg text-inkFaint mb-4">
        {photoBusy ? (
          "developing the portrait…"
        ) : (
          <>
            tap the polaroid to re-frame ·{" "}
            <button
              type="button"
              className="underline text-accent"
              onClick={() => photoInput.current?.click()}
            >
              upload a new photo
            </button>
          </>
        )}
      </p>
      {photoError && <ErrorNote message={photoError} />}

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

      {household && !household.petName && (
        <div className="border-[2.5px] border-dashed border-wood rounded-lg p-4 mt-5 bg-cream">
          <div className="font-hand text-2xl">🐾 got a pet now?</div>
          <p className="text-xs text-inkSoft mt-1 mb-3">
            add them and your book comes alive — diary, school, the whole thing
          </p>
          <div className="flex gap-2 mb-1">
            {(
              [
                { value: "dog", label: "a dog 🐶" },
                { value: "cat", label: "a cat 🐱" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPetForm((f) => ({ ...f, species: opt.value }))}
                className={`flex-1 px-3 py-2 rounded-lg border-2 text-sm font-bold ${
                  petForm.species === opt.value
                    ? "border-accent bg-accent text-white"
                    : "border-ink bg-white text-inkSoft"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <input
            className="input-line mb-3"
            placeholder="their name"
            value={petForm.name}
            onChange={(e) => setPetForm((f) => ({ ...f, name: e.target.value }))}
            maxLength={40}
          />
          {petError && <ErrorNote message={petError} />}
          <SketchButton onClick={addPet} disabled={petBusy || !petForm.name.trim()}>
            {petBusy ? "writing them in…" : "add my pet ✂️"}
          </SketchButton>
        </div>
      )}

      <div className="border-[2.5px] border-dashed border-wood rounded-lg p-4 mt-5 bg-cream">
        <div className="font-hand text-2xl">🐾 friend books</div>
        <p className="text-xs text-inkSoft mt-1 mb-3">
          link books with a friend&apos;s pet — you&apos;ll see each other&apos;s pages in the
          friends feed &amp; can write in the margins
        </p>
        {friends.map((f) => (
          <DashedRow key={f.householdId}>
            <span className="text-xl" aria-hidden>
              {f.species === "cat" ? "🐱" : "🐶"}
            </span>
            <span className="flex-1 text-sm">
              <b>{f.petName}</b>
              <span className="text-inkSoft"> · with {f.ownerName}</span>
              <span className="block text-xs text-inkFaint">
                {f.viaMyLink ? "joined through your link" : "you joined through theirs"} ·{" "}
                {new Date(f.since).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            </span>
            <button
              type="button"
              onClick={() => void unfriend(f)}
              className="text-inkFaint text-sm min-w-[44px] min-h-[44px] flex items-center justify-center -mr-2"
              aria-label={`unfriend ${f.petName}`}
            >
              ✕
            </button>
          </DashedRow>
        ))}
        {friendLink ? (
          <div className="mt-2">
            <p className="text-sm break-all bg-white border border-ruled rounded p-2.5 mb-3">
              {friendLink}
            </p>
            <SketchButton onClick={copyFriendLink}>
              {friendCopied ? "copied! ✓ now send it to them" : "copy the friend link"}
            </SketchButton>
            <button
              className="block mx-auto mt-3 text-xs underline text-inkSoft"
              onClick={() => setFriendLink(null)}
            >
              done
            </button>
          </div>
        ) : (
          <div className="mt-2">
            {friendError && <ErrorNote message={friendError} />}
            <SketchButton variant="ghost" onClick={createFriendLink} disabled={friendBusy}>
              {friendBusy ? "making the link…" : "create a friend link"}
            </SketchButton>
          </div>
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
      {cropFile && (
        <CropModal
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onConfirm={(f) => void uploadCropped(f)}
        />
      )}
    </main>
  );
}
