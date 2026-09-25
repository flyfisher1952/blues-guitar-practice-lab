import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { ChordMode, TriadGroup, TriadShape } from '../../model/models';

@Component({
  selector: 'app-triad-shapes',
  standalone: true,
  templateUrl: './triad-shapes.component.html'
})
export class TriadShapesComponent {
  @ViewChild('editor') private editor?: ElementRef<HTMLDivElement>;
  @Input({ required: true }) selectedKey = '';
  @Input({ required: true }) chordMode: ChordMode = 'major';
  @Input({ required: true }) triadShapes: readonly TriadGroup[] = [];
  @Output() chordModeChange = new EventEmitter<ChordMode>();

  selectedImage?: HTMLElement;
  selectedImageWidth = 320;
  readonly stringNumbers = [6, 5, 4, 3, 2, 1];

  stringX(index: number): number { return 46 + index * 32; }
  fretY(index: number): number { return 58 + index * 38; }
  diagramHeight(shape: TriadShape): number { return 78 + shape.usedFrets.length * 38; }
  diagramViewBox(shape: TriadShape): string { return `0 0 246 ${this.diagramHeight(shape)}`; }

  beginTriadDrag(event: DragEvent, shape: TriadShape): void {
    if (!event.dataTransfer) return;
    const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(this.createSvg(shape))}`;
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/x-triad-image', source);
    event.dataTransfer.setData('text/plain', `${shape.name} — ${shape.stringSet}, ${shape.subtitle}`);
  }

  allowDrop(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  dropIntoEditor(event: DragEvent): void {
    event.preventDefault();
    this.placeCaret(event.clientX, event.clientY);
    const triadSource = event.dataTransfer?.getData('application/x-triad-image');
    if (triadSource) {
      this.insertImage(triadSource, 'Dragged triad diagram');
      return;
    }
    const imageFile = Array.from(event.dataTransfer?.files ?? []).find(file => file.type.startsWith('image/'));
    if (!imageFile || imageFile.size > 8 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => this.insertImage(String(reader.result), imageFile.name);
    reader.readAsDataURL(imageFile);
  }

  format(command: string, value?: string): void {
    this.editor?.nativeElement.focus();
    document.execCommand(command, false, value);
  }

  selectEditorImage(event: MouseEvent): void {
    const wrapper = (event.target as HTMLElement).closest('.resizable-image') as HTMLElement | null;
    this.selectedImage = wrapper ?? undefined;
    if (wrapper) this.selectedImageWidth = Math.round(wrapper.getBoundingClientRect().width);
  }

  resizeSelected(event: Event): void {
    if (!this.selectedImage) return;
    this.selectedImageWidth = Number((event.target as HTMLInputElement).value);
    this.selectedImage.style.width = `${this.selectedImageWidth}px`;
  }

  clearEditor(): void {
    if (this.editor) this.editor.nativeElement.innerHTML = '<p><br></p>';
    this.selectedImage = undefined;
  }

  private insertImage(source: string, alt: string): void {
    const safeAlt = alt.replace(/[&<>"']/g, '');
    this.insertHtml(`<span class="resizable-image" contenteditable="false" style="width:320px"><img src="${source}" alt="${safeAlt}"></span><p><br></p>`);
  }

  private insertHtml(html: string): void {
    const selection = window.getSelection();
    if (!selection?.rangeCount) {
      this.editor?.nativeElement.insertAdjacentHTML('beforeend', html);
      return;
    }
    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(range.createContextualFragment(html));
    selection.collapseToEnd();
  }

  private placeCaret(x: number, y: number): void {
    const doc = document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null };
    const range = doc.caretRangeFromPoint?.(x, y);
    if (!range) {
      this.editor?.nativeElement.focus();
      return;
    }
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  private createSvg(shape: TriadShape): string {
    const height = this.diagramHeight(shape);
    const strings = this.stringNumbers.map((number, index) =>
      `<text x="${this.stringX(index)}" y="22" text-anchor="middle" fill="#d8cec2" font-size="13" font-family="Arial">${number}</text><line x1="${this.stringX(index)}" y1="32" x2="${this.stringX(index)}" y2="${height - 16}" stroke="#71675e" stroke-width="${index === 0 ? 2.2 : 1.2}"/>`
    ).join('');
    const rows = shape.usedFrets.map((fret, fretIndex) => {
      const y = this.fretY(fretIndex);
      const notes = shape.frets.map((shapeFret, stringIndex) => {
        if (shapeFret !== fret) return '';
        const isRoot = shape.roots[stringIndex];
        return `<circle cx="${this.stringX(stringIndex)}" cy="${y}" r="13" fill="${isRoot ? '#17130f' : '#df8e2f'}" stroke="#df8e2f" stroke-width="${isRoot ? 3 : 1}"/><text x="${this.stringX(stringIndex)}" y="${y + 4}" text-anchor="middle" fill="${isRoot ? '#df8e2f' : '#17130f'}" font-size="11" font-weight="700" font-family="Arial">${shape.notes[stringIndex] ?? ''}</text>`;
      }).join('');
      return `<text x="18" y="${y + 5}" text-anchor="middle" fill="#df8e2f" font-size="17" font-weight="700" font-family="Arial">${fret}</text><line x1="34" y1="${y}" x2="218" y2="${y}" stroke="#71675e"/>${notes}`;
    }).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="246" height="${height}" viewBox="0 0 246 ${height}"><rect width="100%" height="100%" rx="8" fill="#17130f"/>${strings}${rows}</svg>`;
  }
}
