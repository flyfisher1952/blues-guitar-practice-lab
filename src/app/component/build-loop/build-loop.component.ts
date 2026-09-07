import { Component, EventEmitter, Input, Output } from '@angular/core';
import { DrumService } from '../../service/drum.service';
import { Groove, GrooveStyle, KeyOption } from '../../model/models';

@Component({
  selector: 'app-build-loop',
  standalone: true,
  templateUrl: './build-loop.component.html'
})
export class BuildLoopComponent {
  @Input({ required: true }) selectedKey: KeyOption = {
    label: '',
    pitchClass: 0,
    chordNames: ['', '', ''],
    preferFlats: false
  };
  @Input({ required: true }) groove: Groove = {
    bars: [],
    hand: '',
    target: '',
    suggestion: '',
    description: ''
  };
  @Input({ required: true }) grooveStyle: GrooveStyle = 'shuffle';
  @Input() tempo = 72;

  @Output() grooveStyleChange = new EventEmitter<GrooveStyle>();
  @Output() tempoChange = new EventEmitter<number>();

  constructor(readonly drums: DrumService) {}

  chordFor(roman: string): string {
    const [one, four, five] = this.selectedKey.chordNames;
    const map: Record<string, string> = {
      I: `${one}7`,
      IV: `${four}7`,
      V: `${five}7`,
      II: this.noteAt(this.selectedKey.pitchClass + 2) + '7',
      VI: this.noteAt(this.selectedKey.pitchClass + 9) + '7'
    };
    return map[roman] ?? roman;
  }

  private noteAt(pitch: number): string {
    const sharp = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
    const flat = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
    return (this.selectedKey.preferFlats ? flat : sharp)[pitch % 12];
  }
}
