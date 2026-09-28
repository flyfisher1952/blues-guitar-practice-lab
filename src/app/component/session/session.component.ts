import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { PracticeBlock } from '../../model/models';

interface PracticeSegment {
  id: string;
  name: string;
  description: string;
  done: boolean;
  plannedMinutes: number;
  elapsedSeconds: number;
}

interface PracticeDay {
  date: string;
  segments: Record<string, number>;
}

interface SavedPracticeSession {
  id: string;
  name: string;
  totalMinutes: number;
  segments: PracticeSegment[];
}

@Component({
  selector: 'app-session',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './session.component.html'
})
export class SessionComponent implements OnInit, OnDestroy {
  @Input({ required: true }) blocks: readonly PracticeBlock[] = [];

  totalMinutes = 20;
  practiceName = 'My Practice Session';
  practiceNameEditing = false;
  segments: PracticeSegment[] = [];
  savedSessions: SavedPracticeSession[] = [];
  history: PracticeDay[] = [];
  monitorOpen = false;
  addSegmentOpen = false;
  newSegmentName = '';
  newSegmentHint = '';
  newSegmentMinutes = 5;
  newSegmentPosition = 1;
  draggedSegmentId?: string;
  activeSegmentId?: string;
  timerRunning = false;
  private timer?: number;
  private readonly planKey = 'practiceSessionPlan';
  private readonly historyKey = 'practiceSessionHistory';
  private readonly savedSessionsKey = 'savedPracticeSessions';
  activeSavedSessionId?: string;

  ngOnInit(): void {
    this.restoreSavedSessions();
    this.restorePlan();
    this.restoreHistory();
  }

  ngOnDestroy(): void {
    this.stopClock();
  }

  get plannedMinutes(): number {
    return this.segments.reduce((sum, segment) => sum + segment.plannedMinutes, 0);
  }

  get remainingMinutes(): number {
    return this.totalMinutes - this.plannedMinutes;
  }

  get sessionElapsedSeconds(): number {
    return this.segments.reduce((sum, segment) => sum + segment.elapsedSeconds, 0);
  }

  get allTimeSeconds(): number {
    return this.history.reduce(
      (total, day) => total + Object.values(day.segments).reduce((sum, seconds) => sum + seconds, 0),
      0
    );
  }

  get activityTotals(): Array<{ name: string; seconds: number }> {
    const totals = new Map<string, number>();
    for (const day of this.history) {
      for (const [name, seconds] of Object.entries(day.segments)) {
        totals.set(name, (totals.get(name) ?? 0) + seconds);
      }
    }
    return Array.from(totals, ([name, seconds]) => ({ name, seconds }))
      .sort((left, right) => right.seconds - left.seconds);
  }

  get recentHistory(): PracticeDay[] {
    return [...this.history].sort((left, right) => right.date.localeCompare(left.date)).slice(0, 7);
  }

  setTotalMinutes(value: number): void {
    this.totalMinutes = this.clamp(value, 1, 480, 20);
    this.persistPlan();
  }

  updateSegmentName(segment: PracticeSegment, value: string): void {
    segment.name = value.trim() || 'Practice segment';
    this.persistPlan();
  }

  updateSegmentMinutes(segment: PracticeSegment, value: number): void {
    segment.plannedMinutes = this.clamp(value, 1, 240, 5);
    this.syncTotalDuration();
    this.persistPlan();
  }

  toggleDone(segment: PracticeSegment, done: boolean): void {
    segment.done = done;
    this.persistPlan();
  }

  editPracticeName(input: HTMLInputElement): void {
    this.practiceNameEditing = true;
    window.setTimeout(() => {
      input.focus();
      input.select();
    });
  }

  finishPracticeNameEdit(value: string): void {
    this.practiceName = value.trim() || 'My Practice Session';
    this.practiceNameEditing = false;
    this.persistPlan();
  }

  newPracticeSession(): void {
    this.stopClock();
    this.activeSavedSessionId = undefined;
    this.practiceName = 'New Session';
    this.totalMinutes = 5;
    this.segments = [{
      id: crypto.randomUUID?.() ?? `segment-${Date.now()}`,
      name: 'Warm up',
      description: '',
      done: false,
      plannedMinutes: 5,
      elapsedSeconds: 0
    }];
    this.persistPlan();
  }

