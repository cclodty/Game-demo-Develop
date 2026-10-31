"""Builds every prop of the teahouse look-dev (TASKS.md G⓪b) into godot/lookdev/models/<id>.glb, and the triangle
and material counts into models/stats.json (the README's table). From the repository's root:

    blender -b --factory-startup -P godot/lookdev/blender/build.py            # every prop
    blender -b --factory-startup -P godot/lookdev/blender/build.py -- chair   # only the ids given

Each prop is a function here that makes its parts in an empty scene (PROPS); kit.finish joins and exports it.
"""

import importlib
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import kit  # noqa: E402
from props import PROPS  # noqa: E402


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ids = argv or list(PROPS)
    stats_path = os.path.join(kit.ROOT, "models", "stats.json")
    stats = {}
    if os.path.exists(stats_path):
        with open(stats_path) as f:
            stats = json.load(f)
    for prop_id in ids:
        module, function, args = PROPS[prop_id]
        kit.reset()
        getattr(importlib.import_module(module), function)(**args)
        s = kit.finish(prop_id)
        stats[prop_id] = {"tris": s["tris"], "materials": s["materials"]}
        print(f"built {prop_id}: {s['tris']} triangles, {len(s['materials'])} materials")
    with open(stats_path, "w") as f:
        json.dump({k: stats[k] for k in PROPS if k in stats}, f, indent=2, ensure_ascii=False)
        f.write("\n")


main()
