"""Business strategy: ideas that help a shop, restaurant or brand be found, trusted and chosen. Objectives lean to product
discovery, leads and sales; formats to product showcases, carousels and Reels; calls to action invite an order, booking or visit."""

from __future__ import annotations

from app.recommendation.models import Candidate, Seed, Signals
from app.recommendation.strategies.base import family, festival_risks, metric_claim
from app.recommendation.strategies.vocab import vocab_for
from app.schemas.profile import ContentFormat as F
from app.schemas.profile import Objective as O


class BusinessStrategy:
    name = "business"

    def build(self, seed: Seed, signals: Signals) -> Candidate | None:
        p = signals.profile
        v = vocab_for(family(p))
        goals = set(signals.goals or p.goals)
        sell = O.SALES if O.SALES in goals else O.PRODUCT_DISCOVERY if O.PRODUCT_DISCOVERY in goals else O.LEADS if O.LEADS in goals else O.BRAND_AWARENESS
        lead = O.LEADS if O.LEADS in goals else sell
        offer = (p.products or [v.item])[0]
        place = f" in {p.city}" if p.city else ""
        t, x = seed.topic, seed.extra
        base = dict(seed=seed, topic=t, cta=v.buy_cta, tags=[], duration=None, risks=[])

        if seed.kind == "historical":
            fmt = x.get("format") or F.REEL
            return Candidate(**base | dict(title=f"More {t}: build on what already works", idea=f"Post another {fmt.value.lower().replace('_', ' ')} about {t}, featuring {offer}. In your own results, {metric_claim(x.get('metric'))}.", concept=f"Pick the {v.item} from your range that best fits '{t}'. Open on the result (the finished {v.item}), then show the detail people save. Keep the same structure as your best-performing post so you can compare fairly.", format=fmt, objective=sell, hook=f"The {t} post you keep coming back to, with something new", caption_direction=f"Lead with what is new about this {v.item}, name {offer}, keep the tone {p.brand_voice or 'warm and direct'}.", duration=15 if fmt == F.REEL else None))
        if seed.kind == "audience_question":
            theme = x.get("theme", "")
            if theme == "price":
                return Candidate(**base | dict(title=f"Price transparency: what each {v.item} costs", idea=f"A carousel listing {v.items} with their prices. {x.get('count', 'Several')} people have asked for prices in comments.", concept=f"One slide per {v.item}: clear photo, name, price. Last slide: how to order. Answering the question before it is asked reduces the back-and-forth in comments and DMs.", format=F.CAROUSEL, objective=sell, hook="You asked how much. Here is every price.", caption_direction=f"List the prices in the caption too, so the post is searchable. Mention {offer}.", tags=["audience_driven"]))
            if theme in {"where to buy or find", "delivery or booking", "timing or availability"}:
                return Candidate(**base | dict(title="How to buy from us: order, book or visit in 20 seconds", idea=f"A short Reel that answers 'where can I buy this?'{place}: where we are, how to order, delivery or booking, opening times.", concept="Film a quick walkthrough: storefront or kitchen, the ordering steps, the answer to delivery and timing. Put the key facts on screen. Pin the post.", format=F.REEL, objective=lead, hook="Where can you buy this? Here is exactly how.", caption_direction="State the location, ordering steps and hours as plain text. End with one clear action.", duration=20, tags=["audience_driven"]))
            if theme == "colour or size":
                return Candidate(**base | dict(title=f"Every colour and size of {offer} in one post", idea=f"A carousel showing the available colours and sizes of {offer}, because commenters keep asking if it comes in others.", concept="One slide per variant on a plain background, with the size range on the last slide. Mention what is in stock now.", format=F.PRODUCT_SHOWCASE, objective=sell, hook=f"Yes, {offer} comes in more than one colour", caption_direction="List the options as text. Say how to ask for a variant you do not see.", tags=["audience_driven"]))
            return Candidate(**base | dict(title=f"Answering your most asked question about {offer}: {theme or t}", idea=f"An FAQ-style post that answers the question about '{theme or t}' that keeps coming up in comments.", concept="State the question as it was asked, answer it in one line, then show it. Add the next two most common questions as extra slides.", format=F.EDUCATIONAL_POST, objective=O.AUDIENCE_EDUCATION, hook="You keep asking this, so here is the answer", caption_direction="Quote the question, give the short answer, point to where to learn more.", tags=["audience_driven"]))
        if seed.kind == "audience_request":
            return Candidate(**base | dict(title=f"The {t} video your audience asked for", idea=f"Make a Reel about {t}. People have asked for it in comments.", concept=f"Show {t} step by step using {offer}. Say at the start that this is by request, and thank the people who asked.", format=F.TUTORIAL, objective=O.ENGAGEMENT if O.ENGAGEMENT in goals else sell, hook=f"You asked, so here is {t}", caption_direction="Credit the request, give the steps in the caption for saving, ask what to cover next.", duration=30, tags=["audience_driven"], cta="Tell us in the comments what to show next"))
        if seed.kind == "audience_pain":
            return Candidate(**base | dict(title=f"Addressing a concern about {offer} before it costs you a customer", idea="Some commenters describe a problem, such as delivery time, quality or results. Answer it openly in a post.", concept=f"Show how you handle it: your process, your checks, your delivery promise, a real fix. No excuses, no defensiveness, only what you actually do. Use a behind-the-scenes look at {offer}.", format=F.BEHIND_THE_SCENES, objective=O.BRAND_AWARENESS, hook="Here is how we make sure this goes right", caption_direction="Be specific and factual. Only state promises you keep.", duration=20, tags=["audience_driven"], risks=["Make only promises you can keep. Do not mention individual customers."]))
        if seed.kind == "trend":
            tr = x["trend"]
            return Candidate(**base | dict(title=f"Our take on: {tr.title}", idea=f"A Reel connecting '{tr.title}' to {offer}. This is a sourced, currently verified trend ({tr.source_name}).", concept=f"Show how '{tr.title}' shows up in your own range. Be honest that it is a trend and show your own angle, so it does not read as a copy.", format=F.REEL, objective=O.REACH, hook=f"{tr.title}? We tried it with {offer}", caption_direction="Name the trend plainly. Do not claim it is going viral.", duration=15, tags=["trend_driven"], hashtags=list(tr.hashtags), risks=[f"Trend verified {tr.verified_date}. Re-check before posting if it takes more than a few days."]))
        if seed.kind == "festival":
            fe = x["festival"]
            return Candidate(**base | dict(title=f"{fe.name}: {v.plural_hook} from {offer}", idea=f"A festive {v.collection} post for {fe.name} ({fe.date}), built around {offer}.", concept=f"Open with the festive hero {v.item}, then show 3 ways customers use it for {fe.name}. Mention gifting or family occasions if they fit. Show what is available and how to order{place}.", format=F.PRODUCT_SHOWCASE, objective=sell, hook=f"Ready for {fe.name}? Start here", caption_direction=f"Name {fe.name}, the {v.collection}, and the last day to order in time.", tags=["festival_driven", "promotional"], risks=festival_risks(fe), festival_name=fe.name))
        if seed.kind == "competitor":
            k, n, mine, total = x.get("k", 1), x.get("n", 1), x.get("your_posts", 0), x.get("my_total", 0)
            risks = ["Based on public posts only, and on a small number of them." if k < 3 else "Based on public posts only.", *(["The competitor data is FICTIONAL sample data."] if x.get("sample") else [])]
            if k >= 2:
                return Candidate(**base | dict(title=f"Start a weekly {t} series", idea=f"{k} of {n} similar accounts keep posting about {t} and you have {mine} of your {total} posts on it. A weekly series would make {t} a regular part of your content.", concept=f"Pick one fixed day and one format. Each week show a different part of your own {t} using {offer}: real people, real work, no scripts. Keep the title card the same so people recognise it.", format=F.REEL, objective=O.BRAND_AWARENESS, hook=f"{t.title()}, every week: episode 1", caption_direction="Name the series and the day it returns. Say what is different about your version. Do not mention other accounts.", duration=20, tags=["competitor_gap"], risks=risks))
            return Candidate(**base | dict(title=f"Cover a topic a nearby account keeps posting about: {t}", idea=f"Post about {t}. A similar account returns to it repeatedly and you have {mine} of your {total} posts on it.", concept=f"Do it your way: show {offer} and what makes your version different (quality, price, care). The aim is to be present on a topic your audience also sees elsewhere.", format=F.CAROUSEL, objective=O.BRAND_AWARENESS, hook=f"{t.title()}, the way we do it", caption_direction="Say what is different about your approach. Do not mention the other accounts.", tags=["competitor_gap"], risks=risks))
        # evergreen
        angle = x.get("angle", "spotlight")
        subject = x.get("subject") or offer
        if angle == "bts":
            return Candidate(**base | dict(title=f"Behind the scenes: how {subject} is made", idea=f"A Reel showing how {subject} is made or prepared, with the people who do it.", concept="Short clips of the real process: materials, hands at work, the finished result. Name the maker. People trust what they can see.", format=F.BEHIND_THE_SCENES, objective=O.BRAND_AWARENESS, hook=f"Ever wondered how {subject} is made?", caption_direction="One true detail about the craft. Keep it simple.", duration=20, tags=["evergreen"]))
        if angle == "ugc":
            return Candidate(**base | dict(title=f"Customers with {subject}: a community post", idea=f"Feature real customers using {subject}, with their permission, and invite more.", concept="Collect two or three photos or clips sent by customers. Ask permission, credit them, add a line about why they chose it.", format=F.UGC_CONCEPT, objective=O.COMMUNITY_BUILDING, hook=f"This is what our customers did with {subject}", caption_direction="Thank and tag the customers. Invite others to share.", tags=["evergreen"], cta="Send us your photo and we may feature it"))
        if angle == "faq":
            return Candidate(**base | dict(title=f"5 things to know before you buy {subject}", idea=f"A carousel that answers what people usually want to know about {subject}.", concept="Five slides: what it is, what it is made of, sizes or portions, care or storage, how to order. Only use facts you can stand behind.", format=F.EDUCATIONAL_POST, objective=O.AUDIENCE_EDUCATION, hook=f"Before you order {subject}, read this", caption_direction="Use the same five points as text so people can save and search them.", tags=["evergreen"]))
        return Candidate(**base | dict(title=f"Spotlight: {subject}", idea=f"A focused showcase of {subject}: why it exists and who it suits.", concept="One strong hero shot, two detail shots, one in-use shot. Say one honest reason to choose it.", format=F.PRODUCT_SHOWCASE, objective=sell, hook=f"Meet {subject}", caption_direction=f"Describe {subject} in plain words and say how to get it.", tags=["evergreen", "promotional"]))