  savePracticeSession(): void {
    const saved: SavedPracticeSession = {
      id: this.activeSavedSessionId ?? (crypto.randomUUID?.() ?? `practice-${Date.now()}`),
      name: this.practiceName.trim() || 'My Practice Session',
      totalMinutes: this.totalMinutes,
      segments: this.copySegmentsForStorage(this.segments)
    };
    const existingIndex = this.savedSessions.findIndex(session => session.id === saved.id);
    if (existingIndex >= 0) {
      this.savedSessions = this.savedSessions.map(session => session.id === saved.id ? saved : session);
    } else {
      this.savedSessions = [...this.savedSessions, saved];
    }
    this.activeSavedSessionId = saved.id;
    this.practiceName = saved.name;
    this.persistSavedSessions();
    this.persistPlan();
  }

  loadPracticeSession(saved: SavedPracticeSession): void {
    this.stopClock();
    this.activeSavedSessionId = saved.id;
    this.practiceName = saved.name;
    this.totalMinutes = this.clamp(saved.totalMinutes, 1, 480, 20);
    this.segments = saved.segments.map(segment => ({
      ...segment,
      done: false,
      elapsedSeconds: 0,
      plannedMinutes: this.clamp(segment.plannedMinutes, 1, 240, 5)
    }));
    this.syncTotalDuration();
    this.persistPlan();
  }

  deletePracticeSession(saved: SavedPracticeSession): void {
    if (!window.confirm(`Delete the saved practice session "${saved.name}"? This cannot be undone.`)) return;
    this.savedSessions = this.savedSessions.filter(session => session.id !== saved.id);
    if (this.activeSavedSessionId === saved.id) this.activeSavedSessionId = undefined;
    this.persistSavedSessions();
    this.persistPlan();
  }

  openAddSegment(): void {
    this.newSegmentName = '';
    this.newSegmentHint = '';
    this.newSegmentMinutes = 5;
    this.newSegmentPosition = this.segments.length + 1;
    this.addSegmentOpen = true;
  }

  closeAddSegment(): void {
    this.addSegmentOpen = false;
  }

  addSegment(): void {
    const name = this.newSegmentName.trim();
    if (!name) return;
    const segment: PracticeSegment = {
      id: crypto.randomUUID?.() ?? `segment-${Date.now()}`,
      name,
      description: this.newSegmentHint.trim(),
      done: false,
      plannedMinutes: this.clamp(this.newSegmentMinutes, 1, 240, 5),
      elapsedSeconds: 0
    };
    const position = this.clamp(this.newSegmentPosition, 1, this.segments.length + 1, this.segments.length + 1);
    this.segments.splice(position - 1, 0, segment);
    this.syncTotalDuration();
    this.persistPlan();
    this.addSegmentOpen = false;
  }

  removeSegment(segment: PracticeSegment): void {
    if (this.activeSegmentId === segment.id) this.stopSegment(segment);
    this.segments = this.segments.filter(item => item.id !== segment.id);
    this.syncTotalDuration();
    this.persistPlan();
  }

