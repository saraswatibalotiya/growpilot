from datetime import datetime

from pydantic import BaseModel, Field


class LearningAdjustment(BaseModel):
    """One rule-based adjustment: how ideas with this format/objective/driver are nudged, and the reactions it rests on."""

    dimension: str = Field(description="format, objective or tag")
    value: str
    samples: int = Field(ge=0)
    mean_signal: float = Field(ge=-1, le=1, description="Average reaction, -1 (all negative) to +1 (all positive)")
    adjustment: float = Field(description="Score points added to matching ideas. Zero until the minimum sample is reached")
    active: bool
    computed_at: datetime
    trigger_type: str | None = Field(default=None, description="feedback or outcome: what caused this recomputation")
    trigger_id: str | None = None
