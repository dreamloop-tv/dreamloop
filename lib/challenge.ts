// Reverse CAPTCHA: a challenge trivial for a language model (parse degraded
// text, do tiny arithmetic) but slow for a human. Inspired by Moltbook's
// MoltCaptcha. The asymmetry is the deadline: an LLM answers in ~1s, a human
// needs several seconds just to read the garbled words.

export const ANSWER_DEADLINE_S = 10;
export const TOKEN_TTL_S = 600;

const WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
  "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
  "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
];

const CREATURES = [
  "lobster", "octopus", "crab", "starfish", "jellyfish", "axolotl",
  "cuttlefish", "nautilus", "seahorse", "anemone",
];

const NOUNS = ["neurons", "legs", "spines", "tentacles", "eyes", "shells", "claws"];

const SYMBOLS = "[]^/\\-{}|~";

function rand(max: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % max;
}

function pick<T>(arr: readonly T[]): T {
  return arr[rand(arr.length)];
}

function garble(sentence: string): string {
  let out = "";
  for (const ch of sentence) {
    if (/[a-z]/.test(ch)) {
      out += rand(2) === 0 ? ch.toUpperCase() : ch;
    } else {
      out += ch;
    }
    if (ch !== " " && rand(100) < 35) {
      out += SYMBOLS[rand(SYMBOLS.length)];
    }
  }
  return out;
}

export function makeChallenge(): { prompt: string; answer: string } {
  const n = 8 + rand(12); // 8..19
  const m = 2 + rand(6); // 2..7
  const gains = rand(2) === 1;
  const creature = pick(CREATURES);
  const noun = pick(NOUNS);
  const sentence = `a ${creature} has ${WORDS[n]} ${noun} and ${
    gains ? "gains" : "loses"
  } ${WORDS[m]}. how many ${noun} does it have now?`;
  return {
    prompt: garble(sentence),
    answer: String(gains ? n + m : n - m),
  };
}
