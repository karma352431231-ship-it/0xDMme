import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    'fusion_policy', ROOT / 'infra/public-moderation/fusion_policy.py')
policy = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(policy)


def context(**changes):
    view = {
        'covered': 0.5, 'exposed_anatomy': 0.2, 'painting_nudity': 0.1,
        'sex_act': 0.15, 'simulated_act_pose': 0.1,
        'style_painting': 0.2, 'style_photo': 0.6, 'style_illustration': 0.2,
    }
    return view | changes


def generic(porn=0.02, hentai=0.01):
    return {'safe': 1 - porn - hentai, 'porn': porn, 'hentai': hentai,
            'sexy': 0, 'drawing': 0}


class FusionPolicyTests(unittest.TestCase):
    def test_simulated_act_is_prohibited_even_when_generic_detector_says_safe(self):
        view = context(simulated_act_pose=0.8)
        for count in (2, 4):
            self.assertEqual(policy.classify([view] * count, [generic()] * count)['verdict'],
                             'reject')

    def test_one_suspicious_view_prevents_permission_without_punitive_consensus(self):
        views = [context(), context(simulated_act_pose=0.8)]
        self.assertEqual(policy.classify(views, [generic()] * 2)['verdict'], 'hold')

    def test_generic_disagreement_only_yields_to_strong_consistent_negative_context(self):
        self.assertEqual(policy.classify([context()] * 2, [generic(0.7)] * 2)['verdict'], 'allow')
        for views, nano in (
                ([context(), context(simulated_act_pose=0.49)], [generic(0.7)] * 2),
                ([context()] * 2, [generic(0.99)] * 2)):
            self.assertEqual(policy.classify(views, nano)['verdict'], 'hold')

    def test_weak_negative_context_requires_low_generic_score_and_never_allows_a_tie(self):
        negative = context(simulated_act_pose=0.499)
        self.assertEqual(policy.classify([negative] * 2, [generic(0.001, 0)] * 2)['verdict'], 'allow')
        for view, nano in ((negative, generic(0.3)),
                           (context(simulated_act_pose=0.5), generic(0.001, 0)),
                           (context(simulated_act_pose=0.501), generic(0.001, 0))):
            self.assertEqual(policy.classify([view] * 2, [nano] * 2)['verdict'], 'hold')

    def test_painting_exempts_anatomy_but_not_actual_or_simulated_acts(self):
        painting = context(painting_nudity=0.75, exposed_anatomy=0.8,
                           style_painting=0.7, style_photo=0.2)
        self.assertEqual(policy.classify([painting] * 2, [generic(0.99)] * 2)['verdict'], 'allow')
        for field in ('sex_act', 'simulated_act_pose'):
            explicit = painting | {field: 0.9}
            self.assertEqual(policy.classify([explicit] * 2, [generic(0.99)] * 2)['verdict'], 'reject')

    def test_corroborated_exposed_anatomy_is_rejected(self):
        view = context(exposed_anatomy=0.65)
        self.assertEqual(policy.classify([view] * 2, [generic(0.99)] * 2)['verdict'], 'reject')

    def test_incomplete_nonfinite_or_invalid_probability_evidence_never_gets_a_verdict(self):
        invalid_contexts = [context(covered=True), context(sex_act=float('nan')),
                            context(simulated_act_pose=float('inf')), context(exposed_anatomy=2)]
        for invalid in invalid_contexts:
            with self.assertRaises(ValueError):
                policy.classify([invalid] * 2, [generic()] * 2)
        for views, nano in (([context()], [generic()]), ([context()] * 2, [generic()]),
                            ([context()] * 2, [generic() | {'safe': 0.99}] * 2),
                            ([{}] * 2, [generic()] * 2)):
            with self.assertRaises(ValueError):
                policy.classify(views, nano)


if __name__ == '__main__':
    unittest.main()
