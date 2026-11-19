from app.core.exceptions import ConflictError, NotFoundError
from app.repositories.base import Store
from app.schemas.profile import Profile, ProfileCreate, ProfileUpdate


class ProfileService:
    def __init__(self, store: Store):
        self.store = store

    def create(self, data: ProfileCreate) -> Profile:
        return self.store.create(data)

    def get(self, profile_id: str) -> Profile:
        profile = self.store.get(profile_id)
        if profile is None:
            raise NotFoundError("Profile not found.")
        return profile

    def update(self, profile_id: str, patch: ProfileUpdate) -> Profile:
        updated = self.store.update(profile_id, patch)
        if updated is None:
            raise NotFoundError("Profile not found.")
        return updated

    def upsert(self, profile_id: str, data: ProfileCreate) -> tuple[Profile, bool]:
        """Create the profile under a caller-chosen id, or replace its fields if it exists. Safe to repeat: this is how the
        owning application keeps its profile and the engine's copy in step, with no id mapping table. Returns (profile, created)."""
        existing = self.store.get(profile_id)
        if existing is None:
            try:
                return self.store.create(data, profile_id), True
            except ConflictError:  # a concurrent call created it first: fall through and update
                existing = self.store.get(profile_id)
        if existing is None or existing.profile_type != data.profile_type:
            raise ConflictError("A profile with this id exists with a different type.")
        updated = self.store.update(profile_id, ProfileUpdate(**data.model_dump(exclude={"profile_type"})))
        if updated is None:
            raise NotFoundError("Profile not found.")
        return updated, False
