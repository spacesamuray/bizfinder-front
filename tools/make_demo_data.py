"""Make the sample searches the web preview shows (site/app/demo/).

Every business here is made up: names, addresses and notes are invented, phone numbers
are masked, and websites and emails use .example addresses, which can't belong to anyone.
The spreadsheets are written and read back with Bizfinder's own code, so the preview gets
exactly what the app gets from a real search.

Run from the project folder:  .venv/bin/python site/tools/make_demo_data.py
"""

import json
import random
import re
import sys
import tempfile
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT))

from bizfinder import export, results  # noqa: E402
from bizfinder.models import Business  # noqa: E402

OUT = PROJECT / "site" / "app" / "demo"

CITIES = {
    "Tbilisi": ((41.7151, 44.8271), ["Rustaveli Ave", "Chavchavadze Ave", "Pekini Ave", "Kostava St", "Vazha-Pshavela Ave", "Agmashenebeli Ave", "Abashidze St", "Paliashvili St", "Tsereteli Ave"]),
    "Batumi": ((41.6417, 41.6367), ["Rustaveli St", "Chavchavadze St", "Gorgiladze St", "Baratashvili St", "Gogebashvili St", "Memed Abashidze Ave"]),
    "Kutaisi": ((42.2679, 42.6946), ["Rustaveli Ave", "Tsereteli St", "Paliashvili St", "Chavchavadze Ave", "Javakhishvili St"]),
}

# id, what was searched, city, source, Google types, category names, businesses, other results, words that pick it
DATASETS = [
    {
        "id": "flower-shop",
        "what": "flower shop",
        "city": "Tbilisi",
        "source": "Google Maps",
        "generated": "2026-11-09 18:20",
        "types": ["florist", "store"],
        "categories": ["Florist", "Florist", "Florist", "Market"],
        "names": ["Petal & Stem", "Bloom Corner", "Green Leaf Flowers", "Violet House", "Rosa Studio", "Lily Market", "Tulip Lane", "Orchid Room", "Daisy & Co", "Peony Point", "Sunflower Stand", "Magnolia", "Fern & Moss", "Little Garden", "Wild Poppy", "Iris Atelier", "Lavender Lane", "Camellia Corner", "Bouquet Box", "Blossom Bar", "Golden Tulip", "Rose Hill Flowers", "Stem Studio", "Flora Point"],
        "others": [("City Mall", "Shopping mall"), ("Fresh Market", "Supermarket"), ("Home Decor Store", "Furniture store")],
        "keywords": ["flower", "florist", "bouquet", "ყვავილ"],
    },
    {
        "id": "dentist",
        "what": "dentist",
        "city": "Tbilisi",
        "source": "Google Maps",
        "generated": "2026-11-08 11:05",
        "types": ["dentist", "health"],
        "categories": ["Dentist", "Dental clinic", "Dentist"],
        "names": ["Smile Studio", "Bright Dental", "White Pearl Clinic", "Dental Point", "Family Dental Care", "Clear Smile", "Tooth & Co", "Gentle Dental", "Smile Line", "Pearl Dental", "Dental Art", "Happy Teeth", "Dental House", "Implant Center One", "Kids Smile Dental", "Dental Garden", "Fresh Smile", "Dental Craft", "Healthy Smile", "Dental Studio 21", "Aqua Dental", "Dental Harmony", "Smile Factory", "Mint Dental", "Dentique", "Ortho Smile"],
        "others": [("Central Pharmacy", "Pharmacy"), ("Medical Center Plus", "Medical center")],
        "keywords": ["dent", "teeth", "tooth", "orthodont", "სტომატ", "კბილ"],
    },
    {
        "id": "beauty-salon",
        "what": "beauty salon",
        "city": "Batumi",
        "source": "Google Maps",
        "generated": "2026-11-06 16:40",
        "types": ["beauty_salon", "hair_care"],
        "categories": ["Beauty salon", "Hair salon", "Nail salon", "Beauty salon"],
        "names": ["Glow Studio", "Velvet Beauty Bar", "Nail Room", "Silk Hair Salon", "Bloom Beauty", "Lash & Brow", "Mirror Studio", "Pearl Beauty", "Curl Club", "Sea Breeze Salon", "Golden Comb", "Shine Studio", "Beauty Lab", "Coral Nails", "Luna Salon", "Rose Beauty House", "Style Point", "Ivy Beauty", "Bliss Salon", "Studio Aura"],
        "others": [("Fit Club", "Gym"), ("Cosmetics Corner", "Cosmetics store")],
        "keywords": ["beauty", "salon", "hair", "nail", "lash", "barber", "სილამაზ", "სალონ"],
    },
    {
        "id": "car-repair",
        "what": "car repair",
        "city": "Kutaisi",
        "source": "TomTom",
        "generated": "2026-11-04 09:30",
        "types": [],
        "categories": ["Car repair", "Car service", "Tyre service"],
        "names": ["Auto Fix", "Quick Garage", "Motor Point", "Car Doctor", "Wheel House", "Engine Pro", "Garage 24", "Auto Care Center", "Brake & Tyre", "Speed Service", "Tune Up Shop", "Gear Garage", "Auto Clinic", "Pit Stop Service", "Road Ready Repair", "Torque Garage", "Oil & Go", "Mechanic Hub"],
        "others": [],
        "keywords": ["car", "auto", "repair", "mechanic", "garage", "tyre", "tire", "ავტო", "მანქან"],
    },
]

