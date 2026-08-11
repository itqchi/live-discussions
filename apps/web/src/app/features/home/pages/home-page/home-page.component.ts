import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HomeFacade } from '../../data-access/home.facade';

type RoomAccessFilter = 'all' | 'open' | 'locked';

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

  readonly roomSearch = signal('');
  readonly roomAccessFilter = signal<RoomAccessFilter>('all');
  readonly filteredRooms = computed(() => {
    const query = this.roomSearch().trim().toLocaleLowerCase();
    const access = this.roomAccessFilter();

    return this.facade.rooms().filter((room) => {
      if (access === 'open' && room.isLocked) return false;
      if (access === 'locked' && !room.isLocked) return false;
      if (!query) return true;

      const houseName = this.facade.houseForRoom(room.id)?.name ?? '';
      return [room.title, room.description, houseName]
        .some((value) => value.toLocaleLowerCase().includes(query));
    });
  });

  readonly identityForm = this.formBuilder.nonNullable.group({
    displayName: [this.facade.displayName(), [Validators.required, Validators.maxLength(80)]],
  });

  readonly roomForm = this.formBuilder.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(100)]],
    description: ['', [Validators.maxLength(500)]],
    isLocked: [false],
  });

  readonly houseForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    description: ['', [Validators.maxLength(240)]],
  });

  ngOnInit(): void {
    void this.facade.load();
  }

  setRoomSearch(value: string): void {
    this.roomSearch.set(value);
  }

  setRoomAccessFilter(filter: RoomAccessFilter): void {
    this.roomAccessFilter.set(filter);
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

    const { title, description, isLocked } = this.roomForm.getRawValue();
    void this.facade.createRoom(title, description, isLocked);
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
