import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { ChordMode, TriadGroup, TriadShape } from '../../model/models';

@Component({
  selector: 'app-triad-shapes',
  standalone: true,
  templateUrl: './triad-shapes.component.html'
})
export class TriadShapesComponent {
  @ViewChild('editor') private editor?: ElementRef<HTMLDivElement>;
  @ViewChild('fileInput') private fileInput?: ElementRef<HTMLInputElement>;
  @ViewChild('workspace') private workspace?: ElementRef<HTMLDivElement>;

  @Input({ required: true }) selectedKey = '';
  @Input({ required: true }) chordMode: ChordMode = 'major';
  @Input({ required: true }) triadShapes: readonly TriadGroup[] = [];
  @Output() chordModeChange = new EventEmitter<ChordMode>();

  selectedImage?: HTMLElement;
  selectedImageWidth = 100;
  libraryWidth = 52;
  resizing = false;
  readonly stringNumbers = [6, 5, 4, 3, 2, 1];
  private savedRange?: Range;
  private imageSequence = 0;

  usedStringIndices(shape: TriadShape): number[] {
    return shape.frets
      .map((fret, index) => fret === null ? -1 : index)
      .filter(index => index >= 0);
  }

  stringX(displayIndex: number): number { return 38 + displayIndex * 32; }
  fretY(index: number): number { return 58 + index * 28; }
  diagramHeight(_shape: TriadShape): number { return 136; }
  diagramViewBox(shape: TriadShape): string { return `0 0 126 ${this.diagramHeight(shape)}`; }

