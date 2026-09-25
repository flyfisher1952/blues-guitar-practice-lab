export type PracticeTab = 'session' | 'triads' | 'grooves';
export type ChordMode = 'major' | 'minor' | 'seventh';
export type GrooveStyle = 'shuffle' | 'slow' | 'rock';

export interface KeyOption {
  label: string;
  pitchClass: number;
  chordNames: readonly [string, string, string];
  preferFlats: boolean;
}

export interface TriadShape {
  id: string;
  name: string;
  subtitle: string;
  stringSet: string;
  notes: readonly (string | null)[];
  frets: readonly (number | null)[];
  roots: readonly boolean[];
  usedFrets: readonly number[];
}

export interface TriadStringSet {
  label: string;
  shapes: readonly TriadShape[];
}

export interface TriadGroup {
  degree: 'I' | 'IV' | 'V';
  name: string;
  sets: readonly TriadStringSet[];
}

export interface PracticeBlock {
  title: string;
  description: string;
}

export interface Groove {
  bars: readonly string[];
  hand: string;
  target: string;
  suggestion: string;
  description: string;
}
