import { Injectable } from '@angular/core';
import { ChordMode, KeyOption, TriadShape } from '../model/models';

const OPEN_STRING_PITCHES = [7, 11, 4] as const; // G, B, high E
const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const;
const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'] as const;

const BASE_FRETS: Record<ChordMode, readonly [number, number, number]> = {
  major: [5, 5, 3],
  minor: [5, 4, 3],
  seventh: [3, 1, 0]
};

@Injectable({ providedIn: 'root' })
export class ChordService {
  createIivV(key: KeyOption, mode: ChordMode): TriadShape[] {
    const roots = [key.pitchClass, (key.pitchClass + 5) % 12, (key.pitchClass + 7) % 12];
    return roots.map((root, index) => this.createTriadShape(root, key.chordNames[index], key.preferFlats, mode));
  }

  private createTriadShape(root: number, rootName: string, preferFlats: boolean, mode: ChordMode): TriadShape {
    const frets = BASE_FRETS[mode].map(fret => fret + root) as unknown as [number, number, number];
    const notes = frets.map((fret, index) => this.noteName(OPEN_STRING_PITCHES[index] + fret, preferFlats)) as unknown as [string, string, string];
    const minimum = Math.max(0, Math.min(...frets) - 1);
    const fretWindow = Array.from({ length: 6 }, (_, index) => minimum + index);
    const suffix = mode === 'major' ? '' : mode === 'minor' ? 'm' : '7';
    const subtitle = mode === 'seventh' ? '3-note dominant 7 · omits fifth' : 'Root-position triad';
    return { name: `${rootName}${suffix}`, subtitle, notes, frets, fretWindow };
  }

  private noteName(pitch: number, preferFlats: boolean): string {
    const names = preferFlats ? FLAT_NAMES : SHARP_NAMES;
    return names[((pitch % 12) + 12) % 12];
  }
}
