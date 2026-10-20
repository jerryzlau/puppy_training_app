import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4"; // the SDK's helper is built on zod v4

// "Pee, poop, or neither?" for a Biru Cam candidate (CAM-PLAN.md §4 stage 3).
// The Pi sends either a visit to the marked pee pad or a still spell elsewhere;
// this looks at crops of the dog taken ~1.5 s apart and judges the posture.
// For a pad visit it also compares the pad before and after — a new wet patch
// or a lump is better evidence than any posture.

const MODEL = "claude-haiku-5-5"; // cheap + fast; the strip is small and the question narrow

const Verdict = z.object({
  label: z.enum(["pee", "poop", "both", "neither"]),
  confidence: z.number().describe("0 to 1: how sure you are of the label"),
  posture: z.string().describe("one short sentence describing what the dog is doing"),
});
export type CamVerdict = z.infer<typeof Verdict>;

const PROMPT = `These are 4 frames, about 1.5 seconds apart in order, from a fixed camera watching a puppy at home. The puppy has stayed in roughly one spot for a few seconds.

Decide whether the puppy is peeing, pooping, or neither:
- pee: hind end lowered into a squat (or a leg lifted), body otherwise still, held for a few seconds.
- poop: a deeper hunched squat with the back rounded and the tail up or out, often held longer; sometimes circling just before.
- neither: sitting, lying down, sleeping, chewing, sniffing, eating, drinking, playing, or the dog is unclear or out of frame.

Most still moments are "neither". Only answer pee or poop when the posture clearly shows it, and lower the confidence when the view is ambiguous. Answer "both" only if you clearly see both.`;

const PAD_PROMPT = `These images come from a fixed camera watching a puppy at home. The puppy just visited its pee pad (a 22 × 22 inch absorbent pad on the floor).

- Images 1–4: the puppy on or by the pad during the visit, in order, about 1.5 seconds apart.
- Image 5: the pad just BEFORE the visit.
- Image 6: the same pad just AFTER the puppy left (the puppy may still be at the edge).

Decide whether the puppy peed, pooped, both, or neither on this visit:
- pee: a new wet, darker or yellowish patch in image 6 that isn't in image 5, and/or a clear pee squat (hind end lowered, still) in images 1–4.
- poop: a new dark lump on or by the pad in image 6, and/or a deep hunched squat with the back rounded.
- both: clear signs of each.
- neither: the puppy walked over, sniffed, sat, lay or played on the pad, and image 6 shows no new mark.

Compare images 5 and 6 carefully — the change on the pad is the strongest evidence. Ignore shifts in lighting, the pad being nudged or wrinkled, and the puppy's own body or shadow. If the pad isn't clearly visible, rely on posture and lower the confidence.`;

/** The pad around a visit, for the before/after comparison. */
export interface PadEvidence {
  before: string;
  after: string;
}

let client: Anthropic | null = null;

/** null when ANTHROPIC_API_KEY isn't set on this server — the camera then logs nothing. */
export function classifierReady(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function classifyStrip(cropsBase64: string[], pad?: PadEvidence): Promise<CamVerdict | null> {
  const images = pad ? [...cropsBase64, pad.before, pad.after] : cropsBase64;
  client ??= new Anthropic();
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 1024,
    output_config: { effort: "low", format: zodOutputFormat(Verdict) },
    messages: [
      {
        role: "user",
        content: [
          ...images.map((data) => ({
            type: "image" as const,
            source: { type: "base64" as const, media_type: "image/jpeg" as const, data },
          })),
          { type: "text", text: pad ? PAD_PROMPT : PROMPT },
        ],
      },
    ],
  });
  // A safety decline or a cut-off answer is "no verdict", never a guess.
  if (response.stop_reason !== "end_turn") return null;
  return response.parsed_output ?? null;
}
