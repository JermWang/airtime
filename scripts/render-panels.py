"""
Renders the four panel images for the front page, in Blender, with Cycles.

Run through `pnpm art:build`, which writes the content textures first (the
printed receipt, the price board) and then calls this. Blender does the part a
drawing cannot: real light, real materials, real depth of field. The designed
content stays vector-crisp because it arrives as a texture and is lit rather
than redrawn.

    blender -b --factory-startup -P scripts/render-panels.py -- <texdir> <outdir> <logo> [scene ...]

Everything is built from primitives in this file, so there is no .blend to keep
in sync and no asset to license.
"""

import math
import os
import sys

import bpy
from mathutils import Vector

ARGS = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
TEX_DIR, OUT_DIR, LOGO = ARGS[0], ARGS[1], ARGS[2]
WANTED = ARGS[3:] or ["clock", "honesty", "treasury", "room"]

W, H = 1000, 1250
SAMPLES = int(os.environ.get("PANEL_SAMPLES", "160"))

SIGNAL = (0.63, 1.0, 0.0, 1.0)  # #ccff00 in linear-ish terms, kept vivid


# --------------------------------------------------------------------------- #
#  helpers                                                                     #
# --------------------------------------------------------------------------- #


def reset(name):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 8
    sc.render.resolution_x, sc.render.resolution_y = W, H
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.render.image_settings.file_format = "PNG"
    sc.render.filepath = os.path.join(OUT_DIR, name + ".png")
    try:
        sc.view_settings.view_transform = "AgX"
        sc.view_settings.look = "AgX - High Contrast"
    except Exception:
        pass
    return sc


def world(color=(0.004, 0.005, 0.006), strength=1.0, volume=0.0):
    wd = bpy.data.worlds.new("W")
    bpy.context.scene.world = wd
    wd.use_nodes = True
    nt = wd.node_tree
    bg = nt.nodes.get("Background")
    bg.inputs[0].default_value = (*color, 1)
    bg.inputs[1].default_value = strength
    if volume > 0:
        # A hair of scatter so light from the screen has something to travel through.
        scat = nt.nodes.new("ShaderNodeVolumeScatter")
        scat.inputs["Density"].default_value = volume
        scat.inputs["Anisotropy"].default_value = 0.3
        nt.links.new(scat.outputs[0], nt.nodes["World Output"].inputs["Volume"])


def mat(name, base=(0.02, 0.02, 0.024), metallic=0.0, rough=0.5, emit=None, emit_strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]

    def put(key, value):
        if key in b.inputs:
            b.inputs[key].default_value = value

    put("Base Color", (*base, 1))
    put("Metallic", metallic)
    put("Roughness", rough)
    if emit is not None:
        put("Emission Color", (*emit, 1))
        put("Emission Strength", emit_strength)
    return m


def give(obj, m):
    obj.data.materials.clear()
    obj.data.materials.append(m)
    return obj


