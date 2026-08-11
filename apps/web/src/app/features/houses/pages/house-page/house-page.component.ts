import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DismissibleDetailsDirective } from '../../../../shared/ui/dismissible-details.directive';
import { HouseFacade } from '../../data-access/house.facade';

@Component({
  selector: 'live-discussions-house-page',
  standalone: true,
  imports: [ReactiveFormsModule, DismissibleDetailsDirective],
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

  readonly houseForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    description: ['', [Validators.maxLength(240)]],
  });

  ngOnInit(): void {
    const houseId = this.route.snapshot.paramMap.get('houseId');
    if (!houseId) return;

    void this.facade.load(houseId).then(() => {
      const house = this.facade.house();
      if (!house) return;
      this.houseForm.setValue({
        name: house.name,
        description: house.description,
      });
    });
  }

  saveDisplayName(): void {
    this.facade.setDisplayName(this.identityForm.controls.displayName.value.trim());
  }

  saveHouseSettings(): void {
    if (this.houseForm.invalid) {
      this.houseForm.markAllAsTouched();
      return;
    }

    const { name, description } = this.houseForm.getRawValue();
    void this.facade.updateHouse(name, description).then((updated) => {
      if (!updated) return;
      const house = this.facade.house();
      if (!house) return;
      this.houseForm.setValue({
        name: house.name,
        description: house.description,
      });
      this.houseForm.markAsPristine();
    });
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

  initialsFor(name: string): string {
    const value = name.trim();
    if (!value) return '?';
    return value
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }
}
