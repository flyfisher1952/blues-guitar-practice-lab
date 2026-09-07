import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { PracticeBlock } from '../../model/models';

@Component({
  selector: 'app-session',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './session.component.html'
})
export class SessionComponent {
  @Input({ required: true }) blocks: readonly PracticeBlock[] = [];
  @Input({ required: true }) completed: readonly boolean[] = [];
  @Input({ required: true }) timerText = '';
  @Input() timerRunning = false;
  @Input() seconds = 300;
  @Input() completedCount = 0;

  @Output() blockToggled = new EventEmitter<number>();
  @Output() progressReset = new EventEmitter<void>();
  @Output() timerToggled = new EventEmitter<void>();
  @Output() timerReset = new EventEmitter<void>();
}
