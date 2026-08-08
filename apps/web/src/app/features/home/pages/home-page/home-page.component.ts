import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HomeFacade } from '../../data-access/home.facade';

@Component({
  selector: 'live-discussions-home-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './home-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePageComponent implements OnInit {
  readonly facade = inject(HomeFacade);
  private readonly formBuilder = inject(FormBuilder);

  readonly identityForm = this.formBuilder.nonNullable.group({
    displayName: [this.facade.displayName(), [Validators.required, Validators.maxLength(80)]],
  });

  readonly roomForm = this.formBuilder.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(120)]],
  });

  readonly houseForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    description: ['', [Validators.maxLength(240)]],
  });

  ngOnInit(): void {
    void this.facade.load();
  }

  saveDisplayName(): void {
    const displayName = this.identityForm.controls.displayName.value.trim();
    this.facade.setDisplayName(displayName);
  }

  createRoom(): void {
    this.saveDisplayName();
    if (this.identityForm.invalid || this.roomForm.invalid) {
      this.identityForm.markAllAsTouched();
      this.roomForm.markAllAsTouched();
      return;
    }

    void this.facade.createRoom(this.roomForm.controls.title.value);
  }

  joinRoom(roomId: string): void {
    this.saveDisplayName();
    if (this.identityForm.invalid) {
      this.identityForm.markAllAsTouched();
      return;
    }

    void this.facade.joinRoom(roomId);
  }

  createHouse(): void {
    this.saveDisplayName();
    if (this.identityForm.invalid || this.houseForm.invalid) {
      this.identityForm.markAllAsTouched();
      this.houseForm.markAllAsTouched();
      return;
    }

    const { name, description } = this.houseForm.getRawValue();
    void this.facade.createHouse(name, description).then(() => {
      if (!this.facade.error()) this.houseForm.reset();
    });
  }

  joinHouse(houseId: string): void {
    this.saveDisplayName();
    if (this.identityForm.invalid) {
      this.identityForm.markAllAsTouched();
      return;
    }

    void this.facade.joinHouse(houseId);
  }
}