  beginTriadDrag(event: DragEvent, shape: TriadShape): void {
    if (!event.dataTransfer) return;
    window.getSelection()?.removeAllRanges();
    const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(this.createSvg(shape))}`;
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/x-triad-image', source);
    event.dataTransfer.setData('text/uri-list', source);
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
      this.insertImage(triadSource, 'Dragged triad diagram', 100);
      return;
    }
    const imageFile = Array.from(event.dataTransfer?.files ?? []).find(file => file.type.startsWith('image/'));
    if (!imageFile || imageFile.size > 8 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => this.insertImage(String(reader.result), imageFile.name, 240);
    reader.readAsDataURL(imageFile);
  }

  startResize(event: PointerEvent): void {
    this.resizing = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  resizeWorkspace(event: PointerEvent): void {
    if (!this.resizing || !this.workspace) return;
    const bounds = this.workspace.nativeElement.getBoundingClientRect();
    const nextWidth = ((event.clientX - bounds.left) / bounds.width) * 100;
    this.libraryWidth = Math.max(30, Math.min(70, nextWidth));
  }

  stopResize(event: PointerEvent): void {
    if (!this.resizing) return;
    this.resizing = false;
    const divider = event.currentTarget as HTMLElement;
    if (divider.hasPointerCapture(event.pointerId)) divider.releasePointerCapture(event.pointerId);
  }

  resizeWithKeyboard(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const change = event.key === 'ArrowLeft' ? -2 : 2;
    this.libraryWidth = Math.max(30, Math.min(70, this.libraryWidth + change));
  }

  rememberSelection(): void {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !this.editor) return;
    const range = selection.getRangeAt(0);
    if (this.editor.nativeElement.contains(range.commonAncestorContainer)) {
      this.savedRange = range.cloneRange();
    }
  }

  pasteIntoEditor(event: ClipboardEvent): void {
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') ?? '';
    const html = this.escapeHtml(text).replace(/\r\n?|\n/g, '<br>');
    this.insertHtml(`<span style="font-weight:400">${html}</span>`);
  }

  format(command: string, value?: string): void {
    this.restoreSelection();
    document.execCommand(command, false, value);
    this.rememberSelection();
  }

  selectEditorImage(event: MouseEvent): void {
    const wrapper = (event.target as HTMLElement).closest('.resizable-image') as HTMLElement | null;
    this.selectedImage = wrapper ?? undefined;
    if (wrapper) this.selectedImageWidth = Math.round(wrapper.getBoundingClientRect().width);
    this.rememberSelection();
  }

  resizeSelected(event: Event): void {
    this.setSelectedImageWidth((event.target as HTMLInputElement).value);
  }

  setSelectedImageWidth(value: number | string): void {
    if (!this.selectedImage) return;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    this.selectedImageWidth = Math.round(Math.max(40, Math.min(680, parsed)));
    this.selectedImage.style.width = `${this.selectedImageWidth}px`;
  }

  clearEditor(): void {
    if (this.editor) this.editor.nativeElement.innerHTML = '<br>';
    this.selectedImage = undefined;
    this.savedRange = undefined;
  }

  chooseEditorFile(): void {
    this.fileInput?.nativeElement.click();
  }

  loadEditorFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || file.size > 12 * 1024 * 1024 || !this.editor) return;

    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result ?? '');
      if (file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')) {
        const textHtml = this.escapeHtml(raw).replace(/\r\n?|\n/g, '<br>') || '<br>';
        this.editor!.nativeElement.innerHTML = `<span style="font-weight:400">${textHtml}</span>`;
      } else {
        this.editor!.nativeElement.innerHTML = this.sanitizeLoadedHtml(raw);
      }
      this.selectedImage = undefined;
      this.savedRange = undefined;
    };
    reader.readAsText(file);
  }

  saveEditor(): void {
    if (!this.editor) return;
    const documentHtml = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${this.escapeHtml(this.selectedKey)} practice notes</title>
<style>
body { max-width: 900px; margin: 32px auto; padding: 0 24px; color: #17130f; font-family: Arial, sans-serif; line-height: 1.55; }
h1, h2, h3 { font-family: Georgia, serif; }
.resizable-image { display: inline-block; max-width: 100%; margin: 8px; vertical-align: top; }
.resizable-image img { display: block; width: 100%; height: auto; }
</style>
</head>
<body><main id="practice-notes">${this.editor.nativeElement.innerHTML}</main></body>
</html>`;
    const blob = new Blob([documentHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${this.selectedKey.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-practice-notes.html`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  printEditor(): void {
    if (!this.editor) return;
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) return;
    printWindow.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${this.escapeHtml(this.selectedKey)} practice notes</title>
<style>
@page { margin: 0.6in; }
body { margin: 0; color: #17130f; font-family: Arial, sans-serif; line-height: 1.45; }
.print-controls { padding: 12px 20px; position: sticky; top: 0; display: flex; gap: 8px; background: #17130f; box-shadow: 0 2px 8px rgba(0,0,0,.25); }
.print-controls button { min-height: 40px; padding: 0 18px; border: 1px solid #f3ecdf; color: #17130f; background: #f3ecdf; font: 700 14px Arial, sans-serif; cursor: pointer; }
.print-controls button:first-child { color: white; border-color: #9d2d24; background: #9d2d24; }
.print-content { padding: 24px; }
h1, h2, h3 { font-family: Georgia, serif; }
.resizable-image { display: inline-block; max-width: 100%; margin: 2px; vertical-align: top; break-inside: avoid; }
.resizable-image img { display: block; width: 100%; height: auto; }
@media print {
  .print-controls { display: none; }
  .print-content { padding: 0; }
}
</style>
</head>
<body>
  <div class="print-controls">
    <button type="button" onclick="window.print()">Print this page</button>
    <button type="button" onclick="window.close()">Close</button>
  </div>
  <main class="print-content">${this.editor.nativeElement.innerHTML}</main>
</body>
</html>`);
    printWindow.document.close();
    printWindow.focus();
  }

  private restoreSelection(): void {
    this.editor?.nativeElement.focus();
    if (!this.savedRange) return;
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(this.savedRange);
  }

  private insertImage(source: string, alt: string, width: number): void {
    const safeAlt = alt.replace(/[&<>"']/g, '');
    const imageId = `editor-image-${Date.now()}-${++this.imageSequence}`;
    this.insertHtml(`<span class="resizable-image" data-editor-image-id="${imageId}" contenteditable="false" style="width:${width}px"><img src="${source}" alt="${safeAlt}"></span>&#8203;`);
    const inserted = this.editor?.nativeElement.querySelector(`[data-editor-image-id="${imageId}"]`) as HTMLElement | null;
    if (inserted) {
      this.selectedImage = inserted;
      this.selectedImageWidth = width;
    }
  }

  private insertHtml(html: string): void {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !this.editor?.nativeElement.contains(selection.anchorNode)) {
      this.editor?.nativeElement.insertAdjacentHTML('beforeend', html);
      return;
    }
    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(range.createContextualFragment(html));
    selection.collapseToEnd();
    this.rememberSelection();
  }

  private placeCaret(x: number, y: number): void {
    const doc = document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null };
    const range = doc.caretRangeFromPoint?.(x, y);
    if (!range || !this.editor?.nativeElement.contains(range.commonAncestorContainer)) {
      this.editor?.nativeElement.focus();
      return;
    }
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  private sanitizeLoadedHtml(raw: string): string {
    const parsed = new DOMParser().parseFromString(raw, 'text/html');
    parsed.querySelectorAll('script, iframe, object, embed, link, meta, style').forEach(element => element.remove());
    parsed.querySelectorAll<HTMLElement>('*').forEach(element => {
      Array.from(element.attributes).forEach(attribute => {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim().toLowerCase();
        if (name.startsWith('on') || ((name === 'href' || name === 'src') && value.startsWith('javascript:'))) {
          element.removeAttribute(attribute.name);
        }
      });
    });
    return parsed.querySelector('#practice-notes')?.innerHTML ?? parsed.body.innerHTML;
  }

  private escapeHtml(value: string): string {
    const element = document.createElement('div');
    element.textContent = value;
    return element.innerHTML;
  }

  private createSvg(shape: TriadShape): string {
    const height = this.diagramHeight(shape);
    const usedStringIndices = this.usedStringIndices(shape);
    const chordName = `<text x="70" y="18" text-anchor="middle" fill="#17130f" font-size="17" font-weight="800" font-family="Arial">${shape.name}</text>`;
    const strings = usedStringIndices.map((stringIndex, displayIndex) =>
      `<text x="${this.stringX(displayIndex)}" y="35" text-anchor="middle" fill="#5f564c" font-size="11" font-weight="800" font-family="Arial">${this.stringNumbers[stringIndex]}</text><line x1="${this.stringX(displayIndex)}" y1="42" x2="${this.stringX(displayIndex)}" y2="${height - 8}" stroke="#8c8073" stroke-width="1.4"/>`
    ).join('');
    const rows = shape.usedFrets.map((fret, fretIndex) => {
      const y = this.fretY(fretIndex);
      const notes = usedStringIndices.map((stringIndex, displayIndex) => {
        if (shape.frets[stringIndex] !== fret) return '';
        const isRoot = shape.roots[stringIndex];
        return `<circle cx="${this.stringX(displayIndex)}" cy="${y}" r="10" fill="${isRoot ? '#fffdf8' : '#df8e2f'}" stroke="#df8e2f" stroke-width="${isRoot ? 2.5 : 1}"/><text x="${this.stringX(displayIndex)}" y="${y + 3.5}" text-anchor="middle" fill="#17130f" font-size="8.5" font-weight="700" font-family="Arial">${shape.notes[stringIndex] ?? ''}</text>`;
      }).join('');
      return `<text x="13" y="${y + 5}" text-anchor="middle" fill="#9d2d24" font-size="16" font-weight="700" font-family="Arial">${fret}</text><line x1="27" y1="${y}" x2="116" y2="${y}" stroke="#8c8073"/>${notes}`;
    }).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="126" height="${height}" viewBox="0 0 126 ${height}"><rect width="100%" height="100%" rx="6" fill="#fffdf8"/>${chordName}${strings}${rows}</svg>`;
  }
}
