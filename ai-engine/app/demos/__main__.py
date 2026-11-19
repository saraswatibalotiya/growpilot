"""    python -m app.demos --demo restaurant            # one demo
    python -m app.demos --all                       # all five
    python -m app.demos --report                    # rewrite docs/RECOMMENDATION_QUALITY.md
    python -m app.demos --demo restaurant --as-of 2026-12-20 --count 5
All data is FICTIONAL SAMPLE DATA."""

import argparse
from datetime import date

from app.demos.datasets import EVAL_DATE, LABEL
from app.demos.runner import DEMO_KEYS, run_demo


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--demo", choices=DEMO_KEYS)
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--with-competitors", action="store_true", help="restaurant demo only: add three FICTIONAL active competitors and one quiet one, and thin out the restaurant's own kitchen posts")
    ap.add_argument("--report", action="store_true", help="write docs/RECOMMENDATION_QUALITY.md")
    ap.add_argument("--as-of", type=date.fromisoformat, default=EVAL_DATE)
    ap.add_argument("--count", type=int, default=4, choices=[3, 4, 5])
    args = ap.parse_args()
    if args.report:
        from app.demos.report import write_report

        print(f"wrote {write_report()}")
        return
    keys = DEMO_KEYS if args.all else ([args.demo] if args.demo else [])
    if not keys:
        ap.print_help()
        return
    print(f"{LABEL}\nEvaluation date: {args.as_of}\n")
    for key in keys:
        container = None
        if args.with_competitors and key == "restaurant":
            from app.demos.competitors import add_demo_competitors, thin_out_kitchen_posts
            from app.demos.runner import load_demo, make_container

            container = make_container()
            pid0 = load_demo(container, key)
            removed = thin_out_kitchen_posts(container, pid0)
            print(f"  (demo setup: {removed} of the restaurant's own behind-the-scenes posts removed so the gap exists)")
            add_demo_competitors(container, pid0, as_of=args.as_of, include_inactive=True)
            for gap in container.competitors.landscape(pid0, args.as_of).gaps:
                print(f"  competitor gap: {gap}")
        _, pid, recs, notes = run_demo(key, as_of=args.as_of, count=args.count, container=container) if container is None else (container, pid0, *container.recommendations.generate(__import__("app.schemas.recommendation", fromlist=["GenerateRequest"]).GenerateRequest(profile_id=pid0, as_of=args.as_of, count=args.count)))
        print(f"=== {key} ({pid})")
        for n in notes:
            print(f"  note: {n}")
        for r in recs:
            print(f"  opp {r.opportunity_score:3d} | conf {r.confidence_score:3d} | {r.format.value:16s} | {r.title}")
            for c in r.risks_and_caveats:
                print(f"        caveat: {c}")
        print()


main()
