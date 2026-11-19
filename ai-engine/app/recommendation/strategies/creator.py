"""Creator strategy: ideas that grow an audience and a voice. Objectives lean to engagement, reach, saves, shares and community;
formats to Reels, carousels, tutorials and educational posts; calls to action invite saving, sharing and replying."""

from __future__ import annotations

from app.recommendation.models import Candidate, Seed, Signals
from app.recommendation.strategies.base import family, festival_risks, metric_claim
from app.recommendation.strategies.vocab import vocab_for
from app.schemas.profile import ContentFormat as F
from app.schemas.profile import Objective as O


class CreatorStrategy:
    name = "creator"

    def build(self, seed: Seed, signals: Signals) -> Candidate | None:
        p = signals.profile
        v = vocab_for(family(p))
        goals = set(signals.goals or p.goals)
        niche = p.niche or p.category or "your niche"
        grow = O.REACH if O.REACH in goals else O.ENGAGEMENT
        keep = O.SAVES if O.SAVES in goals else O.SHARES if O.SHARES in goals else O.ENGAGEMENT
        t, x = seed.topic, seed.extra
        base = dict(seed=seed, topic=t, cta=v.creator_cta, tags=[], duration=None, risks=[])

        if seed.kind == "historical":
            fmt = x.get("format") or F.REEL
            return Candidate(**base | dict(title=f"Part two on {t}: build on what is working", idea=f"Follow up your {t} content with a new angle. In your own results, {metric_claim(x.get('metric'))}.", concept=f"Keep what worked (the opening, the pacing, the {v.item} on screen) and change one thing: a new {v.item}, a mistake to avoid, or a before-and-after. Change one variable so you can learn from the result.", format=fmt, objective=keep if x.get("metric") in {"saves", "shares"} else grow, hook=f"Part two: {t}, with a new angle", caption_direction="Reference the first post, add the new angle, ask one question to start replies.", duration=20 if fmt == F.REEL else None))
        if seed.kind == "audience_question":
            theme = x.get("theme", t)
            return Candidate(**base | dict(title=f"Your {niche} questions: {theme}, answered", idea=f"A {niche} post that answers the question about '{theme}' that appears again and again in your comments.", concept="Read the question on screen as people asked it, answer it in under 30 seconds, then show the proof. Offer a saved version people can return to.", format=F.REEL if theme in {"how to or recipe", "budget or itinerary"} else F.EDUCATIONAL_POST, objective=O.AUDIENCE_EDUCATION, hook="This is the question I get the most", caption_direction="Put the answer in text as well so it can be saved. Invite follow-up questions.", duration=30, tags=["audience_driven"], cta=v.save_cta))
        if seed.kind == "audience_request":
            return Candidate(**base | dict(title=f"By request: {t}", idea=f"Make the {t} {v.collection} your followers have asked for.", concept="Say it is by request, deliver it fast and well, and thank the people who asked. A request fulfilled builds the habit of asking and the feeling of being heard.", format=F.TUTORIAL, objective=O.COMMUNITY_BUILDING, hook=f"You asked for {t}", caption_direction="Thank by name if they agree. Ask what to make next.", duration=30, tags=["audience_driven"], cta="Comment what you want next"))
        if seed.kind == "audience_pain":
            return Candidate(**base | dict(title=f"The honest {niche} post: what did not work and what I learned", idea=f"Some followers describe a bad experience or a {niche} result that did not work. A candid post about it builds trust.", concept="Tell what went wrong, what you changed and what you would do now. No excuses and no one named.", format=F.REEL, objective=O.COMMUNITY_BUILDING, hook="This did not work. Here is why", caption_direction="Be specific and kind. End with a question.", duration=25, tags=["audience_driven"]))
        if seed.kind == "trend":
            tr = x["trend"]
            return Candidate(**base | dict(title=f"{tr.title}: your take in {niche}", idea=f"A Reel on '{tr.title}', a sourced and recently verified trend ({tr.source_name}), through your own {niche} lens.", concept="Do not copy the trend. Say what you think of it, show one example, and give your honest opinion. Opinion travels further than imitation.", format=F.REEL, objective=grow, hook=f"Is {tr.title.lower()} worth it? My honest take", caption_direction="Name the trend plainly. Do not claim it is going viral.", duration=15, tags=["trend_driven"], hashtags=list(tr.hashtags), risks=[f"Trend verified {tr.verified_date}. Re-check before posting if it takes more than a few days."]))
        if seed.kind == "festival":
            fe = x["festival"]
            return Candidate(**base | dict(title=f"{fe.name}: {v.plural_hook} that actually work", idea=f"A {fe.name} ({fe.date}) {v.collection} for your audience: 3 {v.items} they can use or copy.", concept=f"Three quick {v.items} for {fe.name}, ranked, with one budget option. Make it saveable: people return to festival ideas right before the date.", format=F.CAROUSEL, objective=keep, hook=f"3 {v.plural_hook} for {fe.name}, ranked", caption_direction=f"Mention {fe.name} and the budget option. Ask which they would pick.", tags=["festival_driven"], cta=v.save_cta, risks=festival_risks(fe), festival_name=fe.name))
        if seed.kind == "competitor":
            k, n, mine, total = x.get("k", 1), x.get("n", 1), x.get("your_posts", 0), x.get("my_total", 0)
            risks = ["Based on public posts only, and on a small number of them." if k < 3 else "Based on public posts only.", *(["The competitor data is FICTIONAL sample data."] if x.get("sample") else [])]
            if k >= 2:
                return Candidate(**base | dict(title=f"Start a recurring {t} series", idea=f"{k} of {n} similar {niche} accounts keep posting about {t} and you have {mine} of your {total} posts on it. A recurring series makes it part of your voice.", concept=f"Choose one format and one day. Each episode takes a different angle on {t} from your own experience, so it is yours and not a copy.", format=F.REEL, objective=grow, hook=f"{t.title()}, my take: part 1", caption_direction="Name the series and when it returns. Keep it about your view. Do not mention other accounts.", duration=20, tags=["competitor_gap"], risks=risks))
            return Candidate(**base | dict(title=f"A gap in {niche} content: {t}", idea=f"Cover {t}. Another {niche} account returns to it and you have {mine} of your {total} posts on it.", concept="Take a stand: what most posts on this get wrong, or the angle nobody takes. Use your own experience.", format=F.REEL, objective=grow, hook=f"What most {niche} accounts get wrong about {t}", caption_direction="Keep it about your view. Do not mention other accounts.", duration=20, tags=["competitor_gap"], risks=risks))
        angle = x.get("angle", "tips")
        subject = x.get("subject") or niche
        if angle == "bts":
            return Candidate(**base | dict(title=f"A real day behind my {subject} content", idea="Show how a post is actually made: the planning, the retakes, the mess.", concept="Quick clips of a real working day, with one honest lesson. Audiences connect with the person behind the posts.", format=F.BEHIND_THE_SCENES, objective=O.COMMUNITY_BUILDING, hook="What making one post actually looks like", caption_direction="One lesson learned. Ask what they want to see.", duration=20, tags=["evergreen"]))
        if angle == "ugc":
            return Candidate(**base | dict(title=f"Your turn: show me how you do {subject}", idea="Invite followers to share their own take and feature the best ones.", concept="Set a simple prompt, give a way to share, promise to feature a few. Share the first examples within a week.", format=F.UGC_CONCEPT, objective=O.COMMUNITY_BUILDING, hook="I want to see yours", caption_direction="Explain the prompt in one line and how to take part.", tags=["evergreen"], cta="Share yours and tag me"))
        if angle == "faq":
            return Candidate(**base | dict(title=f"{subject.title()} mistakes I would avoid", idea=f"A carousel of common mistakes in {subject}, and what to do instead.", concept="Five slides: mistake, why it happens, the fix. End with the one you made yourself.", format=F.EDUCATIONAL_POST, objective=keep, hook=f"5 {subject} mistakes I stopped making", caption_direction="Make each point saveable as text.", tags=["evergreen"], cta=v.save_cta))
        return Candidate(**base | dict(title=f"Your {subject} starter guide", idea=f"A guide for people new to {subject}: where to start and what to skip.", concept="Start with the one thing that matters most, then two things that can wait. Honest and short beats complete.", format=F.CAROUSEL, objective=keep, hook=f"If I were starting {subject} again", caption_direction="Give the three points in text for saving.", tags=["evergreen"], cta=v.save_cta))
