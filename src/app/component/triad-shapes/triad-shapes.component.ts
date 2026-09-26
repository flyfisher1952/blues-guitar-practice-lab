import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild } from '@angular/core';
import { asBlob } from 'html-docx-js-typescript';
import { ChordMode, KeyOption, TriadGroup, TriadShape } from '../../model/models';

type WritableFile = { write(data: Blob): Promise<void>; close(): Promise<void> };
type SaveFileHandle = { name: string; createWritable(): Promise<WritableFile> };
type OpenFileHandle = { getFile(): Promise<File> };
type FilePickerType = { description: string; accept: Record<string, string[]> };
type SaveFilePickerOptions = {
  id: string;
  startIn: 'documents';
  suggestedName: string;
  types: FilePickerType[];
};
type OpenFilePickerOptions = {
  id: string;
  startIn: 'documents';
  multiple: false;
  types: FilePickerType[];
};
type FilePickerWindow = Window & {
  showOpenFilePicker?: (options: OpenFilePickerOptions) => Promise<OpenFileHandle[]>;
  showSaveFilePicker?: (options: SaveFilePickerOptions) => Promise<SaveFileHandle>;
};

interface PracticeSettings {
  version: 1;
  selectedKey: string;
  chordMode: ChordMode;
  documentName: string;
  editorHtml: string;
  defaultFontFamily?: string;
  defaultFontSize?: number;
  imageDropSize?: number;
  loadLastDocument?: boolean;
}

interface EditorPreferences {
  defaultFontFamily: string;
  defaultFontSize: number;
  imageDropSize: number;
  loadLastDocument: boolean;
}

@Component({
  selector: 'app-triad-shapes',
  standalone: true,
  templateUrl: './triad-shapes.component.html'
})
export class TriadShapesComponent implements AfterViewInit {
  @ViewChild('editor') private editor?: ElementRef<HTMLDivElement>;
  @ViewChild('fileInput') private fileInput?: ElementRef<HTMLInputElement>;
  @ViewChild('settingsInput') private settingsInput?: ElementRef<HTMLInputElement>;
  @ViewChild('workspace') private workspace?: ElementRef<HTMLDivElement>;

  @Input({ required: true }) selectedKey = '';
  @Input({ required: true }) keys: readonly KeyOption[] = [];
  @Input({ required: true }) chordMode: ChordMode = 'major';
  @Input({ required: true }) triadShapes: readonly TriadGroup[] = [];
  @Output() selectedKeyChange = new EventEmitter<string>();
  @Output() chordModeChange = new EventEmitter<ChordMode>();

  selectedImage?: HTMLElement;
  selectedImageWidth = 100;
  libraryWidth = 52;
  resizing = false;
  currentDocumentName = 'Untitled practice document';
  defaultFontFamily = 'Arial';
  defaultFontSize = 16;
  imageDropSize = 100;
  loadLastDocument = false;
  settingsOpen = false;
  settingsFontFamily = 'Arial';
  settingsFontSize = 16;
  settingsImageDropSize = 100;
  settingsLoadLastDocument = false;
  openMenu?: 'file' | 'edit' | 'insert';
  readonly stringNumbers = [6, 5, 4, 3, 2, 1];
  private savedRange?: Range;
  private imageSequence = 0;
  private readonly preferencesKey = 'practiceEditorPreferences';
  private readonly lastDocumentKey = 'practiceEditorLastDocument';

  ngAfterViewInit(): void {
    window.setTimeout(() => {
      this.restorePreferences();
      if (this.loadLastDocument) this.restoreLastDocument();
    });
  }

  @HostListener('document:click')
  closeMenus(): void {
    this.openMenu = undefined;
  }

  toggleMenu(menu: 'file' | 'edit' | 'insert'): void {
    this.openMenu = this.openMenu === menu ? undefined : menu;
  }

  activateMenu(menu: 'file' | 'edit' | 'insert'): void {
    if (this.openMenu) this.openMenu = menu;
  }

  changeSelectedKey(key: string): void {
    this.selectedKeyChange.emit(key);
    window.setTimeout(() => this.saveLastDocument());
  }

