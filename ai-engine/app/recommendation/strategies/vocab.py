"""Words that make an idea specific to an industry instead of generic."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Vocab:
    item: str  # one thing the audience cares about
    items: str
    collection: str
    festive_hook: str  # singular; use plural_hook for the plural
    show_verb: str
    how_to: str
    buy_cta: str
    creator_cta: str
    save_cta: str

    @property
    def plural_hook(self) -> str:
        word = self.festive_hook
        if word.endswith("y") and word[-2] not in "aeiou":
            return word[:-1] + "ies"
        return word + ("es" if word.endswith(("sh", "ch", "s")) else "s")


VOCAB: dict[str, Vocab] = {
    "fashion": Vocab("outfit", "outfits", "collection", "festive outfit", "style", "style it", "DM us to order or visit the store", "Save this look and tell us your favourite", "Save this for your next occasion"),
    "jewellery": Vocab("piece", "pieces", "collection", "festive jewellery", "style", "wear it", "DM us to reserve a piece", "Save this and tag who you would gift it to", "Save this gifting idea"),
    "beauty": Vocab("look", "looks", "routine", "festive look", "recreate", "use it", "Comment 'LINK' and we will send the product details", "Save this routine and try it this week", "Save this for your next routine"),
    "restaurant": Vocab("dish", "dishes", "menu", "festive menu", "plate", "order it", "Book a table or order online: link in bio", "Share this with someone you would eat it with", "Save this for your next meal out"),
    "food": Vocab("dish", "dishes", "recipe", "festive dish", "cook", "make it", "Comment the dish you want next", "Save the recipe and share it with a friend who cooks", "Save this recipe"),
    "travel": Vocab("destination", "destinations", "itinerary", "festive getaway", "plan", "plan it", "Comment where you are heading next", "Save this plan and send it to your travel buddy", "Save this itinerary for your trip"),
    "fitness": Vocab("workout", "workouts", "routine", "festive workout", "follow", "do it", "Comment 'START' for the plan", "Save this and do it with a friend", "Save this workout"),
    "general": Vocab("idea", "ideas", "series", "festive idea", "see", "do it", "Send us a message to know more", "Save this and share it with a friend", "Save this for later"),
}


def vocab_for(family: str) -> Vocab:
    return VOCAB.get(family, VOCAB["general"])