# Call notes already in the preview, so its call features have something to show. Each goes
# to the next business with that kind of web presence, so the note fits the business.
NOTES = {
    "flower-shop": [
        ("none", {"status": "Somewhat interested", "contacted": ["Call", "WhatsApp"], "response": "Likes the idea of a site. Send them the demo on WhatsApp."}),
        ("social", {"status": "Interested", "contacted": ["Call"], "response": "Only has Instagram. Wants prices for a small site."}),
        ("none", {"status": "No answer", "contacted": ["Call"]}),
        ("social", {"status": "Call back", "contacted": ["Call"], "response": "Call after 6 pm, when the owner is in."}),
        ("broken", {"status": "Client", "contacted": ["Call", "Email", "In person"], "response": "Their old site was down. The new one goes live next week."}),
        ("own", {"status": "Not interested", "contacted": ["Call"], "response": "Happy with the site they have.", "improve": "Ask how their site works on phones first."}),
    ],
    "dentist": [
        ("none", {"status": "Interested", "contacted": ["Call", "Viber"], "response": "Wants online booking. Send examples on Viber."}),
        ("none", {"status": "Wrong number", "contacted": ["Call"]}),
        ("social", {"contacted": ["Instagram"], "response": "Wrote to them on Instagram, no reply yet."}),
    ],
}


def kind(b):
    """Web presence, as the app sorts it."""
    if b.has_website == "Yes":
        return "own" if b.website_status == "OK" else "broken"
    return "social" if b.has_website.startswith("Only") else "none"


def slug(text):
    return re.sub(r"\W+", "-", text.lower()).strip("-")


def masked_phone(rng):
    return f"5•• •• •• {rng.randint(10, 99)}"


def businesses_for(data):
    rng = random.Random(data["id"])  # the same sample every time
    (lat0, lng0), streets = CITIES[data["city"]]
    google = data["source"] == "Google Maps"
    found = []
    entries = [(name, None) for name in data["names"]] + list(data["others"])
    for i, (name, other_category) in enumerate(entries):
        s = slug(name)
        phone = masked_phone(rng)
        b = Business(
            place_id=f"demo-{data['id']}-{i:02d}",
            name=name,
            queries=[data["what"]],
            category=other_category or rng.choice(data["categories"]),
            address=f"{rng.randint(1, 140)} {rng.choice(streets)}, {data['city']}, Georgia",
            phone=phone if rng.random() > 0.08 else "",
            intl_phone=f"+995 {phone}",
            rating=round(rng.uniform(3.9, 5.0), 1) if google else None,
            reviews=rng.randint(3, 420) if google else None,
            status="Temporarily closed" if rng.random() < 0.04 else "Open",
            lat=round(lat0 + rng.uniform(-0.028, 0.028), 6),
            lng=round(lng0 + rng.uniform(-0.04, 0.04), 6),
            types=data["types"] if other_category is None else [slug(other_category).replace("-", "_")],
            relevant=other_category is None,
        )
        # Web presence, roughly as real searches turn out (TomTom knows fewer websites)
        r = rng.random()
        own_share = 0.3 if google else 0.14
        if r < own_share:
            b.has_website = "Yes"
            b.website = f"https://{s}.example"
            b.website_status = "OK" if rng.random() > 0.2 else rng.choice(["Domain doesn't exist", "Unreachable", "Timed out"])
            if b.website_status == "OK":
                if rng.random() < 0.7:
                    b.emails = [f"info@{s}.example"]
                b.socials = {"Facebook": f"https://facebook.example/{s}", "Instagram": f"https://instagram.example/{s}"}
                if rng.random() < 0.3:
                    b.socials["WhatsApp"] = "https://wa.example/demo"
        elif r < own_share + 0.24:
            b.has_website = "Only social page"
            b.website = f"https://instagram.example/{s}"
        elif r < own_share + 0.28:
            b.has_website = "Only listing page"
            b.website = f"https://listing.example/{s}"
        else:
            b.has_website = "No"
        found.append(b)
    return found


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp())
    results.OUTPUT = work  # read the spreadsheets back from here, not from output/
    index = {"datasets": [], "calls": {}}
    for data in DATASETS:
        where = f"{data['city']}, Georgia"
        title = f"{data['what']} in {where}"
        file = f"{slug(data['what'])}_{slug(where)}_{data['generated'][:10].replace('-', '')}-{data['generated'][11:].replace(':', '')}.xlsx"
        businesses = businesses_for(data)
        export.save(businesses, work / file, title, data["source"])
        read = results.read(file)
        read["generated"] = data["generated"]
        (OUT / f"{data['id']}.json").write_text(json.dumps(read, ensure_ascii=False, default=str), encoding="utf-8")
        (OUT / f"{data['id']}.xlsx").write_bytes((work / file).read_bytes())
        index["datasets"].append(
            {
                "id": data["id"],
                "file": file,
                "title": title,
                "what": data["what"],
                "where": where,
                "source": data["source"],
                "generated": data["generated"],
                "found": read["found"],
                "others": read["others"],
                "keywords": data["keywords"],
            }
        )
        used = set()
        for wanted, note in NOTES.get(data["id"], []):
            fits = [b for b in businesses if b.relevant and b.place_id not in used]
            b = next((b for b in fits if kind(b) == wanted), None) or next(b for b in fits if kind(b) == "none")
            used.add(b.place_id)
            at = f"{data['generated'][:10]}T{data['generated'][11:]}"
            call = {"name": b.name, "phone": b.phone, "search": title, "updatedAt": at, **note}
            if "status" in note:
                call.update(calledAt=at, history=[{"at": at, "status": note["status"]}])
            if "contacted" in note:
                call["contactedAt"] = at
            index["calls"][b.place_id] = call
        print(f"{title}: {read['found']} businesses, {read['others']} other results")
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
