import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ChordMode, TriadShape } from '../../model/models';

@Component({
  selector: 'app-triad-shapes',
  standalone: true,
  templateUrl: './triad-shapes.component.html'
})
export class TriadShapesComponent {
  @Input({ required: true }) selectedKey = '';
  @Input({ required: true }) chordMode: ChordMode = 'major';
  @Input({ required: true }) triadShapes: readonly TriadShape[] = [];

  @Output() chordModeChange = new EventEmitter<ChordMode>();
}