  changeChordMode(mode: ChordMode): void {
    this.chordModeChange.emit(mode);
    window.setTimeout(() => this.saveLastDocument());
  }

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
      this.insertImage(triadSource, 'Dragged triad diagram', this.imageDropSize);
      return;
    }
    const imageFile = Array.from(event.dataTransfer?.files ?? []).find(file => file.type.startsWith('image/'));
    if (!imageFile || imageFile.size > 8 * 1024 * 1024) return;
    const reader = new FileReader();
    reader.onload = () => this.insertImage(String(reader.result), imageFile.name, this.imageDropSize);
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

  insertPageBreak(): void {
    this.restoreSelection();
    this.insertHtml(
      '<div class="page-break" contenteditable="false" aria-label="Page break"></div><p><br></p>'
    );
  }

  openSettings(): void {
    this.settingsFontFamily = this.defaultFontFamily;
    this.settingsFontSize = this.defaultFontSize;
    this.settingsImageDropSize = this.imageDropSize;
    this.settingsLoadLastDocument = this.loadLastDocument;
    this.settingsOpen = true;
  }

  closeSettings(): void {
    this.settingsOpen = false;
  }

  saveEditorSettings(): void {
    this.defaultFontFamily = this.allowedFont(this.settingsFontFamily);
    this.defaultFontSize = this.clamp(this.settingsFontSize, 10, 32, 16);
    this.imageDropSize = this.clamp(this.settingsImageDropSize, 40, 680, 100);
    this.selectedImageWidth = this.imageDropSize;
    this.loadLastDocument = this.settingsLoadLastDocument;
    this.persistPreferences();
    if (this.loadLastDocument) {
      this.saveLastDocument();
    } else {
      localStorage.removeItem(this.lastDocumentKey);
    }
    this.settingsOpen = false;
  }

  editorChanged(): void {
    this.rememberSelection();
    this.saveLastDocument();
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
    this.currentDocumentName = 'Untitled practice document';
    this.selectedImage = undefined;
    this.savedRange = undefined;
    this.saveLastDocument();
  }

  async chooseEditorFile(): Promise<void> {
    const picker = (window as FilePickerWindow).showOpenFilePicker;
    if (!picker) {
      this.fileInput?.nativeElement.click();
      return;
    }

    try {
      const handles = await picker.call(window, {
        id: 'practice-documents',
        startIn: 'documents',
        multiple: false,
        types: [{
          description: 'Practice documents',
          accept: {
            'text/html': ['.html', '.htm'],
            'text/plain': ['.txt']
          }
        }]
      });
      const handle = handles[0];
      if (handle) await this.openEditorFile(await handle.getFile());
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      console.warn('Open dialog unavailable; using the browser file input instead.', error);
      this.fileInput?.nativeElement.click();
    }
  }

  loadEditorFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) void this.openEditorFile(file);
  }

  chooseSettingsFile(): void {
    this.settingsInput?.nativeElement.click();
  }

  loadSettingsFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || file.size > 12 * 1024 * 1024 || !this.editor) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const settings = JSON.parse(String(reader.result ?? '')) as Partial<PracticeSettings>;
        if (settings.version !== 1 || typeof settings.editorHtml !== 'string') {
          throw new Error('Unsupported settings file.');
        }
        this.restorePracticeContext(settings.selectedKey, settings.chordMode);
        this.currentDocumentName = settings.documentName?.trim() || 'Untitled practice document';
        this.editor!.nativeElement.innerHTML = this.sanitizeLoadedHtml(settings.editorHtml) || '<br>';
        this.applyPreferences(settings);
        this.selectedImage = undefined;
        this.savedRange = undefined;
        this.settingsOpen = false;
        this.saveLastDocument();
      } catch (error) {
        console.error('Settings load failed', error);
        window.alert('That file is not a valid practice-document settings file.');
      }
    };
    reader.readAsText(file);
  }

  async saveSettings(): Promise<void> {
    if (!this.editor) return;
    const suggestedName = 'blues-guitar-practice-settings.json';
    const handle = await this.chooseSaveHandle(
      suggestedName,
      'Practice document settings',
      'application/json',
      '.json',
      'practice-settings'
    );
    if (handle === null) return;

    const settings: PracticeSettings = {
      version: 1,
      selectedKey: this.selectedKey,
      chordMode: this.chordMode,
      documentName: this.currentDocumentName,
      editorHtml: this.editor.nativeElement.innerHTML,
      defaultFontFamily: this.defaultFontFamily,
      defaultFontSize: this.defaultFontSize,
      imageDropSize: this.imageDropSize,
      loadLastDocument: this.loadLastDocument
    };
    const blob = new Blob([JSON.stringify(settings, null, 2)], {
      type: 'application/json;charset=utf-8'
    });
    await this.writeSavedFile(blob, suggestedName, handle);
  }

  async saveHtml(): Promise<void> {
    if (!this.editor) return;
    const suggestedName = this.suggestedFileName('html');
    const handle = await this.chooseSaveHandle(suggestedName, 'HTML document', 'text/html', '.html');
    if (handle === null) return;

    const documentName = handle?.name ?? suggestedName;
    const documentHtml = this.buildDocumentHtml(
      this.editor.nativeElement.innerHTML,
      `${this.selectedKey} practice notes`,
      true,
      documentName
    );
    const blob = new Blob([documentHtml], { type: 'text/html;charset=utf-8' });
    await this.writeSavedFile(blob, suggestedName, handle);
    this.currentDocumentName = documentName;
    this.saveLastDocument();
  }

  async saveDocx(): Promise<void> {
    if (!this.editor) return;
    const suggestedName = this.suggestedFileName('docx');
    const handle = await this.chooseSaveHandle(
      suggestedName,
      'Microsoft Word document',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.docx'
    );
    if (handle === null) return;

    try {
      const editorCopy = this.editor.nativeElement.cloneNode(true) as HTMLElement;
      await this.convertSvgImagesToPng(editorCopy);
      const documentHtml = this.buildDocumentHtml(
        editorCopy.innerHTML,
        `${this.selectedKey} practice notes`,
        false
      );
      const generated = await asBlob(documentHtml, {
        orientation: 'portrait',
        margins: { top: 720, right: 720, bottom: 720, left: 720 }
      });
      const blob = generated instanceof Blob
        ? generated
        : new Blob([generated as unknown as BlobPart], {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          });
      await this.writeSavedFile(blob, suggestedName, handle);
    } catch (error) {
      console.error('DOCX export failed', error);
      window.alert('The Word document could not be created.');
    }
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
.page-break { height: 0; margin: 24px 0; border-top: 2px dashed #8c8073; break-before: page; page-break-before: always; }
@media print {
  .print-controls { display: none; }
  .print-content { padding: 0; }
  .page-break { margin: 0; border: 0; }
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

  private suggestedFileName(extension: 'html' | 'docx'): string {
    const keyName = this.selectedKey.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
    return `${keyName || 'blues'}-practice-notes.${extension}`;
  }

  private buildDocumentHtml(
    innerHtml: string,
    title: string,
    includeWebFonts = true,
    documentName = this.currentDocumentName
  ): string {
    const fontLinks = includeWebFonts
      ? '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=Newsreader:opsz,wght@6..72,500;6..72,700&display=swap" rel="stylesheet">'
      : '';
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${this.escapeHtml(title)}</title>
${fontLinks}
<style>
* { box-sizing: border-box; }
html { background: #f3ecdf; }
body { margin: 0; padding: 32px; color: #17130f; background: #f3ecdf; font-family: "DM Sans", Arial, sans-serif; font-size: 16px; font-weight: 400; line-height: 1.1; }
#practice-notes { max-width: 900px; min-height: 600px; margin: 0 auto; padding: 24px; background: #fffdf8; border: 1px solid #8c8073; }
#practice-notes p { margin: 0; }
#practice-notes h1, #practice-notes h2, #practice-notes h3 { font-family: "Newsreader", Georgia, serif; }
#practice-notes .resizable-image { display: inline-block; max-width: 100%; margin: 2px; overflow: hidden; vertical-align: top; border: 2px solid transparent; }
#practice-notes .resizable-image img { display: block; width: 100%; height: auto; object-fit: contain; }
#practice-notes .page-break { height: 0; margin: 24px 0; border-top: 2px dashed #8c8073; break-before: page; page-break-before: always; }
@media print { #practice-notes .page-break { margin: 0; border: 0; } }
</style>
</head>
<body><main id="practice-notes" data-practice-key="${this.escapeAttribute(this.selectedKey)}" data-chord-mode="${this.escapeAttribute(this.chordMode)}" data-document-name="${this.escapeAttribute(documentName)}">${innerHtml}</main></body>
</html>`;
  }

  private async chooseSaveHandle(
    suggestedName: string,
    description: string,
    mimeType: string,
    extension: string,
    pickerId = 'practice-documents'
  ): Promise<SaveFileHandle | null | undefined> {
    const picker = (window as FilePickerWindow).showSaveFilePicker;
    if (!picker) return undefined;
    try {
      return await picker.call(window, {
        id: pickerId,
        startIn: 'documents',
        suggestedName,
        types: [{ description, accept: { [mimeType]: [extension] } }]
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return null;
      console.warn('Save As dialog unavailable; using browser download instead.', error);
      return undefined;
    }
  }

  private async openEditorFile(file: File): Promise<void> {
    if (file.size > 12 * 1024 * 1024 || !this.editor) return;

    const raw = await file.text();
    if (file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')) {
      const textHtml = this.escapeHtml(raw).replace(/\r\n?|\n/g, '<br>') || '<br>';
      this.editor.nativeElement.innerHTML = `<span style="font-weight:400">${textHtml}</span>`;
      this.currentDocumentName = file.name;
    } else {
      const parsed = new DOMParser().parseFromString(raw, 'text/html');
      const notes = parsed.querySelector<HTMLElement>('#practice-notes');
      this.restorePracticeContext(notes?.dataset['practiceKey'], notes?.dataset['chordMode']);
      this.currentDocumentName = notes?.dataset['documentName']?.trim() || file.name;
      this.editor.nativeElement.innerHTML = this.sanitizeLoadedHtml(raw);
    }
    this.selectedImage = undefined;
    this.savedRange = undefined;
    this.saveLastDocument();
  }

  private restorePreferences(): void {
    try {
      const saved = JSON.parse(localStorage.getItem(this.preferencesKey) ?? '{}') as Partial<EditorPreferences>;
      this.applyPreferences(saved);
    } catch {
      localStorage.removeItem(this.preferencesKey);
    }
  }

  private applyPreferences(settings: Partial<EditorPreferences>): void {
    if (typeof settings.defaultFontFamily === 'string') {
      this.defaultFontFamily = this.allowedFont(settings.defaultFontFamily);
    }
    if (typeof settings.defaultFontSize === 'number') {
      this.defaultFontSize = this.clamp(settings.defaultFontSize, 10, 32, 16);
    }
    if (typeof settings.imageDropSize === 'number') {
      this.imageDropSize = this.clamp(settings.imageDropSize, 40, 680, 100);
      this.selectedImageWidth = this.imageDropSize;
    }
    if (typeof settings.loadLastDocument === 'boolean') {
      this.loadLastDocument = settings.loadLastDocument;
    }
    this.persistPreferences();
  }

  private persistPreferences(): void {
    const preferences: EditorPreferences = {
      defaultFontFamily: this.defaultFontFamily,
      defaultFontSize: this.defaultFontSize,
      imageDropSize: this.imageDropSize,
      loadLastDocument: this.loadLastDocument
    };
    localStorage.setItem(this.preferencesKey, JSON.stringify(preferences));
  }

  private saveLastDocument(): void {
    if (!this.loadLastDocument || !this.editor) return;
    try {
      const snapshot: PracticeSettings = {
        version: 1,
        selectedKey: this.selectedKey,
        chordMode: this.chordMode,
        documentName: this.currentDocumentName,
        editorHtml: this.editor.nativeElement.innerHTML
      };
      localStorage.setItem(this.lastDocumentKey, JSON.stringify(snapshot));
    } catch (error) {
      console.warn('The current document is too large for browser recovery storage.', error);
    }
  }

  private restoreLastDocument(): void {
    if (!this.editor) return;
    try {
      const snapshot = JSON.parse(localStorage.getItem(this.lastDocumentKey) ?? 'null') as PracticeSettings | null;
      if (!snapshot || snapshot.version !== 1 || typeof snapshot.editorHtml !== 'string') return;
      this.restorePracticeContext(snapshot.selectedKey, snapshot.chordMode);
      this.currentDocumentName = snapshot.documentName?.trim() || 'Untitled practice document';
      this.editor.nativeElement.innerHTML = this.sanitizeLoadedHtml(snapshot.editorHtml) || '<br>';
    } catch {
      localStorage.removeItem(this.lastDocumentKey);
    }
  }

  private allowedFont(value: string): string {
    const fonts = ['Arial', 'Consolas', 'Courier New', 'Georgia', 'Tahoma', 'Times New Roman', 'Verdana'];
    return fonts.includes(value) ? value : 'Arial';
  }

  private clamp(value: number, minimum: number, maximum: number, fallback: number): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.round(Math.max(minimum, Math.min(maximum, numeric))) : fallback;
  }

  private async writeSavedFile(
    blob: Blob,
    suggestedName: string,
    handle: SaveFileHandle | undefined
  ): Promise<void> {
    if (handle) {
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = suggestedName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private async convertSvgImagesToPng(root: HTMLElement): Promise<void> {
    const images = Array.from(root.querySelectorAll<HTMLImageElement>('img'));
    await Promise.all(images.map(async image => {
      if (!image.src.startsWith('data:image/svg+xml')) return;
      image.src = await this.svgDataUrlToPng(image.src);
    }));
  }

  private svgDataUrlToPng(source: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const scale = 3;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, image.naturalWidth * scale);
        canvas.height = Math.max(1, image.naturalHeight * scale);
        const context = canvas.getContext('2d');
        if (!context) {
          reject(new Error('Canvas is unavailable.'));
          return;
        }
        context.scale(scale, scale);
        context.drawImage(image, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      image.onerror = () => reject(new Error('A triad image could not be converted for Word.'));
      image.src = source;
    });
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

  private restorePracticeContext(key?: string, mode?: string): void {
    if (key && this.keys.some(option => option.label === key)) {
      this.selectedKeyChange.emit(key);
    }
    if (mode === 'major' || mode === 'minor' || mode === 'seventh') {
      this.chordModeChange.emit(mode);
    }
  }

  private escapeAttribute(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
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
