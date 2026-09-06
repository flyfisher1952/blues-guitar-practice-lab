export type PracticeTab = 'session' | 'triads' | 'grooves';
export type ChordMode = 'major' | 'minor' | 'seventh';
export type GrooveStyle = 'shuffle' | 'slow' | 'rock';

export interface KeyOption {
  label: string;
  pitchClass: number;
  chordNames: readonly [string, string, string];
  preferFlats: boolean;
}

export interface ChordShape {
  name: string;
  subtitle: string;
  notes: readonly [string, string, string];
  frets: readonly [number, number, number];
  fretWindow: readonly number[];
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
