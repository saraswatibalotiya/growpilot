import type { MusicTrack } from '../reels.constants';

/** Chord progressions (Hz) for the synthesised, royalty-free music beds. */
const CHORDS: Record<Exclude<MusicTrack, 'NONE'>, { chords: number[][]; period: number; pulse: number; gain: number }> = {
  CALM: { chords: [[220, 277.18, 329.63], [185, 233.08, 277.18], [146.83, 185, 220], [164.81, 207.65, 246.94]], period: 2.5, pulse: 0, gain: 0.05 },
  ELEGANT: { chords: [[130.81, 164.81, 196, 246.94], [110, 130.81, 164.81, 196], [87.31, 110, 130.81, 164.81], [98, 123.47, 146.83, 174.61]], period: 2.5, pulse: 0, gain: 0.045 },
  UPBEAT: { chords: [[220, 277.18, 329.63], [246.94, 311.13, 369.99], [185, 233.08, 277.18], [196, 246.94, 293.66]], period: 2, pulse: 2, gain: 0.055 },
};

/** Picks the chord tone for voice `v` from the current chord index c (0..3). */
function voice(chords: number[][], v: number, period: number): string {
  const f = (i: number) => chords[i]![Math.min(v, chords[i]!.length - 1)]!.toFixed(2);
  const c = `floor(mod(t,${period * 4})/${period})`;
  return `sin(2*PI*if(lt(${c},1),${f(0)},if(lt(${c},2),${f(1)},if(lt(${c},3),${f(2)},${f(3)})))*t)`;
}

/** The aevalsrc expression for one channel, or null for no music. */
export function musicExpression(track: MusicTrack): string | null {
  if (track === 'NONE') return null;
  const m = CHORDS[track];
  const voices = Math.max(...m.chords.map((c) => c.length));
  const tones = Array.from({ length: voices }, (_, v) => voice(m.chords, v, m.period)).join('+');
  // Each chord swells in and out, which also hides the moment the notes change.
  const swell = `pow(sin(PI*mod(t,${m.period})/${m.period}),0.6)`;
  const pulse = m.pulse ? `*(0.35+0.65*pow(1-mod(t*${m.pulse},1),2))` : '';
  return `${m.gain}*(${tones})*${swell}${pulse}`;
}

/** Audio part of the filter graph: the music bed if one is chosen, otherwise silence, always exactly `duration` long. */
export function audioGraph(opts: { duration: number; music: MusicTrack }): string {
  const D = opts.duration;
  const expr = musicExpression(opts.music);
  if (!expr) return `anullsrc=r=44100:cl=stereo,atrim=0:${D},asetpts=PTS-STARTPTS[aout]`;
  return `aevalsrc=exprs='${expr}|${expr}':s=44100:d=${D},lowpass=f=2800,afade=t=in:d=0.8,afade=t=out:st=${(D - 1.2).toFixed(2)}:d=1.2[aout]`;
}
