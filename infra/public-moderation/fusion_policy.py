"""Experimental fusion policy: generic NSFW scores are not the product policy.

Inputs are complete canonical views, never source names or expected labels.
Keep actual/simulated acts separate from clothing and the painting exception.
This module does not approve a media sequence or activate a runtime.
"""
import math

CONTEXT_KEYS = (
    'covered', 'exposed_anatomy', 'painting_nudity', 'sex_act',
    'simulated_act_pose', 'style_painting', 'style_photo', 'style_illustration',
)
NANO_KEYS = ('safe', 'hentai', 'porn', 'sexy', 'drawing')

# Calibrated hypotheses, not probabilities or claims about population errors.
STRONG_SAFE_CONTEXT = -0.035
GENERIC_DISAGREEMENT_LIMIT = 0.75
LOW_GENERIC_SCORE = 0.1
BASELINE_CONTEXT = -0.005
BASELINE_GENERIC_LIMIT = 0.2
STRONG_GENERIC_SCORE = 0.95
CORROBORATED_EXPOSURE = 0.015
CONSENSUS_ACT = 0.04


def _check_views(context, nano):
    if (not isinstance(context, (list, tuple)) or len(context) not in (2, 4)
            or not isinstance(nano, (list, tuple)) or len(nano) != len(context)):
        raise ValueError('Complete paired canonical views required.')
    for view in context:
        _check_scores(view, CONTEXT_KEYS, -1, 1)
    for view in nano:
        _check_scores(view, NANO_KEYS, 0, 1)
        if abs(sum(view[key] for key in NANO_KEYS) - 1) > 0.00001:
            raise ValueError('Invalid generic score distribution.')


def _check_scores(view, keys, lower, upper):
    if not isinstance(view, dict):
        raise ValueError('Invalid inference view.')
    for key in keys:
        value = view.get(key)
        if (type(value) not in (int, float) or not math.isfinite(value)
                or not lower <= value <= upper):
            raise ValueError('Invalid inference score.')


def _painting_without_act(context, acts):
    return max(acts) <= -0.02 and all(
        view['style_painting'] - max(view['style_photo'], view['style_illustration']) >= 0.04
        and view['painting_nudity'] > view['covered']
        for view in context
    )


def classify(context, nano):
    """Return allow/hold/reject; malformed or incomplete evidence raises."""
    _check_views(context, nano)
    margins = [
        max(view['sex_act'], view['simulated_act_pose'], view['exposed_anatomy'])
        - view['covered'] for view in context
    ]
    acts = [
        max(view['sex_act'], view['simulated_act_pose'])
        - max(view['covered'], view['painting_nudity']) for view in context
    ]
    generic = max(max(view['porn'], view['hentai']) for view in nano)

    if _painting_without_act(context, acts):
        verdict, route = 'allow', 'painting-exempts-anatomy-not-acts'
    elif generic >= STRONG_GENERIC_SCORE and max(margins) >= CORROBORATED_EXPOSURE:
        verdict, route = 'reject', 'corroborated-exposure'
    elif min(acts) >= CONSENSUS_ACT:
        verdict, route = 'reject', 'consensus-actual-or-simulated-act'
    elif max(margins) <= STRONG_SAFE_CONTEXT and generic < GENERIC_DISAGREEMENT_LIMIT:
        verdict, route = 'allow', 'strong-safe-context-with-bounded-generic-disagreement'
    elif max(margins) < 0 and generic < LOW_GENERIC_SCORE:
        verdict, route = 'allow', 'negative-context-with-low-generic-score'
    elif max(margins) <= BASELINE_CONTEXT and generic < BASELINE_GENERIC_LIMIT:
        verdict, route = 'allow', 'covered-baseline'
    else:
        verdict, route = 'hold', 'uncertain-or-disagreement'
    return {'verdict': verdict, 'route': route, 'margins': margins}
