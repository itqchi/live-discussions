import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { HouseFacade } from '../../data-access/house.facade';

@Component({
  selector: 'live-discussions-house-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './house-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HousePageComponent implements OnInit {
  readonly facade = inject(HouseFacade);
  private readonly route = inject(ActivatedRoute);
  private readonly formBuilder = inject(FormBuilder);

  readonly identityForm = this.formBuilder.nonNullable.group({
    displayName: [this.facade.displayName(), [Validators.required, Validators.maxLength(80)]],
  });

  readonly roomForm = this.formBuilder.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(120)]],
  });

  ngOnInit(): void {
    const houseId = this.route.snapshot.paramMap.get('houseId');
    if (houseId) void this.facade.load(houseId);
  }

  saveDisplayName(): void {
    this.facade.setDisplayName(this.identityForm.controls.displayName.value.trim());
  }

  joinHouse(): void {
    this.saveDisplayName();
    if (this.identityForm.invalid) {
      this.identityForm.markAllAsTouched();
      return;
    }

    void this.facade.join();
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
}
