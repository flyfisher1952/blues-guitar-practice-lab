import { Injectable } from '@angular/core';
import { ChordMode, KeyOption, TriadGroup, TriadShape } from '../model/models';

const OPEN_STRING_MIDI = [40, 45, 50, 55, 59, 64] as const;
const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const;
const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'] as const;
const STRING_SETS = [
  { label: 'Strings 6–5–4', indices: [0, 1, 2] as const },
  { label: 'Strings 5–4–3', indices: [1, 2, 3] as const },
  { label: 'Strings 4–3–2', indices: [2, 3, 4] as const },
  { label: 'Strings 3–2–1', indices: [3, 4, 5] as const }
] as const;
const INVERSION_NAMES = ['Root position', '1st inversion', '2nd inversion'] as const;

@Injectable({ providedIn: 'root' })
export class ChordService {
  createIivV(key: KeyOption, mode: ChordMode): TriadGroup[] {
    const roots = [key.pitchClass, (key.pitchClass + 5) % 12, (key.pitchClass + 7) % 12];
    const degrees = ['I', 'IV', 'V'] as const;
    return roots.map((root, index) => {
      const suffix = mode === 'major' ? '' : mode === 'minor' ? 'm' : '7';
      const chordName = `${key.chordNames[index]}${suffix}`;
      return {
        degree: degrees[index],
        name: chordName,
        sets: STRING_SETS.map(set => ({
          label: set.label,
          shapes: INVERSION_NAMES.map((inversion, inversionIndex) =>
            this.createTriadShape(root, chordName, key.preferFlats, mode, set.label, set.indices, inversion, inversionIndex)
          )
        }))
      };
    });
  }

  private createTriadShape(
    root: number,
    chordName: string,
    preferFlats: boolean,
    mode: ChordMode,
    stringSet: string,
    stringIndices: readonly [number, number, number],
    inversion: string,
    inversionIndex: number
  ): TriadShape {
    const intervals = mode === 'minor' ? [0, 3, 7] : mode === 'seventh' ? [0, 4, 10] : [0, 4, 7];
    const orderedIntervals = intervals.map((_, index) => intervals[(index + inversionIndex) % 3]);
    const chosen = this.chooseCompactVoicing(root, orderedIntervals, stringIndices);
    const frets: (number | null)[] = Array(6).fill(null);
    const notes: (string | null)[] = Array(6).fill(null);
    const rootNotes: boolean[] = Array(6).fill(false);

    stringIndices.forEach((stringIndex, position) => {
      const fret = chosen[position];
      const pitch = OPEN_STRING_MIDI[stringIndex] + fret;
      frets[stringIndex] = fret;
      notes[stringIndex] = this.noteName(pitch, preferFlats);
      rootNotes[stringIndex] = ((pitch - root) % 12 + 12) % 12 === 0;
    });

    return {
      id: `${chordName}-${stringSet}-${inversion}`,
      name: chordName,
      subtitle: mode === 'seventh' ? `${inversion} · root, 3rd, ♭7` : inversion,
      stringSet,
      notes,
      frets,
      roots: rootNotes,
      usedFrets: [...new Set(chosen)].sort((a, b) => a - b)
    };
  }

  private chooseCompactVoicing(
    root: number,
    orderedIntervals: readonly number[],
    stringIndices: readonly [number, number, number]
  ): [number, number, number] {
    const candidates = stringIndices.map((stringIndex, position) => {
      const target = (root + orderedIntervals[position]) % 12;
      return Array.from({ length: 16 }, (_, fret) => fret)
        .filter(fret => (OPEN_STRING_MIDI[stringIndex] + fret) % 12 === target);
    });
    let best: [number, number, number] = [0, 0, 0];
    let bestScore = Number.POSITIVE_INFINITY;
    for (const first of candidates[0]) {
      for (const second of candidates[1]) {
        for (const third of candidates[2]) {
          const pitches = [
            OPEN_STRING_MIDI[stringIndices[0]] + first,
            OPEN_STRING_MIDI[stringIndices[1]] + second,
            OPEN_STRING_MIDI[stringIndices[2]] + third
          ];
          if (!(pitches[0] < pitches[1] && pitches[1] < pitches[2])) continue;
          const shape = [first, second, third] as [number, number, number];
          const span = Math.max(...shape) - Math.min(...shape);
          const score = span * 20 + Math.max(...shape) + shape.reduce((sum, fret) => sum + fret, 0) / 10;
          if (score < bestScore) {
            bestScore = score;
            best = shape;
          }
        }
      }
    }
    return best;
  }

  private noteName(pitch: number, preferFlats: boolean): string {
    const names = preferFlats ? FLAT_NAMES : SHARP_NAMES;
    return names[((pitch % 12) + 12) % 12];
  }
}