  beginSegmentDrag(event: DragEvent, segment: PracticeSegment): void {
    this.draggedSegmentId = segment.id;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', segment.id);
    }
  }

  allowSegmentDrop(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  dropSegment(event: DragEvent, target: PracticeSegment): void {
    event.preventDefault();
    const sourceId = this.draggedSegmentId ?? event.dataTransfer?.getData('text/plain');
    const fromIndex = this.segments.findIndex(segment => segment.id === sourceId);
    const toIndex = this.segments.findIndex(segment => segment.id === target.id);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
      this.draggedSegmentId = undefined;
      return;
    }
    const [moved] = this.segments.splice(fromIndex, 1);
    this.segments.splice(toIndex, 0, moved);
    this.draggedSegmentId = undefined;
    this.persistPlan();
  }

  endSegmentDrag(): void {
    this.draggedSegmentId = undefined;
  }

  openMonitor(): void {
    this.monitorOpen = true;
  }

  closeMonitor(): void {
    this.monitorOpen = false;
  }

  startSegment(segment: PracticeSegment): void {
    this.stopClock(true);
    this.activeSegmentId = segment.id;
    this.timerRunning = true;
    this.timer = window.setInterval(() => {
      segment.elapsedSeconds += 1;
      this.recordSecond(segment.name);
    }, 1000);
  }

  pauseSegment(segment: PracticeSegment): void {
    if (this.activeSegmentId !== segment.id || !this.timerRunning) return;
    this.stopClock(false);
  }

  stopSegment(segment?: PracticeSegment): void {
    if (segment && this.activeSegmentId !== segment.id) return;
    this.stopClock(true);
  }

  resetSegment(segment: PracticeSegment): void {
    if (this.activeSegmentId === segment.id) this.stopClock(true);
    segment.elapsedSeconds = 0;
  }

  resetSession(): void {
    this.stopClock();
    this.segments.forEach(segment => {
      segment.elapsedSeconds = 0;
      segment.done = false;
    });
    this.persistPlan();
  }

  restoreDefaults(): void {
    const confirmed = window.confirm(
      'Restore the default 20-minute session plan? Current timers and checkmarks will reset. Practice history will be kept.'
    );
    if (!confirmed) return;
    this.stopClock();
    localStorage.removeItem(this.planKey);
    this.activeSavedSessionId = undefined;
    this.practiceName = 'My Practice Session';
    this.loadDefaultSegments();
    this.persistPlan();
  }

  clearHistory(): void {
    if (!window.confirm('Clear all recorded practice history? This cannot be undone.')) return;
    this.history = [];
    localStorage.removeItem(this.historyKey);
  }

  formatTime(seconds: number): string {
    const safe = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const remaining = safe % 60;
    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
      : `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
  }

  formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds} sec`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);
    return hours ? `${hours} hr ${minutes} min` : `${minutes} min`;
  }

  dayTotal(day: PracticeDay): number {
    return Object.values(day.segments).reduce((sum, seconds) => sum + seconds, 0);
  }

  private stopClock(clearActive = true): void {
    this.timerRunning = false;
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = undefined;
    if (clearActive) this.activeSegmentId = undefined;
  }

  private syncTotalDuration(): void {
    this.totalMinutes = Math.max(1, this.plannedMinutes);
  }

  private recordSecond(segmentName: string): void {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    let day = this.history.find(entry => entry.date === date);
    if (!day) {
      day = { date, segments: {} };
      this.history = [...this.history, day];
    }
    day.segments[segmentName] = (day.segments[segmentName] ?? 0) + 1;
    localStorage.setItem(this.historyKey, JSON.stringify(this.history));
  }

  private restorePlan(): void {
    try {
      const saved = JSON.parse(localStorage.getItem(this.planKey) ?? 'null') as {
        totalMinutes?: number;
        practiceName?: string;
        activeSavedSessionId?: string;
        segments?: PracticeSegment[];
      } | null;
      if (saved?.segments?.length) {
        this.practiceName = saved.practiceName?.trim() || 'My Practice Session';
        this.activeSavedSessionId = saved.activeSavedSessionId;
        this.totalMinutes = this.clamp(saved.totalMinutes ?? 20, 1, 480, 20);
        this.segments = saved.segments.map(segment => ({
          ...segment,
          done: Boolean(segment.done),
          elapsedSeconds: 0,
          plannedMinutes: this.clamp(segment.plannedMinutes, 1, 240, 5)
        }));
        this.syncTotalDuration();
        return;
      }
    } catch {
      localStorage.removeItem(this.planKey);
    }

    this.loadDefaultSegments();
  }

  private restoreHistory(): void {
    try {
      const saved = JSON.parse(localStorage.getItem(this.historyKey) ?? '[]');
      this.history = Array.isArray(saved) ? saved : [];
    } catch {
      this.history = [];
      localStorage.removeItem(this.historyKey);
    }
  }

  private restoreSavedSessions(): void {
    try {
      const saved = JSON.parse(localStorage.getItem(this.savedSessionsKey) ?? '[]') as SavedPracticeSession[];
      this.savedSessions = Array.isArray(saved)
        ? saved.filter(session => session?.id && session?.name && Array.isArray(session.segments))
        : [];
    } catch {
      this.savedSessions = [];
      localStorage.removeItem(this.savedSessionsKey);
    }
  }

  private loadDefaultSegments(): void {
    this.segments = this.blocks.map((block, index) => ({
      id: `default-${index}`,
      name: block.title,
      description: block.description,
      done: false,
      plannedMinutes: 5,
      elapsedSeconds: 0
    }));
    this.totalMinutes = 20;
  }

  private persistPlan(): void {
    const segments = this.copySegmentsForStorage(this.segments);
    localStorage.setItem(this.planKey, JSON.stringify({
      totalMinutes: this.totalMinutes,
      practiceName: this.practiceName,
      activeSavedSessionId: this.activeSavedSessionId,
      segments
    }));
  }

  private persistSavedSessions(): void {
    localStorage.setItem(this.savedSessionsKey, JSON.stringify(this.savedSessions));
  }

  private copySegmentsForStorage(segments: PracticeSegment[]): PracticeSegment[] {
    return segments.map(segment => ({ ...segment, done: false, elapsedSeconds: 0 }));
  }

  private clamp(value: number, minimum: number, maximum: number, fallback: number): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.round(Math.max(minimum, Math.min(maximum, numeric))) : fallback;
  }
}
