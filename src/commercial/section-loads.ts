export class SectionLoads {
  private controller = new AbortController();
  get signal(): AbortSignal { return this.controller.signal; }
  release(): void {
    this.controller.abort();
    this.controller = new AbortController();
  }
}
