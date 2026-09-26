import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { PracticeBlock } from '../../model/models';

interface PracticeSegment {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  plannedMinutes: number;
  elapsedSeconds: number;
}

interface PracticeDay {
  date: string;
  segments: Record<string, number>;
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
  segments: PracticeSegment[] = [];
  history: PracticeDay[] = [];
  monitorOpen = false;
  addSegmentOpen = false;
  newSegmentName = '';
  newSegmentHint = '';
  newSegmentMinutes = 5;
  activeSegmentId?: string;
  timerRunning = false;
  private timer?: number;
  private readonly planKey = 'practiceSessionPlan';
  private readonly historyKey = 'practiceSessionHistory';

  ngOnInit(): void {
    this.restorePlan();
    this.restoreHistory();
  }

  ngOnDestroy(): void {
    this.stopClock();
  }

  get enabledSegments(): PracticeSegment[] {
    return this.segments.filter(segment => segment.enabled);
  }

  get plannedMinutes(): number {
    return this.enabledSegments.reduce((sum, segment) => sum + segment.plannedMinutes, 0);
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

  toggleSegment(segment: PracticeSegment, enabled: boolean): void {
    segment.enabled = enabled;
    if (!enabled && this.activeSegmentId === segment.id) this.stopSegment(segment);
    this.syncTotalDuration();
    this.persistPlan();
  }

  openAddSegment(): void {
    this.newSegmentName = '';
    this.newSegmentHint = '';
    this.newSegmentMinutes = 5;
    this.addSegmentOpen = true;
  }

  closeAddSegment(): void {
    this.addSegmentOpen = false;
  }

  addSegment(): void {
    const name = this.newSegmentName.trim();
    if (!name) return;
    this.segments.push({
      id: crypto.randomUUID?.() ?? `segment-${Date.now()}`,
      name,
      description: this.newSegmentHint.trim(),
      enabled: true,
      plannedMinutes: this.clamp(this.newSegmentMinutes, 1, 240, 5),
      elapsedSeconds: 0
    });
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

  openMonitor(): void {
    this.monitorOpen = true;
  }

  closeMonitor(): void {
    this.monitorOpen = false;
  }

  startSegment(segment: PracticeSegment): void {
    if (!segment.enabled) return;
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
    this.segments.forEach(segment => segment.elapsedSeconds = 0);
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
        segments?: PracticeSegment[];
      } | null;
      if (saved?.segments?.length) {
        this.totalMinutes = this.clamp(saved.totalMinutes ?? 20, 1, 480, 20);
        this.segments = saved.segments.map(segment => ({
          ...segment,
          elapsedSeconds: 0,
          plannedMinutes: this.clamp(segment.plannedMinutes, 1, 240, 5)
        }));
        this.syncTotalDuration();
        return;
      }
    } catch {
      localStorage.removeItem(this.planKey);
    }

    this.segments = this.blocks.map((block, index) => ({
      id: `default-${index}`,
      name: block.title,
      description: block.description,
      enabled: true,
      plannedMinutes: 5,
      elapsedSeconds: 0
    }));
    this.syncTotalDuration();
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

  private persistPlan(): void {
    const segments = this.segments.map(segment => ({ ...segment, elapsedSeconds: 0 }));
    localStorage.setItem(this.planKey, JSON.stringify({ totalMinutes: this.totalMinutes, segments }));
  }

  private clamp(value: number, minimum: number, maximum: number, fallback: number): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.round(Math.max(minimum, Math.min(maximum, numeric))) : fallback;
  }
}
