import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4"; // the SDK's helper is built on zod v4

// "Pee, poop, or neither?" for a Biru Cam candidate (CAM-PLAN.md §4 stage 3).
// The Pi only sends moments where the dog held still for a few seconds; this
// looks at 4 crops of the dog taken ~1.5 s apart and judges the posture.

const MODEL = "claude-haiku-5-5"; // cheap + fast; the strip is small and the question narrow

const Verdict = z.object({
  label: z.enum(["pee", "poop", "neither"]),
  confidence: z.number().describe("0 to 1: how sure you are of the label"),
  posture: z.string().describe("one short sentence describing what the dog is doing"),
});
export type CamVerdict = z.infer<typeof Verdict>;

const PROMPT = `These are 4 frames, about 1.5 seconds apart in order, from a fixed camera watching a puppy at home. The puppy has stayed in roughly one spot for a few seconds.

Decide whether the puppy is peeing, pooping, or neither:
- pee: hind end lowered into a squat (or a leg lifted), body otherwise still, held for a few seconds.
- poop: a deeper hunched squat with the back rounded and the tail up or out, often held longer; sometimes circling just before.
- neither: sitting, lying down, sleeping, chewing, sniffing, eating, drinking, playing, or the dog is unclear or out of frame.

Most still moments are "neither". Only answer pee or poop when the posture clearly shows it, and lower the confidence when the view is ambiguous.`;

let client: Anthropic | null = null;

/** null when ANTHROPIC_API_KEY isn't set on this server — the camera then logs nothing. */
export function classifierReady(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function classifyStrip(cropsBase64: string[]): Promise<CamVerdict | null> {
  client ??= new Anthropic();
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 1024,
    output_config: { effort: "low", format: zodOutputFormat(Verdict) },
    messages: [
      {
        role: "user",
        content: [
          ...cropsBase64.map((data) => ({
            type: "image" as const,
            source: { type: "base64" as const, media_type: "image/jpeg" as const, data },
          })),
          { type: "text", text: PROMPT },
        ],
      },
    ],
  });
  // A safety decline or a cut-off answer is "no verdict", never a guess.
  if (response.stop_reason !== "end_turn") return null;
  return response.parsed_output ?? null;
}
