"""Policy invariants for the experimental, annotation-independent criteria."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('contextual_policy',
    Path(__file__).resolve().parents[1] / 'infra/moderation-evaluation/contextual_policy.py')
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)


def categories(**changes):
    values = dict.fromkeys(policy.CATEGORIES, 0.1)
    values.update(covered=0.7, painting_nudity=0.2, style_photo=0.5)
    values.update(changes)
    return values


class ContextualPolicyTest(unittest.TestCase):
    def decide(self, siglip, clip=None):
        return policy.classify(siglip, clip or [categories(), categories()])['decision']

    def test_clothes_and_covered_illustrations_can_be_allowed(self):
        view = categories(style_photo=0.2, style_illustration=0.6,
                          exposed_anatomy=0.55, simulated_act_pose=0.65)
        self.assertEqual(self.decide([view, view]), 'allow-candidate')

    def test_exposure_acts_and_simulation_are_each_prohibited_outside_painting(self):
        for category in ['exposed_anatomy', 'sex_act', 'simulated_act_pose']:
            with self.subTest(category=category):
                view = categories(**{category: 0.8})
                self.assertEqual(self.decide([view, view]), 'block-candidate')

    def test_painted_nudity_exempts_anatomy_but_never_sexual_acts(self):
        clip = categories(style_painting=0.7, style_photo=0.1,
                          painting_nudity=0.8)
        for act, expected in [(0.2, 'allow-candidate'), (0.85, 'block-candidate')]:
            with self.subTest(act=act):
                siglip = categories(painting_nudity=0.8, exposed_anatomy=0.9, sex_act=act)
                self.assertEqual(self.decide([siglip, siglip], [clip, clip]), expected)

    def test_painting_simulating_act_is_also_prohibited(self):
        clip = categories(style_painting=0.7, painting_nudity=0.8)
        siglip = categories(painting_nudity=0.8, simulated_act_pose=0.85)
        self.assertEqual(self.decide([siglip, siglip], [clip, clip]), 'block-candidate')

    def test_conflicting_rendering_stays_in_review(self):
        uncertain_art = categories(style_painting=0.51)
        self.assertEqual(self.decide([categories(), uncertain_art]), 'review')

    def test_one_prohibited_view_prevents_permission_and_one_safe_view_prevents_refusal(self):
        safe = categories()
        prohibited = categories(sex_act=0.85)
        self.assertEqual(self.decide([safe, prohibited]), 'review')
        self.assertEqual(self.decide([prohibited, safe]), 'review')

    def test_incomplete_invalid_or_nonfinite_inference_cannot_be_a_decision(self):
        for views in [[], [categories()], [categories(), {}],
                      [categories(sex_act=float('nan')), categories()],
                      [categories(covered=1.1), categories()],
                      [categories(covered=True), categories()]]:
            with self.subTest(views=views):
                with self.assertRaises(ValueError):
                    self.decide(views)


if __name__ == '__main__':
    unittest.main()
