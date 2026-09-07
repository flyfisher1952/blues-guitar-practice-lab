import { Injectable, signal } from '@angular/core';
import { GrooveStyle } from '../model/models';

@Injectable({ providedIn: 'root' })
export class DrumService {
  readonly playing = signal(false);
  readonly step = signal(0);
  readonly currentBar = signal(0);

  private context?: AudioContext;
  private noise?: AudioBuffer;
  private timer?: number;
  private nextTime = 0;
  private tempo = 72;
  private style: GrooveStyle = 'shuffle';

  setTempo(tempo: number): void {
    this.tempo = tempo;
  }

  setStyle(style: GrooveStyle): void {
    this.pause();
    this.style = style;
    this.rewind();
  }

  async play(): Promise<void> {
    const context = this.getContext();
    if (context.state === 'suspended') await context.resume();
    if (this.playing()) return;
    this.playing.set(true);
    this.nextTime = context.currentTime + 0.05;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  pause(): void {
    this.playing.set(false);
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = undefined;
  }

  stop(): void {
    this.pause();
    this.rewind();
  }

  rewind(): void {
    this.step.set(0);
    this.currentBar.set(0);
  }

  private schedule(): void {
    const context = this.getContext();
    while (this.nextTime < context.currentTime + 0.1) {
      const step = this.step();
      this.scheduleStep(step, this.nextTime);
      this.nextTime += this.stepLength(step);
      const next = (step + 1) % 96;
      this.step.set(next);
      this.currentBar.set(Math.floor(next / 8) % 12);
    }
  }

  private stepLength(step: number): number {
    const beat = 60 / this.tempo;
    if (this.style === 'rock') return beat / 2;
    return step % 2 === 0 ? beat * 2 / 3 : beat / 3;
  }

  private scheduleStep(step: number, time: number): void {
    const eighth = step % 8;
    const beat = Math.floor(eighth / 2);
    const offbeat = eighth % 2 === 1;
    this.hat(time, !offbeat);
    if (this.style === 'shuffle') {
      if (!offbeat && (beat === 0 || beat === 2)) this.kick(time);
      if (!offbeat && (beat === 1 || beat === 3)) this.snare(time);
    } else if (this.style === 'slow') {
      if (!offbeat && beat === 0) this.kick(time);
      if (!offbeat && beat === 2) this.snare(time);
    } else {
      if (!offbeat && (beat === 0 || beat === 2)) this.kick(time);
      if (!offbeat && (beat === 1 || beat === 3)) this.snare(time);
      if (eighth === 5) this.kick(time);
    }
  }

  private getContext(): AudioContext {
    if (this.context) return this.context;
    this.context = new AudioContext();
    const length = Math.floor(this.context.sampleRate * 0.25);
    this.noise = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let index = 0; index < length; index++) data[index] = Math.random() * 2 - 1;
    return this.context;
  }

  private kick(time: number): void {
    const context = this.getContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.setValueAtTime(145, time);
    oscillator.frequency.exponentialRampToValueAtTime(48, time + 0.12);
    gain.gain.setValueAtTime(0.7, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(time);
    oscillator.stop(time + 0.2);
  }

  private snare(time: number): void {
    this.noiseHit(time, 0.34, 0.13, 900);
  }

  private hat(time: number, accent: boolean): void {
    this.noiseHit(time, accent ? 0.15 : 0.09, 0.035, 5200);
  }

  private noiseHit(time: number, volume: number, duration: number, highpass: number): void {
    const context = this.getContext();
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = this.noise!;
    filter.type = 'highpass';
    filter.frequency.value = highpass;
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    source.connect(filter).connect(gain).connect(context.destination);
    source.start(time);
    source.stop(time + duration);
  }
}
