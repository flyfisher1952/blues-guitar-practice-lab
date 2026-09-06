import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChordService } from './chord.service';
import { DrumService } from './drum.service';
import { ChordMode, Groove, GrooveStyle, KeyOption, PracticeBlock, PracticeTab } from './models';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  private readonly chords = inject(ChordService);
  readonly drums = inject(DrumService);

  readonly tabs: readonly { id: PracticeTab; label: string }[] = [
    { id: 'session', label: 'Session' },
    { id: 'triads', label: 'Chord Shapes' },
    { id: 'grooves', label: 'Build the Loop' }
  ];

  readonly keys: readonly KeyOption[] = [
    { label: 'C', pitchClass: 0, chordNames: ['C', 'F', 'G'], preferFlats: false },
    { label: 'D♭', pitchClass: 1, chordNames: ['D♭', 'G♭', 'A♭'], preferFlats: true },
    { label: 'D', pitchClass: 2, chordNames: ['D', 'G', 'A'], preferFlats: false },
    { label: 'E♭', pitchClass: 3, chordNames: ['E♭', 'A♭', 'B♭'], preferFlats: true },
    { label: 'E', pitchClass: 4, chordNames: ['E', 'A', 'B'], preferFlats: false },
    { label: 'F', pitchClass: 5, chordNames: ['F', 'B♭', 'C'], preferFlats: true },
    { label: 'F♯', pitchClass: 6, chordNames: ['F♯', 'B', 'C♯'], preferFlats: false },
    { label: 'G', pitchClass: 7, chordNames: ['G', 'C', 'D'], preferFlats: false },
    { label: 'A♭', pitchClass: 8, chordNames: ['A♭', 'D♭', 'E♭'], preferFlats: true },
    { label: 'A', pitchClass: 9, chordNames: ['A', 'D', 'E'], preferFlats: false },
    { label: 'B♭', pitchClass: 10, chordNames: ['B♭', 'E♭', 'F'], preferFlats: true },
    { label: 'B', pitchClass: 11, chordNames: ['B', 'E', 'F♯'], preferFlats: false }
  ];

  readonly blocks: readonly PracticeBlock[] = [
    { title: 'Warm up', description: 'Chromatic movement, light touch, clean fretting.' },
    { title: 'Chord path', description: 'Connect I–IV–V on strings 1–2–3.' },
    { title: 'Twelve bars', description: 'Build one steady loop; leave space.' },
    { title: 'Speak', description: 'Improvise short phrases and answer yourself.' }
  ];

  readonly grooves: Record<GrooveStyle, Groove> = {
    shuffle: {
      bars: ['I', 'I', 'I', 'I', 'IV', 'IV', 'I', 'I', 'V', 'IV', 'I', 'V'],
      hand: 'Loose down-up swing',
      target: 'Behind-the-beat pocket',
      suggestion: 'Bass notes first, chords on the backbeat',
      description: 'Swung hi-hat, kick on 1 and 3, snare on 2 and 4'
    },
    slow: {
      bars: ['I', 'IV', 'I', 'I', 'IV', 'IV', 'I', 'VI', 'II', 'V', 'I', 'V'],
      hand: 'Wide triplets, gentle attack',
      target: 'Long notes with vocal vibrato',
      suggestion: 'Answer each chord with one short phrase',
      description: 'Sparse triplet feel, kick on 1, snare on 3'
    },
    rock: {
      bars: ['I', 'I', 'IV', 'I', 'IV', 'IV', 'I', 'I', 'V', 'IV', 'I', 'V'],
      hand: 'Straight eighths, firm accents',
      target: 'Tight riff and controlled gain',
      suggestion: 'Double-stops between the vocal spaces',
      description: 'Straight eighth-note hi-hat with a firm backbeat'
    }
  };

  readonly activeTab = signal<PracticeTab>('session');
  readonly selectedKey = signal(this.savedKey());
  readonly chordMode = signal<ChordMode>(this.savedChordMode());
  readonly grooveStyle = signal<GrooveStyle>('shuffle');
  readonly tempo = signal(72);
  readonly completed = signal<boolean[]>(this.savedProgress());
  readonly seconds = signal(300);
  readonly timerRunning = signal(false);
  private timer?: number;

  readonly key = computed(() => this.keys.find(key => key.label === this.selectedKey()) ?? this.keys[7]);
  readonly shapes = computed(() => this.chords.createIivV(this.key(), this.chordMode()));
  readonly groove = computed(() => this.grooves[this.grooveStyle()]);
  readonly completedCount = computed(() => this.completed().filter(Boolean).length);
  readonly timerText = computed(() => {
    const seconds = this.seconds();
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  });

  setTab(tab: PracticeTab): void {
    this.activeTab.set(tab);
  }

  changeKey(label: string): void {
    this.selectedKey.set(label);
    localStorage.setItem('labKey', label);
  }

  setChordMode(mode: ChordMode): void {
    this.chordMode.set(mode);
    localStorage.setItem('labChordMode', mode);
  }

  setGroove(style: GrooveStyle): void {
    this.grooveStyle.set(style);
    this.drums.setStyle(style);
  }

  changeTempo(value: number): void {
    this.tempo.set(value);
    this.drums.setTempo(value);
  }

  toggleBlock(index: number): void {
    const next = [...this.completed()];
    next[index] = !next[index];
    this.completed.set(next);
    localStorage.setItem('labDone', JSON.stringify(next));
  }

  resetProgress(): void {
    this.completed.set([false, false, false, false]);
    localStorage.setItem('labDone', JSON.stringify(this.completed()));
  }

  toggleTimer(): void {
    if (this.timerRunning()) {
      this.pauseTimer();
      return;
    }
    this.timerRunning.set(true);
    this.timer = window.setInterval(() => {
      const next = this.seconds() - 1;
      if (next <= 0) {
        this.resetTimer();
      } else {
        this.seconds.set(next);
      }
    }, 1000);
  }

  resetTimer(): void {
    this.pauseTimer();
    this.seconds.set(300);
  }

  chordFor(roman: string): string {
    const [one, four, five] = this.key().chordNames;
    const map: Record<string, string> = {
      I: `${one}7`,
      IV: `${four}7`,
      V: `${five}7`,
      II: this.noteAt(this.key().pitchClass + 2) + '7',
      VI: this.noteAt(this.key().pitchClass + 9) + '7'
    };
    return map[roman] ?? roman;
  }

  trackIndex(index: number): number {
    return index;
  }

  private pauseTimer(): void {
    this.timerRunning.set(false);
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = undefined;
  }

  private noteAt(pitch: number): string {
    const sharp = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
    const flat = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
    return (this.key().preferFlats ? flat : sharp)[pitch % 12];
  }

  private savedKey(): string {
    const saved = localStorage.getItem('labKey') ?? 'G';
    return this.keys.some(key => key.label === saved) ? saved : 'G';
  }

  private savedChordMode(): ChordMode {
    const saved = localStorage.getItem('labChordMode');
    return saved === 'minor' || saved === 'seventh' ? saved : 'major';
  }

  private savedProgress(): boolean[] {
    try {
      const saved = JSON.parse(localStorage.getItem('labDone') ?? '[false,false,false,false]');
      return Array.isArray(saved) && saved.length === 4 ? saved.map(Boolean) : [false, false, false, false];
    } catch {
      return [false, false, false, false];
    }
  }
}
