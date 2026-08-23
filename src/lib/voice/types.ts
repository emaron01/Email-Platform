export const VOICE_SAMPLE_MIN_CHARS = 100;
export const VOICE_SAMPLE_READY_MIN = 3;
export const VOICE_SAMPLE_READY_MAX = 10;

export type VoiceSampleView = {
  id: string;
  label: string;
  sampleText: string;
  provenance: "PASTED" | "IMPORTED";
  active: boolean;
  createdAt: string;
};

export function voiceReadiness(count: number): {
  count: number;
  ready: boolean;
  message: string;
} {
  if (count === 0) {
    return {
      count,
      ready: false,
      message:
        "No samples yet. Voice is optional — generation will use a neutral professional register until you add at least 3 sent emails.",
    };
  }
  if (count < VOICE_SAMPLE_READY_MIN) {
    return {
      count,
      ready: false,
      message: `${count} of ${VOICE_SAMPLE_READY_MIN} recommended samples. Add ${VOICE_SAMPLE_READY_MIN - count} more sent emails for a usable voice.`,
    };
  }
  if (count > VOICE_SAMPLE_READY_MAX) {
    return {
      count,
      ready: true,
      message: `${count} samples saved. ${VOICE_SAMPLE_READY_MAX} is enough — extra samples are kept but not required.`,
    };
  }
  return {
    count,
    ready: true,
    message: `${count} samples saved. Voice is ready for generation.`,
  };
}