def box(size, loc, rot=(0, 0, 0), bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.scale = size
    if bevel:
        b = o.modifiers.new("bev", "BEVEL")
        b.width = bevel
        b.segments = 3
        b.limit_method = "ANGLE"
    return o


def plane(size, loc, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.scale = (size[0], size[1], 1)
    return o


def area_light(loc, energy, size=3.0, color=(1, 1, 1), rot=(0, 0, 0)):
    bpy.ops.object.light_add(type="AREA", location=loc, rotation=rot)
    L = bpy.context.object
    L.data.energy = energy
    L.data.size = size
    L.data.color = color
    return L


def camera(loc, look_at, lens=50, fstop=2.8, focus=None):
    bpy.ops.object.camera_add(location=loc)
    cam = bpy.context.object
    cam.data.lens = lens
    d = Vector(look_at) - Vector(loc)
    dist = d.length
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    cam.data.dof.use_dof = True
    cam.data.dof.focus_distance = focus if focus is not None else dist
    cam.data.dof.aperture_fstop = fstop
    bpy.context.scene.camera = cam
    return cam


def image_material(name, path, emit_strength=0.0, rough=0.6, metallic=0.0):
    """A material whose colour comes from a file, optionally self-lit."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(path)
    tex.interpolation = "Cubic"
    nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
    if "Roughness" in b.inputs:
        b.inputs["Roughness"].default_value = rough
    if "Metallic" in b.inputs:
        b.inputs["Metallic"].default_value = metallic
    if emit_strength > 0:
        nt.links.new(tex.outputs["Color"], b.inputs["Emission Color"])
        b.inputs["Emission Strength"].default_value = emit_strength
    return m


# --------------------------------------------------------------------------- #
#  01 · the clock — a price board on a dark wall                               #
# --------------------------------------------------------------------------- #


def scene_clock():
    sc = reset("clock")
    world((0.003, 0.004, 0.005), 1.0, volume=0.0022)

    # Polished floor: the board's own light is most of what you see.
    give(plane((26, 26), (0, 0, 0)), mat("floor", (0.012, 0.013, 0.015), 0.35, 0.14))
    give(plane((26, 14), (0, 7.6, 6.9), (math.pi / 2, 0, 0)), mat("wall", (0.016, 0.017, 0.02), 0.1, 0.62))

    # The board, angled so it recedes.
    board = plane((5.6, 7.0), (0.35, 6.9, 3.9), (math.pi / 2, 0, -0.22))
    give(board, image_material("board", os.path.join(TEX_DIR, "board.png"), emit_strength=3.4, rough=0.3))

    frame = box((5.86, 0.16, 7.26), (0.35, 7.05, 3.9), (0, 0, -0.22), bevel=0.02)
    give(frame, mat("frame", (0.03, 0.032, 0.036), 0.9, 0.28))

    area_light((-6, 1.5, 6), 340, 5, (0.72, 0.79, 0.9), rot=(0.7, 0, -0.9))
    area_light((6.5, 4.0, 2.2), 160, 3, (0.8, 1.0, 0.2), rot=(1.3, 0, 1.5))

    camera((-2.9, -2.4, 2.15), (0.4, 6.6, 3.5), lens=40, fstop=2.2, focus=9.2)


# --------------------------------------------------------------------------- #
#  03 · honesty — a printed receipt on a desk                                  #
# --------------------------------------------------------------------------- #


def scene_honesty():
    sc = reset("honesty")
    world((0.004, 0.004, 0.005), 1.0)

    give(plane((14, 14), (0, 0, 0)), mat("desk", (0.014, 0.015, 0.017), 0.25, 0.34))

    # The slip, with a real curl: the sheet is bent by hand, not drawn flat.
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=48, y_subdivisions=64, size=1, location=(0, 0, 0.004))
    paper = bpy.context.object
    paper.scale = (0.62, 1.32, 1)
    bpy.ops.object.transform_apply(scale=True)
    for v in paper.data.vertices:
        t = v.co.y / 1.32
        v.co.z += 0.055 * math.cos(t * 2.4) + 0.02 * math.sin(t * 5.1)
    paper.rotation_euler = (0, 0, -0.16)
    bpy.ops.object.shade_smooth()
    pm = image_material("paper", os.path.join(TEX_DIR, "receipt.png"), rough=0.58)
    b = pm.node_tree.nodes["Principled BSDF"]
    if "Subsurface Weight" in b.inputs:
        b.inputs["Subsurface Weight"].default_value = 0.12
    give(paper, pm)

    # A second slip, out of focus behind.
    other = plane((0.5, 1.1), (0.72, 0.42, 0.002), (0, 0, 0.5))
    give(other, mat("slip", (0.09, 0.095, 0.1), 0.0, 0.72))

    area_light((-1.9, 1.5, 2.2), 190, 1.6, (1.0, 0.97, 0.92), rot=(0.72, 0, -0.85))
    area_light((1.7, -1.2, 0.85), 26, 1.2, (0.8, 1.0, 0.25), rot=(1.2, 0, 2.3))

    camera((-0.34, -1.28, 1.16), (0.0, 0.06, 0.06), lens=58, fstop=2.0, focus=1.62)


# --------------------------------------------------------------------------- #
#  04 · treasury — a vault door carrying the mark                              #
# --------------------------------------------------------------------------- #


def scene_treasury():
    sc = reset("treasury")
    world((0.004, 0.004, 0.005), 1.0)

    give(plane((22, 14), (0, 3.4, 3.0), (math.pi / 2, 0, 0)), mat("backwall", (0.012, 0.013, 0.015), 0.1, 0.75))

    steel = mat("steel", (0.055, 0.058, 0.063), 1.0, 0.32)

    bpy.ops.mesh.primitive_cylinder_add(radius=2.35, depth=0.55, location=(0, 0.9, 2.6), rotation=(math.pi / 2, 0, 0), vertices=128)
    give(bpy.context.object, steel)
    bpy.ops.object.shade_auto_smooth()

    # Concentric machined rings.
    for i, r in enumerate((2.0, 1.62, 1.26)):
        bpy.ops.mesh.primitive_torus_add(align="WORLD", location=(0, 0.6, 2.6), rotation=(math.pi / 2, 0, 0), major_radius=r, minor_radius=0.035, major_segments=128)
        give(bpy.context.object, mat(f"ring{i}", (0.08, 0.084, 0.09), 1.0, 0.22))

    # Bolt heads around the rim.
    for i in range(16):
        a = (i / 16) * math.tau
        bpy.ops.mesh.primitive_cylinder_add(radius=0.075, depth=0.14, location=(math.cos(a) * 2.16, 0.58, 2.6 + math.sin(a) * 2.16), rotation=(math.pi / 2, 0, 0), vertices=24)
        give(bpy.context.object, mat("bolt", (0.1, 0.104, 0.112), 1.0, 0.26))
        bpy.ops.object.shade_auto_smooth()

    # The mark, inlaid: the logo's white areas become polished metal against the
    # brushed field, so it reads as engraved rather than printed on.
    emblem = plane((2.02, 1.09), (0, 0.573, 2.66), (math.pi / 2, 0, 0))
    m = bpy.data.materials.new("emblem")
    m.use_nodes = True
    nt = m.node_tree
    out = nt.nodes["Material Output"]
    for n in list(nt.nodes):
        if n.type == "BSDF_PRINCIPLED":
            nt.nodes.remove(n)
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(LOGO)
    tex.interpolation = "Cubic"
    dark = nt.nodes.new("ShaderNodeBsdfPrincipled")
    dark.inputs["Base Color"].default_value = (0.055, 0.058, 0.063, 1)
    dark.inputs["Metallic"].default_value = 1.0
    dark.inputs["Roughness"].default_value = 0.32
    bright = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bright.inputs["Base Color"].default_value = (0.86, 0.89, 0.93, 1)
    bright.inputs["Metallic"].default_value = 1.0
    bright.inputs["Roughness"].default_value = 0.07
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(tex.outputs["Color"], mix.inputs["Fac"])
    nt.links.new(dark.outputs[0], mix.inputs[1])
    nt.links.new(bright.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    give(emblem, m)

    area_light((-4.2, -3.0, 6.4), 900, 4.5, (0.78, 0.84, 0.94), rot=(0.78, 0, -0.62))
    area_light((4.6, -1.2, 2.2), 260, 2.4, (0.82, 1.0, 0.25), rot=(1.45, 0, 1.15))
    area_light((0, -4.5, 1.0), 120, 3.0, (0.6, 0.66, 0.78), rot=(1.2, 0, 0))

    camera((-1.35, -4.6, 2.05), (0, 0.6, 2.62), lens=62, fstop=2.4, focus=5.5)


# --------------------------------------------------------------------------- #
#  05 · the room — one lit screen, an auditorium in front of it                #
# --------------------------------------------------------------------------- #


def scene_room():
    sc = reset("room")
    world((0.0008, 0.0008, 0.001), 1.0, volume=0.0022)

    give(plane((40, 40), (0, 6, -0.2)), mat("carpet", (0.004, 0.004, 0.005), 0.0, 0.95))
    give(plane((26, 12), (0, 16.4, 4.2), (math.pi / 2, 0, 0)), mat("frontwall", (0.005, 0.0055, 0.0065), 0.0, 0.88))
    # Close the room in, so the light has walls to fall off against.
    give(plane((26, 40), (-9.2, 6, 4.2), (0, math.pi / 2, 0)), mat("sidewallL", (0.005, 0.0055, 0.0065), 0.0, 0.9))
    give(plane((26, 40), (9.2, 6, 4.2), (0, math.pi / 2, 0)), mat("sidewallR", (0.005, 0.0055, 0.0065), 0.0, 0.9))
    give(plane((26, 40), (0, 6, 8.4), (math.pi, 0, 0)), mat("ceiling", (0.004, 0.004, 0.005), 0.0, 0.95))

    # The screen is the only real light in the room.
    scr = plane((8.6, 4.85), (0, 16.1, 4.3), (math.pi / 2, 0, 0))
    give(scr, mat("screen", (1, 1, 1), 0, 0.5, emit=(0.74, 0.85, 0.55), emit_strength=4.6))
    give(box((8.9, 0.14, 5.15), (0, 16.24, 4.3), bevel=0.02), mat("bezel", (0.02, 0.021, 0.024), 0.9, 0.3))

    seat_mat = mat("seat", (0.011, 0.011, 0.013), 0.0, 0.78)
    rows, per_row = 9, 13
    for r in range(rows):
        y = 2.4 + r * 1.12
        z = 0.92 - r * 0.052
        for i in range(per_row):
            x = (i - (per_row - 1) / 2) * 0.68
            # The rake curves: seats at the ends of a row sit slightly higher.
            lift = (abs(x) / 4.2) ** 2 * 0.26
            back = box((0.29, 0.13, 0.42), (x, y, z + lift), bevel=0.055)
            give(back, seat_mat)
            pad = box((0.29, 0.34, 0.075), (x, y - 0.2, z + lift - 0.24), bevel=0.03)
            give(pad, seat_mat)

    camera((0.55, 0.35, 2.32), (0, 15.6, 3.7), lens=34, fstop=1.8, focus=7.4)


# --------------------------------------------------------------------------- #

SCENES = {"clock": scene_clock, "honesty": scene_honesty, "treasury": scene_treasury, "room": scene_room}

for name in WANTED:
    fn = SCENES.get(name)
    if not fn:
        print("SKIP_UNKNOWN", name)
        continue
    fn()
    bpy.ops.render.render(write_still=True)
    print("PANEL_RENDERED", name)
print("ALL_PANELS_DONE")
