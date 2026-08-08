import { Directive, ElementRef, HostListener, inject } from '@angular/core';

@Directive({
  selector: 'details[liveDiscussionsDismissibleDetails]',
  standalone: true,
})
export class DismissibleDetailsDirective {
  private readonly element = inject(ElementRef<HTMLDetailsElement>);

  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(event: PointerEvent): void {
    const details = this.element.nativeElement;
    const target = event.target;

    if (details.open && target instanceof Node && !details.contains(target)) {
      details.open = false;
    }
  }
}
