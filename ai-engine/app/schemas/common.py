from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, Field

from app.core.logging import get_request_id

T = TypeVar("T")

ConfidenceLabel = Literal["low", "medium", "high"]


class Meta(BaseModel):
    request_id: str


class Envelope(BaseModel, Generic[T]):
    """Every successful response has this shape. Errors use {"error": {...}, "meta": {...}}."""

    data: T
    meta: Meta


class Page(BaseModel, Generic[T]):
    items: list[T]
    page: int
    page_size: int
    total: int


def envelope(data: T) -> Envelope[T]:
    return Envelope[T](data=data, meta=Meta(request_id=get_request_id()))


def confidence_label(value: float) -> ConfidenceLabel:
    return "high" if value >= 0.75 else "medium" if value >= 0.45 else "low"


class DataCoverage(BaseModel):
    """How much of the data a finding stands on. Missing data is reported, never counted as zero."""

    items_total: int = Field(ge=0)
    items_with_data: int = Field(ge=0)
    coverage_ratio: float = Field(ge=0, le=1)
    notes: list[str] = Field(default_factory=list)

    @classmethod
    def of(cls, total: int, with_data: int, *notes: str) -> "DataCoverage":
        return cls(items_total=total, items_with_data=with_data, coverage_ratio=round(with_data / total, 3) if total else 0.0, notes=list(notes))


class Insight(BaseModel):
    """One finding with the numbers behind it, how sure we are, and how it was worked out."""

    key: str
    finding: str
    supporting_metrics: dict[str, float | int | str | None] = Field(default_factory=dict)
    confidence: float = Field(ge=0, le=1)
    confidence_label: ConfidenceLabel
    data_coverage: DataCoverage
    explanation: str

    @classmethod
    def build(cls, key: str, finding: str, metrics: dict[str, float | int | str | None], confidence: float, coverage: DataCoverage, explanation: str) -> "Insight":
        confidence = round(max(0.0, min(1.0, confidence)), 2)
        return cls(key=key, finding=finding, supporting_metrics=metrics, confidence=confidence, confidence_label=confidence_label(confidence), data_coverage=coverage, explanation=explanation)
