"""Opens one of the teahouse's props in Blender to work on (TASKS.md G⓪c, godot/lookdev/MCP.md): its parts built
into the scene, not joined, as build.py would make them. From the repository's root, with Blender's window:

    blender --python godot/lookdev/blender/open.py -- table_set

Then, in Blender's Python console (or through Blender MCP), once the prop looks right:

    import kit; kit.finish("table_set", keep=True)

writes godot/lookdev/models/table_set.glb from what is visible in the scene and leaves the scene as it was.
"""

import importlib
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import kit  # noqa: E402
from props import PROPS  # noqa: E402

prop_id = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "table_set"
module, function, args = PROPS[prop_id]
kit.clear()
getattr(importlib.import_module(module), function)(**args)
print(f"opened {prop_id}: {len(bpy.context.scene.objects)} parts")
