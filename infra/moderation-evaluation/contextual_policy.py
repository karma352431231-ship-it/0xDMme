"""Experimental calibration criteria, never an accepted application detector.

Inputs are independently computed contextual similarities, not confidence
probabilities. Human annotations, image identifiers and Nano scores are not
inputs to the decision. Runtime/model acceptance and inference are separate.
"""
import math

POLICY_ID = '0xdmme-contextual-calibration-2026-10-07-v1'
ALLOW_MARGIN = 0.004
BLOCK_MARGIN = 0.008
PAINTING_STYLE_MARGIN = 0.04
PAINTING_ALLOW_MARGIN = 0.01
CATEGORIES = (
    'covered', 'exposed_anatomy', 'painting_nudity', 'sex_act',
    'simulated_act_pose', 'style_painting', 'style_photo', 'style_illustration',
)


def _checked_views(views):
    if not isinstance(views, list) or len(views) != 2:
        raise ValueError('Two independent image views are required.')
    for view in views:
        if not isinstance(view, dict) or any(key not in view for key in CATEGORIES):
            raise ValueError('Complete contextual categories are required.')
        if any(type(view[key]) not in (int, float) or not math.isfinite(view[key])
               or abs(view[key]) > 1 for key in CATEGORIES):
            raise ValueError('Finite cosine similarities in [-1, 1] are required.')
    return views


def _style_margin(view):
    return view['style_painting'] - max(view['style_photo'], view['style_illustration'])


def _comparison(margins, allow_margin):
    if max(margins) <= -allow_margin:
        return 'allow-candidate'
    if min(margins) >= BLOCK_MARGIN:
        return 'block-candidate'
    return 'review'


def classify(siglip_views, clip_views):
    """Compare fixed SigLIP2/CLIP categories without inspecting annotations.

SigLIP2 uses native resize and the whole padded image; CLIP uses its center
crop and the whole padded image. Both views must agree on an automatic result.
Strong painting recognition only exempts exposed anatomy, never sexual acts.
An ambiguous painting style or contradictory view remains for review.
"""
    siglip_views = _checked_views(siglip_views)
    clip_views = _checked_views(clip_views)
    painting = all(_style_margin(view) >= PAINTING_STYLE_MARGIN
                   and view['painting_nudity'] > view['covered'] for view in clip_views)
    possible_painting = any(_style_margin(view) > 0 for view in siglip_views + clip_views)
    if painting:
        margins = [max(view['sex_act'], view['simulated_act_pose'])
                   - max(view['covered'], view['painting_nudity']) for view in siglip_views]
        decision = _comparison(margins, PAINTING_ALLOW_MARGIN)
        route = 'painting-without-anatomy-veto'
    elif possible_painting:
        return {'decision': 'review', 'route': 'ambiguous-painting-style', 'margins': []}
    else:
        margins = [max(view['exposed_anatomy'], view['sex_act'], view['simulated_act_pose'])
                   - view['covered'] for view in siglip_views]
        decision = _comparison(margins, ALLOW_MARGIN)
        route = 'covered-versus-prohibited'
    return {'decision': decision, 'route': route, 'margins': margins}
