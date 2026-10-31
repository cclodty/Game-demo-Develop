"""Every prop of the teahouse look-dev (TASKS.md G⓪b): its id, and the function here that makes its parts in an empty
scene. build.py builds them all (or those named) into godot/lookdev/models/<id>.glb; open.py opens one to work on."""

# id: (module, function, arguments)
PROPS = {
    "shell": ("shell", "build", {}),
    "table_set": ("table_set", "build", {}),
    "trolley": ("furniture", "trolley", {}),
    "altar": ("furniture", "altar", {}),
    "counter": ("furniture", "counter", {}),
    "fish_tank": ("furniture", "fish_tank", {}),
    "tea_urn": ("furniture", "tea_urn", {}),
    "plant": ("furniture", "plant", {}),
    "screen": ("furniture", "screen", {}),
    "window": ("wall_decor", "window", {}),
    "menu_boards": ("wall_decor", "menu_boards", {}),
    "plaque": ("wall_decor", "plaque", {}),
    "lantern": ("wall_decor", "lantern", {}),
    "scroll_yumcha": ("wall_decor", "scroll", {"words": "一盅兩件"}),
    "scroll_tea": ("wall_decor", "scroll", {"words": "茶香四溢"}),
    "clock": ("wall_decor", "clock", {}),
}
